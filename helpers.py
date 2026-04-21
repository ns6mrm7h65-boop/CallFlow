import json
import re
import sys
import os
from typing import Tuple, Dict, List

sys.path.insert(0, os.path.dirname(__file__))
from data.romanian_names import ROMANIAN_FIRST_NAMES, ROMANIAN_LAST_NAMES, EXCLUDE_WORDS


class RetryableError(Exception):
    """Transient error — safe to retry automatically."""

class TerminalError(Exception):
    """Permanent error — do not retry."""


def _validate_phone(phone_str: str) -> bool:
    clean = re.sub(r'[\s\-]', '', phone_str)
    if clean.startswith('+40'):
        clean = clean[3:]
    elif clean.startswith('0'):
        clean = clean[1:]
    else:
        return False
    if not clean.isdigit() or len(clean) != 9:
        return False
    if clean[0] not in ('2', '3', '7'):
        return False
    # Reject if original had a space between every digit
    if phone_str.count(' ') > 4:
        return False
    return True


def _validate_cnp(cnp_str: str) -> bool:
    cnp = cnp_str.replace(' ', '')
    if not cnp.isdigit() or len(cnp) != 13:
        return False
    if cnp[0] == '0':
        return False
    month = int(cnp[3:5])
    if not 1 <= month <= 12:
        return False
    day = int(cnp[5:7])
    if not 1 <= day <= 31:
        return False
    county = int(cnp[7:9])
    if not 1 <= county <= 52:
        return False
    return True


def _detect_names(text: str) -> List[str]:
    found = []
    pattern = r'\b([A-ZĂÂÎȘȚ][a-zăâîșț\-]+)(?:\s+([A-ZĂÂÎȘȚ][a-zăâîșț\-]+))+\b'
    for match in re.finditer(pattern, text):
        full = match.group(0)
        words = full.split()
        if any(w in EXCLUDE_WORDS for w in words):
            continue
        first, last = words[0], words[-1]
        if first in ROMANIAN_FIRST_NAMES or last in ROMANIAN_LAST_NAMES:
            found.append(full)
    return found


def anonymize_text(text: str) -> Tuple[str, Dict[str, str]]:
    mapping: Dict[str, str] = {}
    counter = {"PHONE": 1, "EMAIL": 1, "CNP": 1, "NAME": 1}

    def _sub(value, label):
        if value not in mapping:
            mapping[value] = f"{label}_{counter[label]}"
            counter[label] += 1
        return mapping[value]

    # 1. PHONE
    for m in re.finditer(r'(?:\+40[\s\-]?|(?<!\d)0)\s?7\d{2}[\s\-]?\d{3}[\s\-]?\d{3}\b', text):
        phone = m.group(0)
        if _validate_phone(phone):
            text = text.replace(phone, _sub(phone, "PHONE"), 1)

    # 2. EMAIL
    for m in re.finditer(r'\b[a-zA-Z0-9][a-zA-Z0-9._%+\-]*@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}\b', text):
        email = m.group(0)
        text = text.replace(email, _sub(email, "EMAIL"), 1)

    # 3. CNP — exact 13 digits validated + keyword context
    for m in re.finditer(r'\b\d{13}\b', text):
        cnp = m.group(0)
        if _validate_cnp(cnp):
            text = text.replace(cnp, _sub(cnp, "CNP"), 1)

    def _cnp_keyword_repl(match):
        full = match.group(0)
        digits = re.sub(r'\D', '', match.group(2))
        if len(digits) == 13 and _validate_cnp(digits):
            return _sub(digits, "CNP")
        return full

    text = re.sub(
        r'\b(c\s?n\s?p|cnp|cenep|cod numeric personal)\b[\s:]*([\d\s]{5,20})',
        _cnp_keyword_repl, text, flags=re.IGNORECASE
    )

    # 4. NAMES — dictionary-based
    for name in _detect_names(text):
        text = text.replace(name, _sub(name, "NAME"))

    return text, mapping


# -------------------------
# 🔁 DE-ANONYMIZE
# -------------------------

def deanonymize_text(text: str, mapping: Dict[str, str]) -> str:
    """
    Replaces placeholders back with original values.
    Longest placeholders first so ``PHONE_10`` is not broken by ``PHONE_1``.
    """

    reverse_map = {v: k for k, v in mapping.items()}

    for placeholder, original in sorted(
        reverse_map.items(), key=lambda kv: len(kv[0]), reverse=True
    ):
        text = text.replace(placeholder, original)

    return text


# -------------------------
# 🤖 NORMALIZE (Haiku classification)
# -------------------------

import time
from pathlib import Path

from claude_controler import ClaudeController  # noqa: E402

_CHUNK_SIZE = 25
_MAX_RETRIES = 3
_CLASSIFY_PROMPT_FILE = Path(__file__).parent / "prompts" / "classify_prompt.mrkd"
_CLASSIFY_PROMPT: str | None = None


def _get_classify_prompt() -> str:
    global _CLASSIFY_PROMPT
    if _CLASSIFY_PROMPT is None:
        _CLASSIFY_PROMPT = _CLASSIFY_PROMPT_FILE.read_text(encoding="utf-8")
    return _CLASSIFY_PROMPT


def _parse_segment(raw: str) -> dict:
    lines = raw.strip().split("\n")
    result = {"start": None, "end": None, "duration": None, "speech_rate": None, "text": ""}
    text_lines = []
    for line in lines:
        if line.startswith("ID vorbitor:"):
            m = re.search(r"·\s*([\d:]+)\s*→\s*([\d:]+)\s*·\s*(\S+)", line)
            if m:
                result["start"], result["end"], result["duration"] = m.group(1), m.group(2), m.group(3)
        elif line.startswith("Ritm segment:"):
            m = re.search(r"~(\d+)", line)
            if m:
                result["speech_rate"] = int(m.group(1))
        elif not line.startswith("Vorbitor "):
            text_lines.append(line)
    result["text"] = " ".join(text_lines).strip()
    return result


def _parse_haiku_json(response) -> str:
    raw = response.content[0].text.strip()
    if raw.startswith("```"):
        raw = raw.split("```", 2)[1]
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.rsplit("```", 1)[0].strip()
    if not raw:
        raise ValueError(f"Empty response. stop_reason={response.stop_reason}")
    return raw


def _call_haiku(ctrl: "ClaudeController", text: str) -> list:
    for attempt in range(_MAX_RETRIES):
        try:
            response = ctrl.client.messages.create(
                model=ctrl.model,
                max_tokens=512,
                system=[{"type": "text", "text": _get_classify_prompt(), "cache_control": {"type": "ephemeral"}}],
                messages=[{"role": "user", "content": text}],
            )
            return json.loads(_parse_haiku_json(response))
        except Exception as e:
            msg = str(e).lower()
            if "401" in msg or "403" in msg or "invalid api key" in msg:
                raise TerminalError(f"Bad API key: {e}")
            if attempt == _MAX_RETRIES - 1:
                raise RetryableError(f"AI classify failed after {_MAX_RETRIES} attempts: {e}")
            time.sleep(2 ** attempt)


def normalize(anonymized_text: str) -> dict:
    """Classify roles + confidence for each segment via Haiku. Input must be anonymized."""
    ctrl = ClaudeController()
    segments = [s for s in anonymized_text.split("\n\n") if s.strip()]
    parsed = [_parse_segment(s) for s in segments]

    labels = []
    total_chunks = -(-len(segments) // _CHUNK_SIZE)
    for i in range(0, len(segments), _CHUNK_SIZE):
        chunk = segments[i: i + _CHUNK_SIZE]
        print(f"  chunk {i // _CHUNK_SIZE + 1}/{total_chunks} ({len(chunk)} segments)")
        labels.extend(_call_haiku(ctrl, "\n\n".join(chunk)))

    return {
        "conversation": [
            {
                "role": lbl["role"],
                "text": meta["text"],
                "start": meta["start"],
                "end": meta["end"],
                "duration": meta["duration"],
                "speech_rate": meta["speech_rate"],
                "confidence": lbl["confidence"],
            }
            for meta, lbl in zip(parsed, labels)
        ]
    }


def process_transcript(raw_text: str) -> tuple[dict, dict]:
    """Full pipeline: anonymize → normalize. Returns (result, pii_mapping)."""
    anonymized, mapping = anonymize_text(raw_text)
    return normalize(anonymized), mapping


# -------------------------
# 📊 QA ANALYSIS
# -------------------------

_QA_PROMPT_FILE = Path(__file__).parent / "prompts" / "qa_analysis_prompt.mrkd"
_QA_PROMPT: str | None = None


def _get_qa_prompt() -> str:
    global _QA_PROMPT
    if _QA_PROMPT is None:
        _QA_PROMPT = _QA_PROMPT_FILE.read_text(encoding="utf-8")
    return _QA_PROMPT


def _format_conversation_compact(conversation: dict) -> str:
    lines = []
    for turn in conversation.get("conversation", []):
        wpm = f"[{turn['speech_rate']}wpm]" if turn.get("speech_rate") else ""
        lines.append(f"{turn['role']}{wpm}: {turn['text']}")
    return "\n".join(lines)


def analyze_call(conversation: dict, anonymized_text: str = None) -> dict:
    """Run QA analysis. Prefers raw anonymized_text (post-step-2) over the normalized conversation."""
    ctrl = ClaudeController()
    compact = anonymized_text if anonymized_text else _format_conversation_compact(conversation)

    for attempt in range(_MAX_RETRIES):
        try:
            response = ctrl.client.messages.create(
                model=ctrl.model,
                max_tokens=1024,
                system=[{"type": "text", "text": _get_qa_prompt(), "cache_control": {"type": "ephemeral"}}],
                messages=[{"role": "user", "content": compact}],
            )
            return json.loads(_parse_haiku_json(response))
        except Exception as e:
            msg = str(e).lower()
            if "401" in msg or "403" in msg or "invalid api key" in msg:
                raise TerminalError(f"Bad API key: {e}")
            if attempt == _MAX_RETRIES - 1:
                raise RetryableError(f"AI QA failed after {_MAX_RETRIES} attempts: {e}")
            time.sleep(2 ** attempt)
