"""
Iteration 2 backend tests: file upload analyzers, CNR tracker, lawyer directory.
"""
import io
import os
import time
import uuid
import requests
import pytest
from docx import Document as DocxDocument

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL"):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
API = f"{BASE_URL}/api"

TS = int(time.time())
EMAIL = f"iter2+{TS}@nyaya.in"
PW = "pass1234"


@pytest.fixture(scope="module")
def auth_headers():
    r = requests.post(f"{API}/auth/register",
                      json={"name": "Iter2", "email": EMAIL, "password": PW},
                      timeout=30)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def _make_docx_bytes(text: str) -> bytes:
    doc = DocxDocument()
    for line in text.split("\n"):
        doc.add_paragraph(line)
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


SAMPLE_CONTRACT = (
    "SERVICE AGREEMENT dated 01-Feb-2025 between AlphaCo (Client) and BetaCo (Provider). "
    "Provider shall render consulting services for a fee of Rs 5,00,000 payable within 30 days. "
    "Governing law: India. Jurisdiction: Mumbai courts exclusively. "
    "Either party may terminate with 15 days notice. Liquidated damages: Rs 10,00,000. "
    "No limitation of liability clause. Confidentiality for 5 years."
)


# --------------- File upload analyzers ---------------
class TestUploadAnalyzers:
    def test_doc_upload_docx(self, auth_headers):
        data = _make_docx_bytes(SAMPLE_CONTRACT)
        files = {"file": ("test.docx", data,
                          "application/vnd.openxmlformats-officedocument.wordprocessingml.document")}
        r = requests.post(f"{API}/analyze/document/upload",
                          headers=auth_headers, files=files, timeout=120)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "id" in body and "result" in body
        assert body["filename"] == "test.docx"
        assert body["chars"] > 30

    def test_doc_upload_txt(self, auth_headers):
        files = {"file": ("note.txt", SAMPLE_CONTRACT.encode(), "text/plain")}
        r = requests.post(f"{API}/analyze/document/upload",
                          headers=auth_headers, files=files, timeout=120)
        assert r.status_code == 200

    def test_doc_upload_unsupported(self, auth_headers):
        files = {"file": ("pic.jpg", b"\xff\xd8\xff\xe0dummy", "image/jpeg")}
        r = requests.post(f"{API}/analyze/document/upload",
                          headers=auth_headers, files=files, timeout=30)
        assert r.status_code == 400
        assert "Unsupported" in r.json().get("detail", "")

    def test_doc_upload_too_short(self, auth_headers):
        files = {"file": ("short.txt", b"hi", "text/plain")}
        r = requests.post(f"{API}/analyze/document/upload",
                          headers=auth_headers, files=files, timeout=30)
        assert r.status_code == 400

    def test_doc_upload_no_auth(self):
        files = {"file": ("note.txt", SAMPLE_CONTRACT.encode(), "text/plain")}
        r = requests.post(f"{API}/analyze/document/upload", files=files, timeout=30)
        assert r.status_code == 401

    def test_contract_upload_docx(self, auth_headers):
        data = _make_docx_bytes(SAMPLE_CONTRACT)
        files = {"file": ("nda.docx", data,
                          "application/vnd.openxmlformats-officedocument.wordprocessingml.document")}
        r = requests.post(f"{API}/review/contract/upload",
                          headers=auth_headers, files=files, timeout=120)
        assert r.status_code == 200, r.text
        assert "result" in r.json()

    def test_contract_upload_no_auth(self):
        files = {"file": ("nda.txt", SAMPLE_CONTRACT.encode(), "text/plain")}
        r = requests.post(f"{API}/review/contract/upload", files=files, timeout=30)
        assert r.status_code == 401


# --------------- CNR tracker ---------------
class TestCNR:
    def test_cnr_valid_delhi(self, auth_headers):
        r = requests.post(f"{API}/cnr/track",
                          json={"cnr": "DLCT010012342024"},
                          headers=auth_headers, timeout=60)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["cnr"] == "DLCT010012342024"
        assert d["decoded"]["state_name"] == "Delhi"
        assert d["decoded"]["registered_year"] == "2024"
        assert "portal_reachable" in d
        assert "ai_inferred" in d
        assert "portal_deep_link" in d
        assert "services.ecourts.gov.in" in d["portal_deep_link"]

    def test_cnr_karnataka(self, auth_headers):
        r = requests.post(f"{API}/cnr/track",
                          json={"cnr": "KAKA010012342023"},
                          headers=auth_headers, timeout=60)
        assert r.status_code == 200
        assert r.json()["decoded"]["state_name"] == "Karnataka"
        assert r.json()["decoded"]["registered_year"] == "2023"

    def test_cnr_maharashtra(self, auth_headers):
        r = requests.post(f"{API}/cnr/track",
                          json={"cnr": "MHMH010012342022"},
                          headers=auth_headers, timeout=60)
        assert r.status_code == 200
        assert r.json()["decoded"]["state_name"] == "Maharashtra"

    def test_cnr_invalid_short(self, auth_headers):
        r = requests.post(f"{API}/cnr/track",
                          json={"cnr": "123"},
                          headers=auth_headers, timeout=15)
        assert r.status_code == 400

    def test_cnr_invalid_15char(self, auth_headers):
        r = requests.post(f"{API}/cnr/track",
                          json={"cnr": "DLCT01001234202"},
                          headers=auth_headers, timeout=15)
        assert r.status_code == 400

    def test_cnr_no_auth(self):
        r = requests.post(f"{API}/cnr/track",
                          json={"cnr": "DLCT010012342024"}, timeout=15)
        assert r.status_code == 401


# --------------- Lawyer directory ---------------
class TestLawyers:
    def test_list_all(self):
        r = requests.get(f"{API}/lawyers", timeout=20)
        assert r.status_code == 200
        body = r.json()
        assert "total" in body and "lawyers" in body
        assert body["total"] >= 40
        first = body["lawyers"][0]
        for k in ["id", "name", "city", "specialisations", "experience_years",
                  "rating", "consult_fee"]:
            assert k in first

    def test_filter_city(self):
        r = requests.get(f"{API}/lawyers", params={"city": "Delhi"}, timeout=15)
        assert r.status_code == 200
        cities = {l["city"] for l in r.json()["lawyers"]}
        assert cities == {"Delhi"}

    def test_filter_spec_ip(self):
        r = requests.get(f"{API}/lawyers", params={"specialisation": "IP"}, timeout=15)
        assert r.status_code == 200
        lawyers = r.json()["lawyers"]
        assert len(lawyers) >= 1
        for l in lawyers:
            assert any("IP" in s for s in l["specialisations"])

    def test_combined_filters(self):
        r = requests.get(f"{API}/lawyers",
                         params={"city": "Bengaluru", "specialisation": "IP"},
                         timeout=15)
        assert r.status_code == 200
        for l in r.json()["lawyers"]:
            assert l["city"] == "Bengaluru"

    def test_sort_fee_low(self):
        r = requests.get(f"{API}/lawyers", params={"sort": "fee_low"}, timeout=15)
        fees = [l["consult_fee"] for l in r.json()["lawyers"]]
        assert fees == sorted(fees)

    def test_sort_experience(self):
        r = requests.get(f"{API}/lawyers", params={"sort": "experience"}, timeout=15)
        years = [l["experience_years"] for l in r.json()["lawyers"]]
        assert years == sorted(years, reverse=True)

    def test_facets(self):
        r = requests.get(f"{API}/lawyers/facets", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert "cities" in d and "specialisations" in d
        assert d["cities"] == sorted(d["cities"])
        assert d["specialisations"] == sorted(d["specialisations"])
        assert "Delhi" in d["cities"]

    def test_get_lawyer_by_id(self):
        r = requests.get(f"{API}/lawyers", timeout=15)
        lid = r.json()["lawyers"][0]["id"]
        r2 = requests.get(f"{API}/lawyers/{lid}", timeout=15)
        assert r2.status_code == 200
        assert r2.json()["id"] == lid

    def test_get_lawyer_unknown(self):
        r = requests.get(f"{API}/lawyers/{uuid.uuid4()}", timeout=15)
        assert r.status_code == 404

    def test_consult_success(self, auth_headers):
        lid = requests.get(f"{API}/lawyers", timeout=15).json()["lawyers"][0]["id"]
        r = requests.post(f"{API}/lawyers/consult",
                          json={"lawyer_id": lid, "matter_summary": "Need advice on tenant dispute"},
                          headers=auth_headers, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "pending"
        assert "id" in d and "lawyer" in d and "fee" in d

    def test_consult_unknown_lawyer(self, auth_headers):
        r = requests.post(f"{API}/lawyers/consult",
                          json={"lawyer_id": str(uuid.uuid4()), "matter_summary": "x"},
                          headers=auth_headers, timeout=15)
        assert r.status_code == 404

    def test_consult_empty_matter(self, auth_headers):
        lid = requests.get(f"{API}/lawyers", timeout=15).json()["lawyers"][0]["id"]
        r = requests.post(f"{API}/lawyers/consult",
                          json={"lawyer_id": lid, "matter_summary": "   "},
                          headers=auth_headers, timeout=15)
        assert r.status_code == 400

    def test_consult_no_auth(self):
        r = requests.post(f"{API}/lawyers/consult",
                          json={"lawyer_id": "x", "matter_summary": "x"}, timeout=15)
        assert r.status_code == 401
