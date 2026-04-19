import os
import re
import textwrap
import time
import requests
from typing import Any, Optional

from dotenv import load_dotenv

load_dotenv()

SONIOX_BASE_URL = "https://api.soniox.com/v1"
# stt-async-v4 supports language_hints_strict (see Soniox language restrictions docs).
DEFAULT_MODEL = os.getenv("SONIOX_MODEL", "stt-async-v4")

# Ignore sub-second spans for WPM (too noisy); still show duration.
_MIN_DURATION_MS_FOR_WPM = 1000


def _ms_to_mmss(ms: int) -> str:
    if ms < 0:
        ms = 0
    total_s = ms // 1000
    m, s = divmod(total_s, 60)
    if m > 0:
        return f"{m:d}:{s:02d}"
    return f"0:{s:02d}"


def _count_words(text: str) -> int:
    """Rough word count (whitespace-separated); good enough for WPM hints."""
    return len(re.findall(r"\S+", text))


def analyze_transcript_segments(transcript: dict[str, Any]) -> list[dict[str, Any]]:
    """
    Split Soniox transcript into speaker runs with timing from raw ``tokens``
    (``start_ms`` / ``end_ms``) plus word count and WPM.

    Returns dicts with: ``speaker``, ``language``, ``text``, ``start_ms``,
    ``end_ms``, ``duration_ms``, ``word_count``, ``wpm`` (``None`` if unknown
    or span too short), ``tokens`` (the raw token rows for that run).
    """
    tokens = transcript.get("tokens") or []
    full_text = (transcript.get("text") or "").strip()

    if not tokens:
        if not full_text:
            return []
        wc = _count_words(full_text)
        return [
            {
                "speaker": None,
                "language": None,
                "text": full_text,
                "start_ms": None,
                "end_ms": None,
                "duration_ms": None,
                "word_count": wc,
                "wpm": None,
                "tokens": [],
            }
        ]

    runs: list[list[dict[str, Any]]] = []
    cur_sp: str | None = None
    cur_lang: str | None = None
    buf: list[dict[str, Any]] = []

    def flush() -> None:
        nonlocal cur_sp, cur_lang, buf
        if buf:
            runs.append(buf[:])
            buf.clear()

    for t in tokens:
        if not isinstance(t, dict):
            continue
        sp = t.get("speaker")
        lang = t.get("language")
        if sp is None:
            sp = cur_sp
        if buf and sp is not None and cur_sp is not None and sp != cur_sp:
            flush()
        if sp != cur_sp:
            cur_sp = sp
            cur_lang = lang if lang else cur_lang
        elif lang and not cur_lang:
            cur_lang = lang
        buf.append(t)
    flush()

    out: list[dict[str, Any]] = []
    for row in runs:
        text = "".join((x.get("text") or "") for x in row).strip()
        if not text:
            continue
        sp_first = next((x.get("speaker") for x in row if x.get("speaker") is not None), None)
        lang_first = next((x.get("language") for x in row if x.get("language")), None)
        starts = [
            int(x["start_ms"])
            for x in row
            if isinstance(x.get("start_ms"), (int, float))
        ]
        ends = [
            int(x["end_ms"])
            for x in row
            if isinstance(x.get("end_ms"), (int, float))
        ]
        start_ms = min(starts) if starts else None
        end_ms = max(ends) if ends else None
        duration_ms: int | None
        if start_ms is not None and end_ms is not None:
            duration_ms = max(0, end_ms - start_ms)
        else:
            duration_ms = None

        wc = _count_words(text)
        wpm: float | None = None
        if duration_ms is not None and duration_ms >= _MIN_DURATION_MS_FOR_WPM:
            wpm = round(wc * 60_000.0 / duration_ms, 1)

        out.append(
            {
                "speaker": sp_first,
                "language": lang_first,
                "text": text,
                "start_ms": start_ms,
                "end_ms": end_ms,
                "duration_ms": duration_ms,
                "word_count": wc,
                "wpm": wpm,
                "tokens": row,
            }
        )
    return out


def format_transcript_readable(
    transcript: dict[str, Any],
    *,
    wrap_width: int = 92,
    include_pace: bool = True,
) -> str:
    """
    Turn Soniox ``/transcript`` JSON into plain text: one block per speaker
    (when diarization labels exist), otherwise the full ``text`` field wrapped.

    If ``include_pace`` is true and tokens carry timestamps, each header line
    shows time range, duration, word count and WPM (words per minute).
    """
    segments = analyze_transcript_segments(transcript)
    if not segments:
        return ""

    blocks: list[str] = []
    for seg in segments:
        raw = seg["text"]
        sp = seg["speaker"]
        lang = seg["language"]
        label = f"Speaker {sp}" if sp is not None else "Speaker"
        if lang:
            label = f"{label} [{lang}]"

        if include_pace:
            parts: list[str] = []
            sm, em = seg["start_ms"], seg["end_ms"]
            dm = seg["duration_ms"]
            if sm is not None and em is not None:
                parts.append(f"{_ms_to_mmss(sm)}–{_ms_to_mmss(em)}")
            if dm is not None:
                parts.append(f"{dm / 1000:.1f}s")
            wc = seg["word_count"]
            parts.append(f"{wc} cuv.")
            wpm = seg["wpm"]
            if wpm is not None:
                parts.append(f"~{wpm:.0f} cuv/min")
            else:
                parts.append("cuv/min n/a")
            label = f"{label} | " + " | ".join(parts)

        wrapped = textwrap.fill(
            raw,
            width=wrap_width,
            break_long_words=False,
            break_on_hyphens=False,
            subsequent_indent="  ",
        )
        blocks.append(f"{label}:\n{wrapped}")

    return "\n\n".join(blocks)


class SonioxClient:
    def __init__(
        self,
        api_key: Optional[str] = None,
        timeout: int = 60,
        max_retries: int = 3,
        poll_interval: float = 1.0,
        max_poll_seconds: int = 600,
    ):
        self.api_key = api_key or os.getenv("SONIOX_API_KEY")

        if not self.api_key:
            raise ValueError("SONIOX_API_KEY is missing")

        self.timeout = timeout
        self.max_retries = max_retries
        self.poll_interval = poll_interval
        self.max_poll_seconds = max_poll_seconds

        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
        }

    def transcribe(
        self,
        file_path: str,
        language: str = "ro",
        *,
        language_hints_strict: bool = True,
        enable_speaker_diarization: bool = True,
        enable_language_identification: bool = True,
        model: Optional[str] = None,
    ) -> dict[str, Any]:
        """
        Upload audio, wait for async transcription, return the transcript JSON
        (includes ``text`` and ``tokens``).

        Defaults mirror the Soniox Playground: Romanian hints, strict hints,
        speaker diarization, and per-token language labels when the model provides them.
        """
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"File not found: {file_path}")

        file_id = self._upload_file(file_path)
        transcription_id = self._create_transcription(
            file_id,
            language=language,
            model=model or DEFAULT_MODEL,
            language_hints_strict=language_hints_strict,
            enable_speaker_diarization=enable_speaker_diarization,
            enable_language_identification=enable_language_identification,
        )
        self._wait_for_transcription(transcription_id)
        return self._get_transcript(transcription_id)

    def _upload_file(self, file_path: str) -> str:
        mime_type = self._get_mime_type(file_path)
        url = f"{SONIOX_BASE_URL}/files"

        for attempt in range(self.max_retries):
            try:
                with open(file_path, "rb") as f:
                    files = {"file": (os.path.basename(file_path), f, mime_type)}
                    response = requests.post(
                        url,
                        headers=self.headers,
                        files=files,
                        timeout=self.timeout,
                    )

                if response.status_code == 201:
                    data = response.json()
                    return data["id"]

                if response.status_code >= 500:
                    time.sleep(2**attempt)
                    continue

                raise Exception(
                    f"Soniox upload error {response.status_code}: {response.text}"
                )

            except requests.exceptions.Timeout:
                if attempt == self.max_retries - 1:
                    raise TimeoutError("Soniox upload timed out")
                time.sleep(2**attempt)

            except requests.exceptions.RequestException as e:
                if attempt == self.max_retries - 1:
                    raise Exception(f"Network error: {str(e)}") from e
                time.sleep(2**attempt)

        raise Exception("Max retries exceeded")

    def _create_transcription(
        self,
        file_id: str,
        *,
        language: str,
        model: str,
        language_hints_strict: bool,
        enable_speaker_diarization: bool,
        enable_language_identification: bool,
    ) -> str:
        url = f"{SONIOX_BASE_URL}/transcriptions"
        payload: dict[str, Any] = {
            "model": model,
            "file_id": file_id,
            "language_hints": [language],
            "language_hints_strict": language_hints_strict,
            "enable_speaker_diarization": enable_speaker_diarization,
            "enable_language_identification": enable_language_identification,
        }
        headers = {**self.headers, "Content-Type": "application/json"}

        for attempt in range(self.max_retries):
            try:
                response = requests.post(
                    url,
                    headers=headers,
                    json=payload,
                    timeout=self.timeout,
                )

                if response.status_code == 201:
                    data = response.json()
                    return data["id"]

                if response.status_code >= 500:
                    time.sleep(2**attempt)
                    continue

                raise Exception(
                    f"Soniox transcription create error {response.status_code}: {response.text}"
                )

            except requests.exceptions.Timeout:
                if attempt == self.max_retries - 1:
                    raise TimeoutError("Soniox create transcription timed out")
                time.sleep(2**attempt)

            except requests.exceptions.RequestException as e:
                if attempt == self.max_retries - 1:
                    raise Exception(f"Network error: {str(e)}") from e
                time.sleep(2**attempt)

        raise Exception("Max retries exceeded")

    def _wait_for_transcription(self, transcription_id: str) -> None:
        url = f"{SONIOX_BASE_URL}/transcriptions/{transcription_id}"
        deadline = time.monotonic() + self.max_poll_seconds

        while time.monotonic() < deadline:
            response = requests.get(
                url, headers=self.headers, timeout=self.timeout
            )

            if response.status_code != 200:
                raise Exception(
                    f"Soniox get transcription error {response.status_code}: {response.text}"
                )

            data = response.json()
            status = data.get("status")

            if status == "completed":
                return
            if status == "error":
                msg = data.get("error_message") or data.get("error_type") or "unknown"
                raise Exception(f"Transcription failed: {msg}")

            time.sleep(self.poll_interval)

        raise TimeoutError(
            f"Transcription {transcription_id} did not complete within {self.max_poll_seconds}s"
        )

    def _get_transcript(self, transcription_id: str) -> dict[str, Any]:
        url = f"{SONIOX_BASE_URL}/transcriptions/{transcription_id}/transcript"
        response = requests.get(url, headers=self.headers, timeout=self.timeout)

        if response.status_code != 200:
            raise Exception(
                f"Soniox get transcript error {response.status_code}: {response.text}"
            )

        return response.json()

    def _get_mime_type(self, file_path: str) -> str:
        ext = file_path.split(".")[-1].lower()

        mapping = {
            "mp3": "audio/mpeg",
            "wav": "audio/wav",
            "m4a": "audio/mp4",
            "flac": "audio/flac",
            "ogg": "audio/ogg",
        }

        return mapping.get(ext, "application/octet-stream")
