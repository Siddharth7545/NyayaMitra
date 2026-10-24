"""Iteration 6 - Voice + Multi-Language full-language response bug-fix tests."""
import os
import re
import time
import pytest
import requests

def _read_env(key):
    v = os.environ.get(key)
    if v:
        return v
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith(f"{key}="):
                    return line.split("=", 1)[1].strip()
    except Exception:
        pass
    return None

BASE_URL = _read_env("REACT_APP_BACKEND_URL").rstrip("/")

# Unicode script ranges
DEVANAGARI = re.compile(r"[\u0900-\u097F]")
TAMIL = re.compile(r"[\u0B80-\u0BFF]")
TELUGU = re.compile(r"[\u0C00-\u0C7F]")
BENGALI = re.compile(r"[\u0980-\u09FF]")
ASCII_LETTERS = re.compile(r"[A-Za-z]")


def in_script(text, pattern):
    """Return True if the string contains at least one char of that script."""
    return bool(pattern.search(text or ""))


def is_mostly_script(text, pattern, min_ratio=0.3):
    """Ensure at least min_ratio of the letters in text belong to the script (not English)."""
    if not text:
        return False
    letters = [c for c in text if c.isalpha()]
    if not letters:
        return False
    matches = [c for c in letters if pattern.match(c)]
    return (len(matches) / len(letters)) >= min_ratio


@pytest.fixture(scope="module")
def auth_token():
    ts = int(time.time())
    email = f"iter6+{ts}@nyaya.in"
    r = requests.post(f"{BASE_URL}/api/auth/register",
                      json={"name": "Iter6", "email": email, "password": "pass1234"},
                      timeout=30)
    assert r.status_code in (200, 201), r.text
    return r.json()["token"]


@pytest.fixture
def headers(auth_token):
    return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}


def run_module(headers, slug, inputs, timeout=120):
    r = requests.post(f"{BASE_URL}/api/module/run",
                      headers=headers,
                      json={"slug": slug, "inputs": inputs},
                      timeout=timeout)
    assert r.status_code == 200, f"{slug} run failed: {r.status_code} {r.text[:400]}"
    return r.json()


# ---------------- VOICE MODULE ----------------

VOICE_CASES = [
    ("हिंदी", "मुझे 15 दिन में घर खाली करने को कहा गया है", DEVANAGARI, "Hindi"),
    ("தமிழ்", "என்னை 15 நாட்களில் வீட்டை காலி செய்யச் சொன்னார்கள்", TAMIL, "Tamil"),
    ("తెలుగు", "నన్ను 15 రోజుల్లో ఇల్లు ఖాళీ చేయమని చెప్పారు", TELUGU, "Telugu"),
    ("বাংলা", "আমাকে ১৫ দিনের মধ্যে বাড়ি খালি করতে বলা হয়েছে", BENGALI, "Bengali"),
    ("मराठी", "मला १५ दिवसांत घर रिकामे करायला सांगितले आहे", DEVANAGARI, "Marathi"),
]


@pytest.mark.parametrize("lang,query,pattern,label", VOICE_CASES)
def test_voice_non_english_all_fields_in_script(headers, lang, query, pattern, label):
    resp = run_module(headers, "voice", {"spoken_query": query, "language": lang})
    result = resp["result"]
    # answer
    assert is_mostly_script(result.get("answer", ""), pattern), \
        f"[{label}] answer not in expected script: {result.get('answer','')[:200]}"
    # key_points — every element must be in the target script
    kps = result.get("key_points") or []
    assert isinstance(kps, list) and len(kps) > 0, f"[{label}] key_points missing/empty"
    for i, kp in enumerate(kps):
        assert is_mostly_script(kp, pattern), \
            f"[{label}] key_points[{i}] not in expected script: {kp}"
    # next_action
    assert is_mostly_script(result.get("next_action", ""), pattern), \
        f"[{label}] next_action not in expected script: {result.get('next_action','')}"
    # disclaimer
    assert is_mostly_script(result.get("disclaimer", ""), pattern), \
        f"[{label}] disclaimer not in expected script: {result.get('disclaimer','')}"
    # section_labels present with all 5 keys, each in target script
    sl = result.get("section_labels")
    assert isinstance(sl, dict), f"[{label}] section_labels missing"
    for key in ["answer", "key_points", "next_action", "disclaimer", "read_aloud"]:
        assert key in sl, f"[{label}] section_labels missing key '{key}'"
        assert is_mostly_script(sl[key], pattern), \
            f"[{label}] section_labels['{key}'] not in target script: {sl[key]}"


def test_voice_english_labels_natural_english(headers):
    resp = run_module(headers, "voice", {
        "spoken_query": "I was told to vacate my rented flat within 15 days.",
        "language": "English",
    })
    result = resp["result"]
    # English fields — should not be predominantly Devanagari/Tamil
    for field in ["answer", "next_action", "disclaimer"]:
        v = result.get(field, "")
        assert ASCII_LETTERS.search(v), f"English {field} has no ASCII letters: {v}"
        assert not DEVANAGARI.search(v), f"English {field} contains Devanagari: {v}"
    sl = result.get("section_labels")
    assert isinstance(sl, dict)
    for key in ["answer", "key_points", "next_action", "disclaimer", "read_aloud"]:
        assert key in sl
        assert ASCII_LETTERS.search(sl[key]), f"English section_labels['{key}'] not English: {sl[key]}"


# ---------------- MULTILANG MODULE ----------------

MULTILANG_TEXT = "Any tenant shall vacate the premises within 15 days of receiving written notice."

MULTILANG_CASES = [
    ("Hindi", DEVANAGARI),
    ("Tamil", TAMIL),
]


@pytest.mark.parametrize("target,pattern", MULTILANG_CASES)
def test_multilang_all_fields_in_target(headers, target, pattern):
    resp = run_module(headers, "multilang",
                      {"text": MULTILANG_TEXT, "target_language": target})
    result = resp["result"]
    # translation, plain_language_summary in target script
    for f in ["translation", "plain_language_summary"]:
        v = result.get(f, "")
        assert is_mostly_script(v, pattern), f"[{target}] {f} not in target script: {v[:200]}"
    # cultural_notes: array of strings in target script
    cn = result.get("cultural_notes") or []
    assert isinstance(cn, list) and len(cn) > 0, f"[{target}] cultural_notes empty"
    for i, note in enumerate(cn):
        assert is_mostly_script(note, pattern), \
            f"[{target}] cultural_notes[{i}] not in target script: {note}"
    # key_terms_glossary: english stays English, translated + meaning in target script
    glossary = result.get("key_terms_glossary") or []
    assert isinstance(glossary, list) and len(glossary) > 0, f"[{target}] glossary empty"
    for i, g in enumerate(glossary):
        assert "english" in g and "translated" in g and "meaning" in g, \
            f"[{target}] glossary[{i}] missing keys: {g}"
        assert is_mostly_script(g["translated"], pattern), \
            f"[{target}] glossary[{i}].translated not in target: {g['translated']}"
        assert is_mostly_script(g["meaning"], pattern), \
            f"[{target}] glossary[{i}].meaning not in target: {g['meaning']}"
    # section_labels
    sl = result.get("section_labels")
    assert isinstance(sl, dict), f"[{target}] section_labels missing"
    for key in ["translation", "plain_language_summary", "key_terms_glossary", "cultural_notes"]:
        assert key in sl, f"[{target}] section_labels missing '{key}'"
        assert is_mostly_script(sl[key], pattern), \
            f"[{target}] section_labels['{key}'] not in target: {sl[key]}"


# ---------------- REGRESSION ----------------

def test_module_spec_voice(headers):
    r = requests.get(f"{BASE_URL}/api/module/voice/spec", timeout=15)
    assert r.status_code == 200
    j = r.json()
    assert j["slug"] == "voice"
    keys = {f["key"] for f in j["fields"]}
    assert {"spoken_query", "language"}.issubset(keys)


def test_module_spec_multilang(headers):
    r = requests.get(f"{BASE_URL}/api/module/multilang/spec", timeout=15)
    assert r.status_code == 200
    j = r.json()
    keys = {f["key"] for f in j["fields"]}
    assert {"text", "target_language"}.issubset(keys)


def test_chatbot_regression(headers):
    """Simple regression — chatbot module still runs."""
    r = requests.post(f"{BASE_URL}/api/module/run",
                      headers=headers,
                      json={"slug": "chatbot", "inputs": {"question": "What is Section 138 of NI Act?"}},
                      timeout=90)
    # chatbot may or may not exist as a module slug; accept 200 or 404 (skip)
    if r.status_code == 404:
        pytest.skip("chatbot module slug not registered")
    assert r.status_code == 200, r.text[:400]


def test_templates_translate_regression(headers):
    """Templates translation still works (Hindi) - preserves proper nouns."""
    payload = {
        "template_slug": "nda-mutual",
        "target_language": "Hindi",
        "text": "This Mutual NDA is entered by ABC Tech Pvt Ltd and XYZ Analytics LLP for INR 35000 per breach under Section 138.",
    }
    r = requests.post(f"{BASE_URL}/api/templates/translate", headers=headers,
                      json=payload, timeout=60)
    if r.status_code == 404:
        pytest.skip("templates/translate not present")
    assert r.status_code == 200, r.text[:400]
    j = r.json()
    out = j.get("translated") or j.get("text") or ""
    assert DEVANAGARI.search(out), f"No Devanagari in translation: {out[:200]}"
    for token in ["ABC Tech Pvt Ltd", "XYZ Analytics LLP", "35000", "138"]:
        assert token in out, f"Proper noun '{token}' missing from translation"
