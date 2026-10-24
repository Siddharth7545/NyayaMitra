"""
Nyaya Mitra backend regression tests.
Covers: auth, modules registry, module spec/run, chat SSE stream, flagship
endpoints (document, petition, contract, research, fraud), community feed.
"""
import os
import json
import time
import uuid
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL",
                          "https://file-scanner-45.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

# Load REACT_APP_BACKEND_URL from frontend .env if not present
if "REACT_APP_BACKEND_URL" not in os.environ:
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL"):
                    BASE_URL = line.split("=", 1)[1].strip().strip('"').rstrip("/")
                    API = f"{BASE_URL}/api"
    except Exception:
        pass


TS = int(time.time())
TEST_EMAIL = f"test+{TS}@nyaya.in"
TEST_PW = "pass1234"
TEST_NAME = "Test User"

_state = {}


@pytest.fixture(scope="session")
def token():
    r = requests.post(f"{API}/auth/register",
                      json={"name": TEST_NAME, "email": TEST_EMAIL, "password": TEST_PW},
                      timeout=30)
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
    data = r.json()
    assert "token" in data and "user" in data
    assert data["user"]["email"] == TEST_EMAIL
    _state["user_id"] = data["user"]["id"]
    return data["token"]


@pytest.fixture(scope="session")
def auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


# ---------------- Health ----------------
def test_health():
    r = requests.get(f"{API}/", timeout=15)
    assert r.status_code == 200
    assert r.json().get("app") == "Nyaya Mitra"


# ---------------- Auth ----------------
def test_register_short_password():
    r = requests.post(f"{API}/auth/register", json={
        "name": "X", "email": f"short+{TS}@nyaya.in", "password": "abc"
    }, timeout=15)
    assert r.status_code == 400


def test_register_duplicate(token):
    r = requests.post(f"{API}/auth/register", json={
        "name": TEST_NAME, "email": TEST_EMAIL, "password": TEST_PW
    }, timeout=15)
    assert r.status_code == 400


def test_login_success(token):
    r = requests.post(f"{API}/auth/login",
                      json={"email": TEST_EMAIL, "password": TEST_PW}, timeout=15)
    assert r.status_code == 200
    assert "token" in r.json()


def test_login_invalid():
    r = requests.post(f"{API}/auth/login",
                      json={"email": TEST_EMAIL, "password": "wrongpass"}, timeout=15)
    assert r.status_code == 401


def test_me_authenticated(auth_headers):
    r = requests.get(f"{API}/auth/me", headers=auth_headers, timeout=15)
    assert r.status_code == 200
    assert r.json()["email"] == TEST_EMAIL


def test_me_no_token():
    r = requests.get(f"{API}/auth/me", timeout=15)
    assert r.status_code == 401


# ---------------- Modules registry ----------------
def test_modules_registry():
    r = requests.get(f"{API}/modules", timeout=15)
    assert r.status_code == 200
    cats = r.json()["categories"]
    assert len(cats) == 3
    counts = {c["key"]: len(c["modules"]) for c in cats}
    assert counts["core"] == 19
    assert counts["ai"] >= 9
    assert counts["fraud"] == 7
    # flagship modules
    flagship = sum(1 for c in cats for m in c["modules"] if m.get("flagship"))
    assert flagship >= 6


def test_module_spec_known():
    r = requests.get(f"{API}/module/rti/spec", timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert body["slug"] == "rti"
    assert isinstance(body["fields"], list) and len(body["fields"]) > 0


def test_module_spec_unknown():
    r = requests.get(f"{API}/module/does-not-exist/spec", timeout=15)
    assert r.status_code == 404


def test_module_run_missing_required(auth_headers):
    r = requests.post(f"{API}/module/run",
                      json={"slug": "rti", "inputs": {}},
                      headers=auth_headers, timeout=30)
    assert r.status_code == 400


def test_module_run_rti(auth_headers):
    payload = {
        "slug": "rti",
        "inputs": {
            "public_authority": "Municipal Corporation of Delhi",
            "state_or_central": "State",
            "info_sought": "Details of pothole repair expenditure in Ward 12 for FY 2024-25",
        },
    }
    r = requests.post(f"{API}/module/run", json=payload,
                      headers=auth_headers, timeout=90)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["slug"] == "rti"
    assert isinstance(data["result"], dict)
    # loose check for expected keys
    keys = set(data["result"].keys())
    assert keys & {"draft_rti_application", "fee", "first_appeal_process", "raw"}


# ---------------- Chat SSE ----------------
def test_chat_stream_sse(auth_headers):
    r = requests.post(f"{API}/chat/stream",
                      json={"message": "Explain Section 138 of the Negotiable Instruments Act in 2 lines."},
                      headers=auth_headers, stream=True, timeout=120)
    assert r.status_code == 200
    got_delta = False
    got_done = False
    session_id = None
    for line in r.iter_lines(decode_unicode=True):
        if not line or not line.startswith("data:"):
            continue
        payload = json.loads(line[5:].strip())
        if "session_id" in payload and not session_id:
            session_id = payload["session_id"]
        if "delta" in payload:
            got_delta = True
        if payload.get("done"):
            got_done = True
            break
    assert got_delta, "no streaming deltas received"
    assert got_done
    assert session_id
    _state["chat_session"] = session_id


def test_chat_history(auth_headers):
    sid = _state.get("chat_session")
    if not sid:
        pytest.skip("no chat session")
    r = requests.get(f"{API}/chat/history/{sid}", headers=auth_headers, timeout=15)
    assert r.status_code == 200
    msgs = r.json()["messages"]
    roles = [m["role"] for m in msgs]
    assert "user" in roles and "assistant" in roles


# ---------------- Flagship endpoints ----------------
SAMPLE_DOC = (
    "RENTAL AGREEMENT made on 1st April 2024 between Mr. A Sharma (Landlord) "
    "and Ms. B Verma (Tenant) for premises at 12 MG Road, Bangalore. "
    "Monthly rent Rs 25,000 payable by 5th of each month. Security deposit Rs 100,000. "
    "Term: 11 months. Tenant shall not sublet. Either party may terminate with 30 days notice."
)


def test_analyze_document(auth_headers):
    r = requests.post(f"{API}/analyze/document",
                      json={"text": SAMPLE_DOC}, headers=auth_headers, timeout=120)
    assert r.status_code == 200
    result = r.json()["result"]
    assert isinstance(result, dict)
    assert result.get("raw") or "summary" in result or "doc_type" in result


def test_petition_draft(auth_headers):
    r = requests.post(f"{API}/draft/petition", headers=auth_headers, timeout=120, json={
        "case_type": "Cheque Bounce (Section 138 NI Act)",
        "parties": "Complainant: Ravi Kumar; Accused: Suresh Singh",
        "facts": "Accused issued cheque of Rs 2,00,000 which was dishonoured due to insufficient funds on 10-Jan-2025.",
        "relief_sought": "Prosecution under Section 138 and recovery of amount with interest.",
    })
    assert r.status_code == 200
    assert len(r.json()["draft"]) > 100


SAMPLE_NDA = (
    "NON-DISCLOSURE AGREEMENT between DiscloserCo and RecipientCo dated 01-Jan-2025. "
    "Recipient agrees not to disclose Confidential Information for a period of 10 years. "
    "Governing law: laws of India. Any breach shall result in liquidated damages of Rs 50,00,000. "
    "No carve-out for information already in public domain. Jurisdiction: Delhi courts exclusively."
)


def test_contract_review(auth_headers):
    r = requests.post(f"{API}/review/contract",
                      json={"contract_text": SAMPLE_NDA}, headers=auth_headers, timeout=120)
    assert r.status_code == 200
    result = r.json()["result"]
    assert isinstance(result, dict)


def test_research_query(auth_headers):
    r = requests.post(f"{API}/research/query",
                      json={"query": "landmark judgments on right to privacy in India"},
                      headers=auth_headers, timeout=120)
    assert r.status_code == 200
    result = r.json()["result"]
    assert isinstance(result, dict)


# ---------------- Fraud ----------------
SCAM_SMS = ("Congratulations! Your KBC lottery number won Rs 25,00,000. "
            "To claim prize, share your bank OTP and Aadhaar via WhatsApp +91-9999XXXXXX now. Limited time.")


def test_fraud_detect(auth_headers):
    r = requests.post(f"{API}/fraud/detect",
                      json={"content": SCAM_SMS, "kind": "message"},
                      headers=auth_headers, timeout=120)
    assert r.status_code == 200
    result = r.json()["result"]
    assert isinstance(result, dict)
    if "risk_level" in result:
        assert result["risk_level"] in ("safe", "suspicious", "dangerous")


def test_fraud_community_public():
    r = requests.get(f"{API}/fraud/community", timeout=15)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_fraud_empty_content(auth_headers):
    r = requests.post(f"{API}/fraud/detect",
                      json={"content": "", "kind": "message"},
                      headers=auth_headers, timeout=15)
    assert r.status_code == 400
