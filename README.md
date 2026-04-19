# Anti — Call Center QA Pipeline

Sistem automat de analiză a apelurilor dintr-un call center românesc.
Transcrie audio, anonimizează date personale, clasifică rolurile vorbitorilor și generează un scor QA detaliat al agentului.

---

## Cum funcționează (pipeline)

```
Audio (.wav / .mp3 / .m4a)
        │
        ▼
  [1] Soniox STT          → transcript cu diarizare (cine vorbește, când, cât de repede)
        │
        ▼
  [2] Anonymize           → înlocuiește PII (nume, email, telefon, CNP) cu placeholder-e
        │
        ▼
  [3] Haiku — Classify    → identifică rolul fiecărui segment (AGENT / CLIENT) + confidence
        │
        ▼
  [4] Haiku — QA Analysis → scor QA, checklist, rezumat, empatie, sentiment client
        │
        ▼
  JSON output             → gata de afișat în UI
```

---

## Servicii externe

| Serviciu | Rol | Cheie |
|---|---|---|
| **Soniox** (`stt-async-v4`) | Speech-to-text async cu diarizare și detectare limbă | `SONIOX_API_KEY` |
| **Anthropic** (`claude-haiku-4-5-20251001`) | Clasificare roluri + analiză QA | `ANTHROPIC_API_KEY` |

---

## Structura proiectului

```
anti/
├── .env                    # chei API (nu se commitează)
├── .env_example            # template pentru .env
│
├── claude_controler.py     # inițializează clientul Anthropic + modelul folosit
├── soniox_client.py        # client Soniox: upload, transcriere async, polling, parsare
├── helpers.py              # toate funcțiile principale (anonymize, normalize, analyze_call)
├── normalizer.py           # re-export din helpers (backward compat)
│
├── prompts/
│   ├── classify_prompt.mrkd     # prompt pentru clasificare AGENT/CLIENT
│   └── qa_analysis_prompt.mrkd  # prompt pentru scorul QA + rezumat
│
└── tests/
    ├── COMMANDS.md              # cum rulezi fiecare test
    ├── test_soniox.py           # test transcriere Soniox
    ├── test_anonymize.py        # test anonimizare + round-trip
    ├── test_pipeline.py         # pipeline complet → JSON
    └── test_qa_analysis.py      # pipeline complet + afișare scor QA
```

---

## Funcții principale — `helpers.py`

### `anonymize_text(text) → (text, mapping)`
Detectează și înlocuiește date personale din transcript:
- telefoane românești (`07xx xxx xxx`)
- emailuri
- CNP (13 cifre, fuzzy detection, keyword detection)
- nume proprii (heuristică: Majusculă Majusculă)

Returnează textul curat + un dicționar `original → placeholder` (ex: `"Ion Popescu" → "NAME_1"`).

### `deanonymize_text(text, mapping) → text`
Inversează anonimizarea — pune înapoi datele reale din mapping.

### `normalize(anonymized_text) → dict`
Trimite transcriptul (deja anonimizat) la Haiku în chunk-uri de 25 segmente.
Pentru fiecare segment returnează:
```json
{
  "conversation": [
    {
      "role": "AGENT",
      "text": "...",
      "start": "0:01",
      "end": "0:08",
      "duration": "7s",
      "speech_rate": 198,
      "confidence": 0.97
    }
  ]
}
```

### `analyze_call(conversation) → dict`
Primește output-ul de la `normalize()` și generează analiza QA completă:
```json
{
  "rezumat": "...",
  "scor_final": 72,
  "categorii": {
    "structura":      { "scor": 33 },
    "calitate":       { "scor": 22 },
    "profesionalism": { "scor": 12 },
    "ritm_livrare":   { "scor": 10, "nota": 7, "observatie": "..." },
    "penalizari":     { "scor": 0, "detalii": [] }
  },
  "checklist": {
    "salut_greeting": true,
    "incheiere_politicoasa": true,
    "problema_identificata": false,
    "solutie_oferita": true,
    "solutie_corecta": true,
    "ton_profesional": true,
    "fara_intreruperi_agent": true,
    "ritm_rezonabil": true
  },
  "empatie": 7,
  "sentiment_client": "Neutru"
}
```

### `process_transcript(raw_text) → (result, mapping)`
Shortcut complet: anonymize → normalize într-un singur apel.

---

## Scoring QA

| Categorie | Max | Ce măsoară |
|---|---|---|
| Structură | 40 | Prezența elementelor cheie din apel (salut, soluție, încheiere etc.) |
| Calitate | 40 | Acuratețea și completitudinea răspunsurilor agentului |
| Profesionalism | 20 | Ton, vocabular, empatie |
| Ritm & Livrare | 15 | Viteza de vorbire și claritatea livrării |
| Penalizări | negativ | Întreruperi repetate, informații greșite, ton agresiv |
| **Total** | **100** | |

---

## Setup

```bash
# 1. Clonează și intră în folder
cd anti

# 2. Creează virtualenv
python3 -m venv .venv
source .venv/bin/activate

# 3. Instalează dependențele
pip install anthropic soniox python-dotenv requests

# 4. Configurează cheile API
cp .env_example .env
# editează .env și pune cheile reale

# 5. Rulează un test
python tests/test_qa_analysis.py
```

---

## Variabile de mediu

```env
SONIOX_API_KEY=...
ANTHROPIC_API_KEY=sk-ant-...
```
