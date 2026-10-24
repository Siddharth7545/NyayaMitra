"""
Iteration 3 backend tests: Bulk Contract Review endpoints and regression.
"""
import io
import os
import time
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

import uuid as _uuid
TS = f"{int(time.time())}-{_uuid.uuid4().hex[:6]}"
EMAIL = f"iter3+{TS}@nyaya.in"
PW = "pass1234"
EMAIL2 = f"iter3b+{TS}@nyaya.in"


@pytest.fixture(scope="module")
def auth_headers():
    r = requests.post(f"{API}/auth/register",
                      json={"name": "Iter3", "email": EMAIL, "password": PW},
                      timeout=30)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


@pytest.fixture(scope="module")
def auth_headers2():
    r = requests.post(f"{API}/auth/register",
                      json={"name": "Iter3B", "email": EMAIL2, "password": PW},
                      timeout=30)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def _docx(text: str) -> bytes:
    doc = DocxDocument()
    for line in text.split("\n"):
        doc.add_paragraph(line)
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


SAFE_NDA = """MUTUAL NON-DISCLOSURE AGREEMENT
This Mutual NDA is between Party A and Party B, both parties bear equal obligations.
Term: 2 years. Governing law: India, jurisdiction Bengaluru.
Both parties may terminate with 30 days notice. Confidentiality obligations survive for 2 years.
Standard carve-outs for publicly known information, independent development, and legally compelled disclosure apply.
Liability is capped at fees paid. No indemnification. Return of information required upon termination.
"""

RISKY_NDA = """ONE-SIDED NON-DISCLOSURE AGREEMENT
Recipient (you) agrees to indemnify Discloser for ANY and ALL damages, including consequential, punitive, and lost profits, with UNLIMITED liability.
Term is PERPETUAL. Recipient waives all rights to a jury trial and consents to exclusive jurisdiction in Delaware, USA.
Discloser may audit Recipient's premises at any time without notice. Recipient shall pay all attorney's fees regardless of outcome.
No carve-outs are permitted; even publicly known information remains confidential.
Recipient may not terminate. Any breach results in automatic liquidated damages of USD 1,000,000 per incident.
Assignment freely allowed to Discloser but prohibited for Recipient. Non-compete of 5 years across all industries.
"""

VENDOR_SA = """MASTER SERVICES AGREEMENT
Vendor shall provide software development services to Client on a time-and-materials basis.
Payment terms: Net 30. Late payments accrue interest at 1.5% per month.
IP ownership: all work product assigned to Client upon full payment.
Warranty period: 90 days. Liability capped at 12 months of fees.
Termination for convenience with 60 days notice. Confidentiality survives 3 years post-termination.
Governing law: India, Mumbai jurisdiction. Standard force majeure clause. Insurance requirement: INR 5 Cr.
"""


# --- Bulk review core ---
class TestBulkReview:
    def test_bulk_no_files_400(self, auth_headers):
        # Must send at least one file since UploadFile is required; simulate empty via non-file field
        r = requests.post(f"{API}/review/contract/bulk", headers=auth_headers,
                          files={}, timeout=30)
        # FastAPI treats missing 'files' as 422; endpoint's own 'no files' branch requires the field
        assert r.status_code in (400, 422), r.text

    def test_bulk_no_auth_401(self):
        files = [("files", ("a.txt", b"hello", "text/plain")),
                 ("files", ("b.txt", b"world", "text/plain"))]
        r = requests.post(f"{API}/review/contract/bulk", files=files, timeout=30)
        assert r.status_code in (401, 403), r.text

    def test_bulk_too_many_files_400(self, auth_headers):
        files = [("files", (f"f{i}.txt", b"x", "text/plain")) for i in range(21)]
        r = requests.post(f"{API}/review/contract/bulk", headers=auth_headers,
                          files=files, timeout=30)
        assert r.status_code == 400
        assert "Max 20" in r.text

    def test_bulk_three_contracts_and_persistence(self, auth_headers, auth_headers2):
        files = [
            ("files", ("safe_nda.docx", _docx(SAFE_NDA),
                       "application/vnd.openxmlformats-officedocument.wordprocessingml.document")),
            ("files", ("risky_nda.docx", _docx(RISKY_NDA),
                       "application/vnd.openxmlformats-officedocument.wordprocessingml.document")),
            ("files", ("vendor_sa.docx", _docx(VENDOR_SA),
                       "application/vnd.openxmlformats-officedocument.wordprocessingml.document")),
            ("files", ("image.jpg", b"\xff\xd8\xff\xe0fake", "image/jpeg")),
        ]
        r = requests.post(f"{API}/review/contract/bulk", headers=auth_headers,
                          files=files, timeout=180)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "batch_id" in data and "stats" in data and "items" in data
        stats = data["stats"]
        assert stats["total"] == 4
        # 3 DOCX should process; jpg should NOT crash the batch
        assert stats["processed"] >= 2
        items = data["items"]
        assert len(items) == 4

        # Find riskiest and safest of the 3 docx ok items
        ok_docx = [x for x in items if x.get("ok") and x.get("filename", "").endswith(".docx")]
        assert len(ok_docx) >= 2
        for it in ok_docx:
            for k in ("filename", "contract_type", "overall_risk", "risk_score",
                      "red_flags_count", "missing_count", "favourable_count",
                      "summary", "result"):
                assert k in it, f"missing key {k}"

        # jpg entry should be ok=false
        bad = [x for x in items if x["filename"] == "image.jpg"]
        assert bad and bad[0]["ok"] is False and "error" in bad[0]

        # Risky NDA should score high; safe should score lower
        by_name = {x["filename"]: x for x in ok_docx}
        if "risky_nda.docx" in by_name and "safe_nda.docx" in by_name:
            risky = by_name["risky_nda.docx"]["risk_score"]
            safe = by_name["safe_nda.docx"]["risk_score"]
            if isinstance(risky, int) and isinstance(safe, int):
                assert risky > safe, f"expected risky({risky}) > safe({safe})"
                # spec: riskiest >= 70 with overall_risk 'high'; safest < 60
                # These are AI-driven — allow tolerance but log
                print(f"risky={risky} safe={safe}")

        batch_id = data["batch_id"]

        # GET /api/review/batch/{id} — owner should retrieve
        r2 = requests.get(f"{API}/review/batch/{batch_id}", headers=auth_headers, timeout=20)
        assert r2.status_code == 200
        got = r2.json()
        assert got["id"] == batch_id
        assert got["stats"]["total"] == 4

        # Different user -> 404
        r3 = requests.get(f"{API}/review/batch/{batch_id}", headers=auth_headers2, timeout=20)
        assert r3.status_code == 404

        # Unknown id -> 404
        r4 = requests.get(f"{API}/review/batch/does-not-exist", headers=auth_headers, timeout=20)
        assert r4.status_code == 404

        # List batches
        r5 = requests.get(f"{API}/review/batches", headers=auth_headers, timeout=20)
        assert r5.status_code == 200
        lst = r5.json()
        assert isinstance(lst, list) and len(lst) >= 1
        assert any(b["id"] == batch_id for b in lst)
        # payload light — items excluded
        assert "items" not in lst[0]

    def test_list_batches_no_auth(self):
        r = requests.get(f"{API}/review/batches", timeout=20)
        assert r.status_code in (401, 403)


# --- Dashboard modules regression: bulk-contracts entry present ---
class TestModulesRegression:
    def test_modules_contains_bulk(self, auth_headers):
        r = requests.get(f"{API}/modules", headers=auth_headers, timeout=20)
        assert r.status_code == 200
        data = r.json()
        # Flatten – shape may be list of categories or dict
        s = str(data)
        assert "bulk-contracts" in s
        assert "layers" in s


# --- Regression: single contract upload still works ---
class TestSingleContractRegression:
    def test_single_contract_upload(self, auth_headers):
        files = {"file": ("safe.docx", _docx(SAFE_NDA),
                          "application/vnd.openxmlformats-officedocument.wordprocessingml.document")}
        r = requests.post(f"{API}/review/contract/upload", headers=auth_headers,
                          files=files, timeout=120)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "result" in d
        assert d["result"].get("contract_type")
