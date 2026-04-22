import os
import tempfile
import threading
import logging
from typing import Optional
from concurrent.futures import ThreadPoolExecutor

_PIPELINE_SEMAPHORE = threading.Semaphore(4)

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZIPMiddleware
from pydantic import BaseModel, EmailStr
from dotenv import load_dotenv
from supabase import create_client

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)


class RetryableError(Exception):
    """Transient error — safe to retry automatically."""

class TerminalError(Exception):
    """Permanent error — do not retry."""

load_dotenv()

app = FastAPI(title="CallFlow API")

app.add_middleware(GZIPMiddleware, minimum_size=1000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

supabase = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_KEY"))


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: Optional[str] = None
    company: Optional[str] = None


@app.post("/auth/register", status_code=201)
async def register(req: RegisterRequest):
    import re
    if not re.search(r'[A-Z]', req.password) or \
       not re.search(r'[0-9]', req.password) or \
       not re.search(r'[^a-zA-Z0-9]', req.password) or \
       len(req.password) < 8:
        raise HTTPException(400, "Parola trebuie să aibă min 8 caractere, o majusculă, un număr și un caracter special")

    try:
        result = supabase.auth.sign_up({
            "email": req.email,
            "password": req.password,
            "options": {"data": {"full_name": req.full_name, "company": req.company}}
        })
    except Exception as e:
        msg = str(e).lower()
        if "already" in msg or "exists" in msg:
            raise HTTPException(400, "Email-ul există deja")
        logger.error(f"Register error: {e}")
        raise HTTPException(500, "Eroare la înregistrare")

    if not result.user:
        raise HTTPException(400, "Email-ul există deja")

    logger.info(f"New user registered: {req.email}")
    return {
        "user_id": result.user.id,
        "email": result.user.email,
        "token": result.session.access_token if result.session else None,
        "token_type": "Bearer"
    }


def _set_status(call_id: str, status: str, extra: dict = None):
    data = {"status": status}
    if extra:
        data.update(extra)
    supabase.table("calls").update(data).eq("id", call_id).execute()


def _run_pipeline(call_id: str, tmp_path: str):
    _PIPELINE_SEMAPHORE.acquire()
    try:
        from soniox_client import SonioxClient, analyze_transcript_segments, format_transcript_readable
        from helpers import anonymize_text, normalize, analyze_call

        # Step 1 — STT + upload audio to storage
        _set_status(call_id, "transcribing")

        ext = os.path.splitext(tmp_path)[1].lower()
        if ext not in {".wav", ".mp3", ".m4a", ".flac", ".ogg"}:
            raise TerminalError(f"Format audio nesuportat: {ext}")

        # Transcode to MP3 for universal browser playback (handles ADPCM, exotic codecs)
        mp3_path = tmp_path + ".mp3"
        try:
            import subprocess
            subprocess.run(
                ["ffmpeg", "-y", "-i", tmp_path, "-vn", "-ar", "22050", "-ac", "1", "-b:a", "64k", mp3_path],
                check=True, capture_output=True, timeout=120,
            )
        except FileNotFoundError:
            logger.warning("ffmpeg not installed — falling back to original file for playback")
            mp3_path = tmp_path
        except subprocess.CalledProcessError as e:
            logger.warning(f"ffmpeg transcode failed: {e.stderr.decode()[:200]} — using original")
            mp3_path = tmp_path

        use_mp3 = mp3_path.endswith(".mp3")
        storage_key = f"{call_id}.mp3" if use_mp3 else f"{call_id}{ext}"
        with open(mp3_path, "rb") as f:
            audio_bytes = f.read()
        mime = "audio/mpeg" if use_mp3 else {"wav":"audio/wav","mp3":"audio/mpeg","m4a":"audio/mp4","flac":"audio/flac","ogg":"audio/ogg"}.get(ext.lstrip("."), "audio/wav")

        try:
            supabase.storage.from_("call-audio").upload(storage_key, audio_bytes, {"content-type": mime, "upsert": "true"})
            audio_url = f"{os.getenv('SUPABASE_URL')}/storage/v1/object/public/call-audio/{storage_key}"
            supabase.table("calls").update({"audio_url": audio_url}).eq("id", call_id).execute()
        except Exception as e:
            raise RetryableError(f"Supabase Storage upload failed: {e}")
        finally:
            if use_mp3 and mp3_path != tmp_path:
                try: os.remove(mp3_path)
                except Exception: pass

        try:
            client = SonioxClient()
            transcript = client.transcribe(tmp_path)
        except Exception as e:
            msg = str(e).lower()
            if "timeout" in msg or "connection" in msg or "rate" in msg or "429" in msg:
                raise RetryableError(f"Soniox STT transient error: {e}")
            if "invalid" in msg or "format" in msg or "401" in msg or "403" in msg:
                raise TerminalError(f"Soniox STT permanent error: {e}")
            raise RetryableError(f"Soniox STT error: {e}")

        segments = analyze_transcript_segments(transcript)
        raw_text = format_transcript_readable(transcript)

        duration_ms = max((s["end_ms"] or 0) for s in segments if s["end_ms"]) if segments else None
        _set_status(call_id, "anonymizing", {"duration_ms": duration_ms, "speaker_count": len({s["speaker"] for s in segments if s["speaker"]})})

        # Step 2 — Anonymize
        anon_text, pii_map = anonymize_text(raw_text)

        try:
            pii_rows = [{"call_id": call_id, "original": k, "placeholder": v} for k, v in pii_map.items()]
            if pii_rows:
                supabase.table("pii_mappings").insert(pii_rows).execute()
        except Exception as e:
            raise RetryableError(f"DB insert pii_mappings failed: {e}")

        _set_status(call_id, "classifying", {"pii_count": len(pii_map)})

        # Step 3 — Classify
        try:
            conversation = normalize(anon_text)
        except Exception as e:
            msg = str(e).lower()
            if "429" in msg or "overloaded" in msg or "timeout" in msg:
                raise RetryableError(f"AI classify transient error: {e}")
            raise TerminalError(f"AI classify failed: {e}")

        turns = conversation.get("conversation", [])
        seg_rows = []
        for i, (seg, turn) in enumerate(zip(segments, turns)):
            seg_rows.append({
                "call_id": call_id,
                "position": i,
                "role": turn["role"],
                "speaker": seg.get("speaker"),
                "text": seg["text"],
                "start_ms": seg.get("start_ms"),
                "end_ms": seg.get("end_ms"),
                "duration_ms": seg.get("duration_ms"),
                "wpm": seg.get("wpm"),
                "confidence": turn.get("confidence"),
            })

        try:
            if seg_rows:
                supabase.table("segments").insert(seg_rows).execute()
        except Exception as e:
            raise RetryableError(f"DB insert segments failed: {e}")

        _set_status(call_id, "analyzing", {"segment_count": len(seg_rows)})

        # Step 4 — QA
        try:
            qa = analyze_call(conversation, anon_text)
        except Exception as e:
            msg = str(e).lower()
            if "429" in msg or "overloaded" in msg or "timeout" in msg:
                raise RetryableError(f"AI QA transient error: {e}")
            raise TerminalError(f"AI QA failed: {e}")

        cats = qa.get("categorii", {})
        try:
            supabase.table("qa_results").insert({
                "call_id": call_id,
                "scor_final": qa.get("scor_final"),
                "rezumat": qa.get("rezumat"),
                "empatie": qa.get("empatie"),
                "sentiment_client": qa.get("sentiment_client"),
                "scor_structura": cats.get("structura", {}).get("scor"),
                "scor_calitate": cats.get("calitate", {}).get("scor"),
                "scor_profesionalism": cats.get("profesionalism", {}).get("scor"),
                "scor_ritm": cats.get("ritm_livrare", {}).get("scor"),
                "scor_penalizari": cats.get("penalizari", {}).get("scor"),
                "penalizari_detalii": cats.get("penalizari", {}).get("motive", []),
                "checklist": qa.get("checklist", {}),
            }).execute()
        except Exception as e:
            raise RetryableError(f"DB insert qa_results failed: {e}")

        _set_status(call_id, "done")
        logger.info(f"Pipeline done: {call_id}")

    except RetryableError as e:
        logger.warning(f"Retryable error [{call_id}]: {e}")
        _set_status(call_id, "error", {"error_msg": f"[retryable] {e}"})
    except TerminalError as e:
        logger.error(f"Terminal error [{call_id}]: {e}")
        _set_status(call_id, "error", {"error_msg": str(e)})
    except Exception as e:
        logger.error(f"Unexpected error [{call_id}]: {e}")
        _set_status(call_id, "error", {"error_msg": str(e)})
    finally:
        _PIPELINE_SEMAPHORE.release()
        try:
            os.remove(tmp_path)
        except Exception:
            pass


@app.post("/calls")
async def upload_call(file: UploadFile = File(...)):
    allowed = {".wav", ".mp3", ".m4a", ".flac", ".ogg"}
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in allowed:
        raise HTTPException(400, f"Format nesuportat: {ext}")

    content = await file.read()

    row = supabase.table("calls").insert({
        "filename": file.filename,
        "file_size": len(content),
        "status": "uploading",
    }).execute()
    call_id = row.data[0]["id"]

    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=ext)
    tmp.write(content)
    tmp.close()

    thread = threading.Thread(target=_run_pipeline, args=(call_id, tmp.name), daemon=True)
    thread.start()

    return {"call_id": call_id, "status": "uploading"}


@app.post("/calls/batch")
async def upload_calls_batch(files: list[UploadFile] = File(...)):
    allowed = {".wav", ".mp3", ".m4a", ".flac", ".ogg"}
    results = []

    for file in files:
        ext = os.path.splitext(file.filename)[1].lower()
        if ext not in allowed:
            results.append({"filename": file.filename, "error": f"Format nesuportat: {ext}"})
            continue

        content = await file.read()

        row = supabase.table("calls").insert({
            "filename": file.filename,
            "file_size": len(content),
            "status": "uploading",
        }).execute()
        call_id = row.data[0]["id"]

        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=ext)
        tmp.write(content)
        tmp.close()

        thread = threading.Thread(target=_run_pipeline, args=(call_id, tmp.name), daemon=True)
        thread.start()

        results.append({"filename": file.filename, "call_id": call_id, "status": "uploading"})

    return results


@app.get("/calls")
def list_calls():
    rows = supabase.table("calls").select("*").order("created_at", desc=True).limit(50).execute()
    return rows.data


@app.get("/calls/{call_id}")
def get_call(call_id: str):
    call = supabase.table("calls") \
        .select("id,filename,file_size,status,duration_ms,language,speaker_count,segment_count,pii_count,audio_url,created_at,updated_at") \
        .eq("id", call_id).single().execute()
    if not call.data:
        raise HTTPException(404, "Apel negăsit")

    with ThreadPoolExecutor(max_workers=3) as ex:
        seg_f = ex.submit(lambda: supabase.table("segments")
            .select("position,role,speaker,text,start_ms,end_ms,duration_ms,wpm,confidence")
            .eq("call_id", call_id).order("position").execute())
        pii_f = ex.submit(lambda: supabase.table("pii_mappings")
            .select("original,placeholder")
            .eq("call_id", call_id).execute())
        qa_f  = ex.submit(lambda: supabase.table("qa_results")
            .select("scor_final,rezumat,empatie,sentiment_client,scor_structura,scor_calitate,scor_profesionalism,scor_ritm,scor_penalizari,penalizari_detalii,checklist")
            .eq("call_id", call_id).maybe_single().execute())
        segments, pii, qa = seg_f.result(), pii_f.result(), qa_f.result()

    return {
        "call": call.data,
        "segments": segments.data,
        "pii_mappings": pii.data,
        "qa": qa.data,
    }


@app.get("/calls/{call_id}/status")
def get_status(call_id: str):
    row = supabase.table("calls").select("id,status,error_msg,segment_count,pii_count,duration_ms").eq("id", call_id).single().execute()
    if not row.data:
        raise HTTPException(404, "Apel negăsit")
    return row.data
