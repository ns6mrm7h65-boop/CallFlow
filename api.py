import os
import uuid
import tempfile
import threading

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

app = FastAPI(title="CallFlow API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

supabase = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_KEY"))


def _set_status(call_id: str, status: str, extra: dict = None):
    data = {"status": status}
    if extra:
        data.update(extra)
    supabase.table("calls").update(data).eq("id", call_id).execute()


def _run_pipeline(call_id: str, tmp_path: str):
    try:
        from soniox_client import SonioxClient, analyze_transcript_segments, format_transcript_readable
        from helpers import anonymize_text, normalize, analyze_call

        # Step 1 — STT + upload audio to storage
        _set_status(call_id, "transcribing")

        ext = os.path.splitext(tmp_path)[1].lower()
        storage_key = f"{call_id}{ext}"
        with open(tmp_path, "rb") as f:
            audio_bytes = f.read()
        mime = {"wav":"audio/wav","mp3":"audio/mpeg","m4a":"audio/mp4","flac":"audio/flac","ogg":"audio/ogg"}.get(ext.lstrip("."), "audio/wav")
        supabase.storage.from_("call-audio").upload(storage_key, audio_bytes, {"content-type": mime, "upsert": "true"})
        audio_url = f"{os.getenv('SUPABASE_URL')}/storage/v1/object/public/call-audio/{storage_key}"
        supabase.table("calls").update({"audio_url": audio_url}).eq("id", call_id).execute()

        client = SonioxClient()
        transcript = client.transcribe(tmp_path)
        segments = analyze_transcript_segments(transcript)
        raw_text = format_transcript_readable(transcript)

        duration_ms = max((s["end_ms"] or 0) for s in segments if s["end_ms"]) if segments else None
        _set_status(call_id, "anonymizing", {"duration_ms": duration_ms, "speaker_count": len({s["speaker"] for s in segments if s["speaker"]})})

        # Step 2 — Anonymize
        anon_text, pii_map = anonymize_text(raw_text)

        pii_rows = [{"call_id": call_id, "original": k, "placeholder": v} for k, v in pii_map.items()]
        if pii_rows:
            supabase.table("pii_mappings").insert(pii_rows).execute()

        _set_status(call_id, "classifying", {"pii_count": len(pii_map)})

        # Step 3 — Classify
        conversation = normalize(anon_text)
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
        if seg_rows:
            supabase.table("segments").insert(seg_rows).execute()

        _set_status(call_id, "analyzing", {"segment_count": len(seg_rows)})

        # Step 4 — QA
        qa = analyze_call(conversation, anon_text)
        cats = qa.get("categorii", {})

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

        _set_status(call_id, "done")

    except Exception as e:
        _set_status(call_id, "error", {"error_msg": str(e)})
    finally:
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


@app.get("/calls")
def list_calls():
    rows = supabase.table("calls").select("*").order("created_at", desc=True).limit(50).execute()
    return rows.data


@app.get("/calls/{call_id}")
def get_call(call_id: str):
    call = supabase.table("calls").select("*").eq("id", call_id).single().execute()
    if not call.data:
        raise HTTPException(404, "Apel negăsit")

    segments = supabase.table("segments").select("*").eq("call_id", call_id).order("position").execute()
    pii = supabase.table("pii_mappings").select("*").eq("call_id", call_id).execute()
    qa = supabase.table("qa_results").select("*").eq("call_id", call_id).maybe_single().execute()

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
