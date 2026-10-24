"""
Nyaya Mitra — Indian Legal-Tech Platform Backend
FastAPI + MongoDB + Gemini 3 Flash (via emergentintegrations)
"""
from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, UploadFile, File, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from starlette.responses import StreamingResponse
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import json
import re
import uuid
import jwt
import bcrypt
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr, ConfigDict
from typing import List, Optional, Dict, Any, Tuple
from datetime import datetime, timezone, timedelta

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

_provider = os.environ.get("LLM_PROVIDER", "").strip().lower()
if _provider in ("ollama", "groq", "grok") or os.environ.get("GROQ_API_KEY") or os.environ.get("GROK_API_KEY"):
    from llm_compat import LlmChat, UserMessage, TextDelta, StreamDone
else:
    try:
        # pyrefly: ignore[missing-import]
        from emergentintegrations.llm.chat import LlmChat, UserMessage, TextDelta, StreamDone
    except ImportError:  # running outside Emergent -> use the compatibility provider
        from llm_compat import LlmChat, UserMessage, TextDelta, StreamDone

# File parsers
import io
import pypdf
from docx import Document as DocxDocument
from docx.shared import Pt, RGBColor, Inches
from docx.enum.text import WD_COLOR_INDEX, WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.oxml import OxmlElement
from fastapi.responses import StreamingResponse as FastAPIStreamResponse
import httpx

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
EMERGENT_LLM_KEY = (
    os.environ.get("GROQ_API_KEY")
    or os.environ.get("GROK_API_KEY")
    or os.environ.get("EMERGENT_LLM_KEY")
    or os.environ.get("GEMINI_API_KEY", "")
)
JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALG = os.environ["JWT_ALGORITHM"]
JWT_EXP_DAYS = 7

LLM_PROVIDER = os.environ.get("LLM_PROVIDER", "").strip().lower()
if not LLM_PROVIDER:
    if os.environ.get("GROQ_API_KEY") or os.environ.get("GROK_API_KEY") or EMERGENT_LLM_KEY.startswith("gsk_"):
        LLM_PROVIDER = "groq"
    elif EMERGENT_LLM_KEY.startswith("xai-"):
        LLM_PROVIDER = "grok"
    else:
        LLM_PROVIDER = "gemini"

MODEL_PROVIDER = LLM_PROVIDER
if MODEL_PROVIDER in ("groq", "grok"):
    MODEL_NAME = os.environ.get("GROQ_MODEL") or os.environ.get("GROK_MODEL") or "openai/gpt-oss-120b"
elif MODEL_PROVIDER == "ollama":
    MODEL_NAME = os.environ.get("OLLAMA_MODEL", "llama3.2")
else:
    MODEL_NAME = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title="Nyaya Mitra API")
api = APIRouter(prefix="/api")
bearer = HTTPBearer(auto_error=False)

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
log = logging.getLogger("nyaya")


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
class RegisterReq(BaseModel):
    name: str
    email: EmailStr
    password: str


class LoginReq(BaseModel):
    email: EmailStr
    password: str


class AuthResp(BaseModel):
    token: str
    user: Dict[str, Any]


class ChatReq(BaseModel):
    session_id: Optional[str] = None
    message: str


class TextReq(BaseModel):
    text: str


class PetitionReq(BaseModel):
    case_type: str  # e.g. "Consumer Complaint", "RTI Appeal", "Cheque Bounce"
    parties: str  # names / roles
    facts: str
    relief_sought: str
    jurisdiction: Optional[str] = "India"


class ContractReq(BaseModel):
    contract_text: str


class ResearchReq(BaseModel):
    query: str


class FraudReq(BaseModel):
    content: str  # message text, email body, or URL
    kind: Optional[str] = "auto"  # "message" | "email" | "url" | "auto"


# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------
def hash_pw(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def check_pw(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False


def make_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(days=JWT_EXP_DAYS),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


async def current_user(cred: HTTPAuthorizationCredentials = Depends(bearer)) -> Dict[str, Any]:
    if cred is None:
        raise HTTPException(status_code=401, detail="Missing token")
    try:
        payload = jwt.decode(cred.credentials, JWT_SECRET, algorithms=[JWT_ALG])
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


# ---------------------------------------------------------------------------
# LLM helpers
# ---------------------------------------------------------------------------
def new_chat(session_id: str, system_message: str) -> LlmChat:
    return LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=session_id,
        system_message=system_message,
    ).with_model(MODEL_PROVIDER, MODEL_NAME)


async def llm_once(system_message: str, user_text: str, session_id: Optional[str] = None) -> str:
    sid = session_id or f"one-shot-{uuid.uuid4()}"
    chat = new_chat(sid, system_message)
    out_parts: List[str] = []
    async for ev in chat.stream_message(UserMessage(text=user_text)):
        if isinstance(ev, TextDelta):
            out_parts.append(ev.content)
        elif isinstance(ev, StreamDone):
            break
    return "".join(out_parts).strip()


def extract_json(text: str) -> Dict[str, Any]:
    """Robust JSON extraction from LLM response."""
    # try direct
    try:
        return json.loads(text)
    except Exception:
        pass
    # try fenced ```json ... ```
    m = re.search(r"```(?:json)?\s*(\{.*?\}|\[.*?\])\s*```", text, re.DOTALL)
    if m:
        try:
            return json.loads(m.group(1))
        except Exception:
            pass
    # try first {...} block
    m = re.search(r"(\{.*\})", text, re.DOTALL)
    if m:
        try:
            return json.loads(m.group(1))
        except Exception:
            pass
    return {"raw": text}


# ---------------------------------------------------------------------------
# System prompts (India-focused)
# ---------------------------------------------------------------------------
SYS_LEGAL_CHAT = (
    "You are Nyaya Mitra, an Indian legal knowledge assistant. Answer questions about "
    "Indian law: IPC, BNS, CrPC, BNSS, Constitution, Consumer Protection Act 2019, RTI Act 2005, "
    "IT Act 2000, Motor Vehicles Act, Contract Act 1872, Companies Act 2013, and related statutes. "
    "Cite specific sections/acts when possible. Explain in plain language. "
    "Always add: 'This is general information, not legal advice. Consult a licensed advocate for your matter.' "
    "If asked outside Indian law, gently redirect."
)

SYS_DOC_ANALYZER = (
    "You are an expert Indian legal document analyst. Given the document text, return STRICT JSON with keys: "
    "'doc_type' (string), 'summary' (2-3 sentences), 'parties' (array of strings), "
    "'key_dates' (array of strings), 'obligations' (array of strings), "
    "'risks' (array of {'severity':'high|medium|low','text':string}), "
    "'clauses_missing' (array of strings), 'recommendations' (array of strings). "
    "Return ONLY JSON, no prose, no markdown fencing."
)

SYS_PETITION = (
    "You are a senior Indian advocate drafting a formal legal petition/notice. "
    "Use proper Indian court formatting with cause title, parties, facts, grounds, prayer/relief. "
    "Cite relevant sections of Indian law. Return a complete, ready-to-file draft in plain text "
    "(no markdown fencing). End with '[Place]', '[Date]', 'Advocate for the Petitioner' placeholders."
)

SYS_CONTRACT = (
    "You are an expert Indian contract-review advocate. Review the contract and return STRICT JSON with: "
    "'contract_type' (string), 'overall_risk' ('high'|'medium'|'low'), "
    "'risk_score' (integer 0-100), 'summary' (string), "
    "'red_flags' (array of {'clause':string,'issue':string,'severity':'high|medium|low','suggestion':string}), "
    "'missing_protections' (array of strings), 'favourable_points' (array of strings), "
    "'recommendations' (array of strings). Return ONLY JSON, no markdown fencing."
)

SYS_RESEARCH = (
    "You are an Indian legal research engine. For the query, return STRICT JSON with: "
    "'answer' (concise legal explanation), "
    "'authorities' (array of {'title':string,'citation':string,'summary':string} — statutes AND landmark judgments), "
    "'related_topics' (array of strings), "
    "'practical_takeaway' (string). Use actual, well-known Indian statutes and Supreme Court/High Court cases. "
    "Return ONLY JSON, no markdown fencing."
)

SYS_FRAUD = (
    "You are a cyber-fraud detection expert for Indian users. Analyse the given content (SMS, email, or URL) "
    "and return STRICT JSON with: 'risk_level' ('safe'|'suspicious'|'dangerous'), "
    "'risk_score' (integer 0-100 where 100 is most dangerous), "
    "'category' (e.g., 'phishing','otp_scam','job_scam','loan_scam','kbc_lottery','upi_fraud','impersonation','safe'), "
    "'red_flags' (array of strings), "
    "'reasoning' (string), "
    "'safety_advice' (array of strings), "
    "'report_to' (array of Indian authorities/portals to report, e.g., 'cybercrime.gov.in','1930 helpline'). "
    "Return ONLY JSON, no markdown fencing."
)


# ---------------------------------------------------------------------------
# Health / meta
# ---------------------------------------------------------------------------
@api.get("/")
async def root():
    return {"app": "Nyaya Mitra", "status": "ok"}


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------
@api.post("/auth/register", response_model=AuthResp)
async def register(body: RegisterReq):
    email = body.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    if len(body.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    user_id = str(uuid.uuid4())
    doc = {
        "id": user_id,
        "name": body.name.strip(),
        "email": email,
        "password_hash": hash_pw(body.password),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(doc)
    token = make_token(user_id, email)
    return {"token": token, "user": {"id": user_id, "name": doc["name"], "email": email}}


@api.post("/auth/login", response_model=AuthResp)
async def login(body: LoginReq):
    email = body.email.lower().strip()
    user = await db.users.find_one({"email": email})
    if not user or not check_pw(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = make_token(user["id"], email)
    return {"token": token, "user": {"id": user["id"], "name": user["name"], "email": email}}


@api.get("/auth/me")
async def me(user=Depends(current_user)):
    return user


# ---------------------------------------------------------------------------
# 1) AI Legal Chatbot — Streaming SSE
# ---------------------------------------------------------------------------
@api.post("/chat/stream")
async def chat_stream(body: ChatReq, user=Depends(current_user)):
    sid = body.session_id or str(uuid.uuid4())
    # persist user msg
    await db.chat_messages.insert_one({
        "id": str(uuid.uuid4()),
        "session_id": sid,
        "user_id": user["id"],
        "role": "user",
        "content": body.message,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    chat = new_chat(sid, SYS_LEGAL_CHAT)

    async def gen():
        yield f"data: {json.dumps({'session_id': sid})}\n\n"
        full = []
        try:
            async for ev in chat.stream_message(UserMessage(text=body.message)):
                if isinstance(ev, TextDelta):
                    full.append(ev.content)
                    yield f"data: {json.dumps({'delta': ev.content})}\n\n"
                elif isinstance(ev, StreamDone):
                    break
        except Exception as e:
            log.exception("chat stream error")
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
        # persist assistant msg
        await db.chat_messages.insert_one({
            "id": str(uuid.uuid4()),
            "session_id": sid,
            "user_id": user["id"],
            "role": "assistant",
            "content": "".join(full),
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        yield f"data: {json.dumps({'done': True})}\n\n"

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive"},
    )


@api.get("/chat/history/{session_id}")
async def chat_history(session_id: str, user=Depends(current_user)):
    msgs = await db.chat_messages.find(
        {"session_id": session_id, "user_id": user["id"]}, {"_id": 0}
    ).sort("created_at", 1).to_list(500)
    return {"session_id": session_id, "messages": msgs}


@api.get("/chat/sessions")
async def chat_sessions(user=Depends(current_user)):
    pipeline = [
        {"$match": {"user_id": user["id"]}},
        {"$sort": {"created_at": -1}},
        {"$group": {"_id": "$session_id", "last": {"$first": "$content"}, "at": {"$first": "$created_at"}}},
        {"$sort": {"at": -1}},
        {"$limit": 30},
    ]
    rows = await db.chat_messages.aggregate(pipeline).to_list(30)
    return [{"session_id": r["_id"], "preview": r["last"][:80], "at": r["at"]} for r in rows]


# ---------------------------------------------------------------------------
# 2) Document Analyzer
# ---------------------------------------------------------------------------
@api.post("/analyze/document")
async def analyze_document(body: TextReq, user=Depends(current_user)):
    if not body.text or len(body.text.strip()) < 30:
        raise HTTPException(status_code=400, detail="Please paste document text (min 30 chars).")
    raw = await llm_once(SYS_DOC_ANALYZER, body.text[:20000])
    data = extract_json(raw)
    rec = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "type": "document_analysis",
        "input_preview": body.text[:200],
        "result": data,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.analyses.insert_one(rec)
    return {"id": rec["id"], "result": data}


# ---------------------------------------------------------------------------
# 3) Petition & Notice Drafting
# ---------------------------------------------------------------------------
@api.post("/draft/petition")
async def draft_petition(body: PetitionReq, user=Depends(current_user)):
    prompt = (
        f"Draft a formal Indian legal document for the following.\n"
        f"CASE TYPE: {body.case_type}\n"
        f"PARTIES: {body.parties}\n"
        f"FACTS: {body.facts}\n"
        f"RELIEF SOUGHT: {body.relief_sought}\n"
        f"JURISDICTION: {body.jurisdiction}\n\n"
        f"Produce a complete formal draft."
    )
    text = await llm_once(SYS_PETITION, prompt)
    rec = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "type": "petition",
        "case_type": body.case_type,
        "draft": text,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.drafts.insert_one(rec)
    return {"id": rec["id"], "draft": text}


@api.get("/draft/history")
async def draft_history(user=Depends(current_user)):
    rows = await db.drafts.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(50)
    return rows


# ---------------------------------------------------------------------------
# 4) Contract Review
# ---------------------------------------------------------------------------
@api.post("/review/contract")
async def review_contract(body: ContractReq, user=Depends(current_user)):
    if len(body.contract_text.strip()) < 50:
        raise HTTPException(status_code=400, detail="Please paste contract text (min 50 chars).")
    raw = await llm_once(SYS_CONTRACT, body.contract_text[:20000])
    data = extract_json(raw)
    rec = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "type": "contract_review",
        "input_preview": body.contract_text[:200],
        "result": data,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.analyses.insert_one(rec)
    return {"id": rec["id"], "result": data}


# ---------------------------------------------------------------------------
# 5) Legal Research
# ---------------------------------------------------------------------------
@api.post("/research/query")
async def research_query(body: ResearchReq, user=Depends(current_user)):
    if len(body.query.strip()) < 3:
        raise HTTPException(status_code=400, detail="Query too short.")
    raw = await llm_once(SYS_RESEARCH, body.query)
    data = extract_json(raw)
    rec = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "type": "research",
        "query": body.query,
        "result": data,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.analyses.insert_one(rec)
    return {"id": rec["id"], "result": data, "query": body.query}


# ---------------------------------------------------------------------------
# 6) Fraud / Scam Detection
# ---------------------------------------------------------------------------
@api.post("/fraud/detect")
async def fraud_detect(body: FraudReq, user=Depends(current_user)):
    if not body.content.strip():
        raise HTTPException(status_code=400, detail="Empty content.")
    prompt = f"KIND: {body.kind}\nCONTENT:\n{body.content[:8000]}"
    raw = await llm_once(SYS_FRAUD, prompt)
    data = extract_json(raw)
    rec = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "type": "fraud_scan",
        "kind": body.kind,
        "content_preview": body.content[:200],
        "result": data,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.fraud_scans.insert_one(rec)
    # community feed (public)
    if isinstance(data, dict) and data.get("risk_level") in ("suspicious", "dangerous"):
        await db.community_alerts.insert_one({
            "id": str(uuid.uuid4()),
            "user_masked": user["name"][:1] + "•••",
            "kind": body.kind,
            "category": data.get("category"),
            "risk_level": data.get("risk_level"),
            "preview": body.content[:120],
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    return {"id": rec["id"], "result": data}


@api.get("/fraud/community")
async def fraud_community():
    rows = await db.community_alerts.find({}, {"_id": 0}).sort("created_at", -1).to_list(30)
    return rows


@api.get("/fraud/history")
async def fraud_history(user=Depends(current_user)):
    rows = await db.fraud_scans.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(50)
    return rows


# ---------------------------------------------------------------------------
# Generic AI Module endpoint — powers the remaining 29 modules
# ---------------------------------------------------------------------------
MODULE_SPECS: Dict[str, Dict[str, Any]] = {
    # ---- Core Legal Services ----
    "case-management": {
        "title": "Legal Case Management",
        "fields": [
            {"key": "case_title", "label": "Case Title", "type": "text", "required": True},
            {"key": "case_number", "label": "Case Number (if any)", "type": "text"},
            {"key": "court", "label": "Court / Forum", "type": "text"},
            {"key": "parties", "label": "Parties", "type": "text"},
            {"key": "next_hearing", "label": "Next Hearing Date", "type": "text"},
            {"key": "notes", "label": "Case Notes / Status", "type": "textarea"},
        ],
        "system": "You are an Indian litigation case manager. Given case details, return STRICT JSON with keys: 'stage' (string), 'action_items' (array of strings), 'documents_needed' (array of strings), 'timeline' (array of {'when':string,'what':string}), 'strategy_notes' (string), 'risks' (array of strings).",
        "persist": True,
    },
    "consultation": {
        "title": "Online Legal Consultation",
        "fields": [
            {"key": "issue_type", "label": "Type of legal issue", "type": "text", "required": True},
            {"key": "urgency", "label": "Urgency (low / medium / high)", "type": "text"},
            {"key": "situation", "label": "Describe your situation", "type": "textarea", "required": True},
        ],
        "system": "You are an Indian legal triage assistant preparing a client for consultation. Return STRICT JSON with: 'recommended_specialisation' (string, e.g. 'Family Law','Criminal','Consumer'), 'urgency_level' ('low'|'medium'|'high'), 'preparation_checklist' (array of strings — documents/details to bring), 'initial_questions_for_advocate' (array of strings), 'estimated_complexity' (string), 'next_step' (string).",
    },
    "court-tracking": {
        "title": "Court Case Tracking",
        "fields": [
            {"key": "case_number", "label": "Case / CNR Number", "type": "text", "required": True},
            {"key": "court", "label": "Court", "type": "text"},
            {"key": "last_status", "label": "Last known status", "type": "textarea"},
        ],
        "system": "You are an Indian court-case tracking assistant. Return STRICT JSON with: 'likely_stage' (string), 'typical_next_steps' (array of strings), 'how_to_check_official' (array of strings — mention eCourts, District Court Services portal, Supreme Court COURTIS, High Court websites), 'suggested_documents' (array of strings), 'reminder_advice' (string).",
    },
    "cyber-crime": {
        "title": "Cyber Crime Reporting",
        "fields": [
            {"key": "incident_type", "label": "Incident type (phishing, UPI fraud, hacking, etc.)", "type": "text", "required": True},
            {"key": "amount_lost", "label": "Amount lost (₹, if any)", "type": "text"},
            {"key": "date_time", "label": "Date & time of incident", "type": "text"},
            {"key": "description", "label": "Full incident description", "type": "textarea", "required": True},
        ],
        "system": "You are an Indian cyber-crime reporting assistant. Return STRICT JSON with: 'applicable_sections' (array of {'act':string,'section':string,'why':string} — cover IT Act 2000, BNS/IPC), 'immediate_actions' (array of strings), 'where_to_report' (array of strings — cybercrime.gov.in, 1930 helpline, local police), 'evidence_to_preserve' (array of strings), 'draft_complaint' (string — a ready-to-file FIR-style narrative), 'timeline_expectation' (string).",
    },
    "ip-management": {
        "title": "Intellectual Property Portal",
        "fields": [
            {"key": "ip_type", "label": "Type (Trademark / Copyright / Patent / Design)", "type": "text", "required": True},
            {"key": "subject", "label": "Name / subject of IP", "type": "text", "required": True},
            {"key": "owner", "label": "Owner / Applicant", "type": "text"},
            {"key": "description", "label": "Brief description", "type": "textarea"},
        ],
        "system": "You are an Indian IP-law expert. Return STRICT JSON with: 'applicable_law' (string), 'registration_authority' (string), 'filing_steps' (array of strings), 'required_documents' (array of strings), 'government_fees_estimate' (string), 'timeline_estimate' (string), 'protection_scope' (string), 'renewal_period' (string), 'risks_and_tips' (array of strings).",
    },
    "e-governance": {
        "title": "E-Governance Complaint",
        "fields": [
            {"key": "department", "label": "Department / Authority", "type": "text", "required": True},
            {"key": "issue", "label": "Nature of issue", "type": "text", "required": True},
            {"key": "location", "label": "State / City", "type": "text"},
            {"key": "description", "label": "Detailed complaint", "type": "textarea", "required": True},
        ],
        "system": "You are an Indian public-grievance expert. Return STRICT JSON with: 'best_portal' (string — e.g. CPGRAMS, state grievance portal, Municipal portal), 'portal_url_hint' (string), 'draft_complaint' (string — polished text ready to submit), 'supporting_documents' (array of strings), 'escalation_ladder' (array of strings — who to escalate to at each stage), 'expected_response_time' (string), 'legal_recourse_if_ignored' (array of strings — e.g. RTI, writ petition, Lokayukta).",
    },
    "consumer": {
        "title": "Consumer Grievance",
        "fields": [
            {"key": "product_service", "label": "Product / Service", "type": "text", "required": True},
            {"key": "seller", "label": "Seller / Company", "type": "text", "required": True},
            {"key": "amount", "label": "Amount involved (₹)", "type": "text"},
            {"key": "issue", "label": "Describe the issue", "type": "textarea", "required": True},
        ],
        "system": "You are an Indian consumer-law expert (Consumer Protection Act 2019). Return STRICT JSON with: 'applicable_forum' (string — District/State/National Commission based on value), 'jurisdictional_threshold' (string), 'legal_grounds' (array of strings), 'reliefs_available' (array of strings), 'draft_complaint' (string — full complaint under Sec 35 CPA 2019 style), 'documents_to_attach' (array of strings), 'court_fee_estimate' (string), 'timeline' (string), 'online_portal' (string — e.g. edaakhil.nic.in), 'quick_route' (string — National Consumer Helpline 1915).",
    },
    "compliance": {
        "title": "Compliance Monitoring",
        "fields": [
            {"key": "business_type", "label": "Business type", "type": "text", "required": True},
            {"key": "state", "label": "State of operation", "type": "text"},
            {"key": "employees", "label": "No. of employees", "type": "text"},
            {"key": "turnover", "label": "Annual turnover (₹)", "type": "text"},
            {"key": "sector", "label": "Sector / Industry", "type": "text"},
        ],
        "system": "You are an Indian corporate compliance expert. Return STRICT JSON with: 'mandatory_registrations' (array of {'name':string,'authority':string,'why':string}), 'periodic_filings' (array of {'name':string,'frequency':string,'due':string}), 'labour_law_compliance' (array of strings — EPF, ESI, Shops Act, Gratuity, POSH etc.), 'tax_compliance' (array of strings — GST, TDS, Income Tax), 'sector_specific' (array of strings), 'penalty_risks' (array of strings), 'compliance_calendar_priority' (array of strings — top 5 most urgent).",
    },
    "evidence": {
        "title": "Digital Evidence Vault",
        "fields": [
            {"key": "evidence_type", "label": "Type (screenshot / chat / video / audio / doc)", "type": "text", "required": True},
            {"key": "matter", "label": "Related matter / case", "type": "text"},
            {"key": "description", "label": "What does the evidence show?", "type": "textarea", "required": True},
        ],
        "system": "You are an Indian digital-evidence expert. Return STRICT JSON with: 'admissibility_under' (string — Sec 65B Evidence Act, BSA 2023), 'section_65b_certificate_needed' (boolean), 'preservation_steps' (array of strings — hash, chain of custody, metadata), 'authenticity_checklist' (array of strings), 'common_challenges' (array of strings), 'draft_65b_certificate' (string — template with placeholders), 'best_storage_practice' (array of strings).",
    },
    "odr": {
        "title": "Online Dispute Resolution",
        "fields": [
            {"key": "dispute_type", "label": "Dispute type", "type": "text", "required": True},
            {"key": "amount", "label": "Amount / value in dispute (₹)", "type": "text"},
            {"key": "parties", "label": "Parties involved", "type": "text"},
            {"key": "description", "label": "Describe the dispute", "type": "textarea", "required": True},
        ],
        "system": "You are an Indian ODR (Online Dispute Resolution) expert. Return STRICT JSON with: 'suitable_odr_platforms' (array of strings — SAMA, Presolv360, Jupitice, ODRways, CADRE etc.), 'recommended_mode' ('mediation'|'conciliation'|'arbitration'), 'why_recommended' (string), 'process_steps' (array of strings), 'cost_estimate' (string), 'timeline' (string), 'legal_backing' (array of strings — Arbitration & Conciliation Act 1996, Mediation Act 2023), 'draft_notice_of_dispute' (string).",
    },
    "risk": {
        "title": "Legal Risk Assessment",
        "fields": [
            {"key": "situation", "label": "Describe your situation / decision", "type": "textarea", "required": True},
            {"key": "context", "label": "Business or personal context", "type": "text"},
        ],
        "system": "You are an Indian legal risk assessor. Return STRICT JSON with: 'overall_risk' ('low'|'medium'|'high'), 'risk_score' (integer 0-100), 'risk_areas' (array of {'area':string,'severity':'low|medium|high','explanation':string}), 'mitigation_steps' (array of strings), 'legal_provisions_involved' (array of strings), 'red_lines_do_not_cross' (array of strings), 'recommended_professional_help' (string).",
    },
    "traffic": {
        "title": "Traffic Violation Manager",
        "fields": [
            {"key": "violation", "label": "Alleged violation", "type": "text", "required": True},
            {"key": "vehicle", "label": "Vehicle number", "type": "text"},
            {"key": "location", "label": "Location & date", "type": "text"},
            {"key": "fine_amount", "label": "Fine amount (₹)", "type": "text"},
            {"key": "details", "label": "Your side of the story", "type": "textarea"},
        ],
        "system": "You are an Indian motor-vehicle-law expert (MV Act 1988 as amended 2019). Return STRICT JSON with: 'applicable_section' (string), 'legal_fine_range' (string), 'is_compoundable' (boolean), 'options_available' (array of strings — pay online, contest in Lok Adalat, virtual court), 'contest_grounds' (array of strings), 'documents_needed' (array of strings), 'draft_contest_letter' (string), 'risk_of_contesting' (string), 'payment_portals' (array of strings — Parivahan, state e-challan portal).",
    },
    "rti": {
        "title": "RTI Application Tracker",
        "fields": [
            {"key": "public_authority", "label": "Public Authority / Department", "type": "text", "required": True},
            {"key": "state_or_central", "label": "State or Central?", "type": "text"},
            {"key": "info_sought", "label": "Information sought", "type": "textarea", "required": True},
            {"key": "purpose", "label": "Purpose (optional)", "type": "text"},
        ],
        "system": "You are an Indian RTI (Right to Information Act 2005) expert. Return STRICT JSON with: 'correct_pio_hint' (string — how to identify the right PIO), 'draft_rti_application' (string — full application text under Sec 6, with placeholders for name/address/date), 'fee' (string — ₹10 typical, exemptions for BPL), 'payment_modes' (array of strings — IPO, DD, court fee stamp, online rtionline.gov.in), 'expected_reply_time' (string — 30 days, 48 hours if life/liberty), 'first_appeal_process' (string — Sec 19(1)), 'second_appeal_process' (string — Sec 19(3) CIC/SIC), 'grounds_of_appeal' (array of strings), 'tips' (array of strings).",
    },
    "e-notary": {
        "title": "E-Notary Management",
        "fields": [
            {"key": "document_type", "label": "Document type (affidavit, agreement, POA…)", "type": "text", "required": True},
            {"key": "purpose", "label": "Purpose of notarisation", "type": "text"},
            {"key": "state", "label": "State", "type": "text"},
        ],
        "system": "You are an Indian notarisation expert (Notaries Act 1952). Return STRICT JSON with: 'is_notarisation_needed' (string — yes/no + why), 'stamp_duty_hint' (string), 'documents_to_carry' (array of strings), 'witnesses_needed' (integer), 'estimated_fee' (string), 'e_notary_availability' (string — many states now allow), 'process_steps' (array of strings), 'legal_effect' (string), 'red_flags_to_avoid' (array of strings).",
    },
    "judicial-analytics": {
        "title": "Judicial Data Analytics",
        "fields": [
            {"key": "topic", "label": "Topic / issue to analyse", "type": "text", "required": True},
            {"key": "court", "label": "Court focus (Supreme Court / HC / District)", "type": "text"},
        ],
        "system": "You are an Indian judicial data analyst. Return STRICT JSON with: 'landmark_cases' (array of {'case':string,'citation':string,'year':string,'holding':string}), 'trend_summary' (string — how has jurisprudence evolved), 'majority_position' (string), 'dissenting_view' (string), 'pendency_context' (string), 'success_rate_hint' (string — qualitative), 'strategic_insight' (string — how litigants can use these trends).",
    },
    # ---- Advanced AI Features (non-flagship) ----
    "client-crm": {
        "title": "Legal Client CRM Assistant",
        "fields": [
            {"key": "client_name", "label": "Client name", "type": "text", "required": True},
            {"key": "matter", "label": "Matter type", "type": "text"},
            {"key": "last_interaction", "label": "Last interaction summary", "type": "textarea"},
        ],
        "system": "You are a CRM assistant for Indian advocates. Return STRICT JSON with: 'client_stage' ('new_lead'|'engaged'|'active_matter'|'closed'), 'next_action' (string), 'follow_up_date_hint' (string), 'communication_draft' (string — polished email/WhatsApp message to send), 'billing_reminder' (string), 'documents_pending' (array of strings), 'retention_tips' (array of strings).",
    },
    "case-agent": {
        "title": "Court Case Tracking Agent",
        "fields": [
            {"key": "cnr", "label": "CNR / Case Number", "type": "text", "required": True},
            {"key": "court", "label": "Court", "type": "text"},
            {"key": "last_order", "label": "Last order / status", "type": "textarea"},
        ],
        "system": "You are an AI agent for tracking Indian court cases. Return STRICT JSON with: 'inferred_stage' (string), 'predicted_next_steps' (array of strings), 'documents_to_prepare' (array of strings), 'monitoring_plan' (array of strings — which portals to check when), 'contingency_plans' (array of strings), 'client_update_draft' (string — plain-English update to send the client).",
    },
    "voice": {
        "title": "Voice-Based Legal Assistant",
        "fields": [
            {"key": "spoken_query", "label": "Type what you'd say (voice input coming soon)", "type": "textarea", "required": True},
            {"key": "language", "label": "Preferred language", "type": "text"},
        ],
        "system": (
            "You are a conversational Indian legal helper. The user has a preferred language "
            "(Hindi, Tamil, Telugu, Bengali, Marathi, English, etc.). Answer ENTIRELY in that "
            "language — every field of your response, including all key points, next actions and "
            "disclaimers. Do NOT leave any text in English unless the preferred language IS English. "
            "Proper nouns (personal names, company names) may stay in their original script, but all "
            "explanatory text, legal terms and headings must be in the requested language.\n\n"
            "Return STRICT JSON with these keys:\n"
            "  'answer' (string — spoken-style, plain, in requested language),\n"
            "  'key_points' (array of strings, ALL in requested language),\n"
            "  'next_action' (string, in requested language),\n"
            "  'disclaimer' (string, in requested language),\n"
            "  'section_labels' (object with keys 'answer','key_points','next_action','disclaimer','read_aloud' — "
            "each value is the localized label for that section in the requested language, e.g. for Hindi: "
            "{'answer':'उत्तर','key_points':'मुख्य बिंदु','next_action':'अगली कार्रवाई','disclaimer':'अस्वीकरण','read_aloud':'सुनें'}). "
            "For English, use natural English labels. Return ONLY JSON, no markdown fencing."
        ),
    },
    "multilang": {
        "title": "Multi-Language Legal Support",
        "fields": [
            {"key": "text", "label": "English legal text to translate & simplify", "type": "textarea", "required": True},
            {"key": "target_language", "label": "Target Indian language (Hindi, Tamil, Telugu, Bengali, Marathi, Gujarati, Kannada, Malayalam, Punjabi, Urdu)", "type": "text", "required": True},
        ],
        "system": (
            "You are an Indian legal translator. Translate the provided English text into the target "
            "Indian language, and produce all output ENTIRELY in that target language (except the "
            "'english' side of the glossary). Do not leave any explanatory text in English.\n\n"
            "Return STRICT JSON with these keys:\n"
            "  'translation' (string — full text translated into the target language),\n"
            "  'plain_language_summary' (string — simplified summary, IN target language),\n"
            "  'key_terms_glossary' (array of {'english': string, 'translated': string, 'meaning': string} — "
            "'english' stays English, 'translated' and 'meaning' both in target language),\n"
            "  'cultural_notes' (array of strings, IN target language),\n"
            "  'section_labels' (object with keys 'translation','plain_language_summary','key_terms_glossary','cultural_notes' — "
            "each value the localized label for that section in the target language). "
            "Return ONLY JSON, no markdown fencing."
        ),
    },
    "mock-court": {
        "title": "Mock Court (Law Student Practice)",
        "fields": [
            {"key": "case_topic", "label": "Case topic / moot problem", "type": "text", "required": True},
            {"key": "side", "label": "Side you are arguing (Petitioner / Respondent / Prosecution / Defence)", "type": "text", "required": True},
            {"key": "level", "label": "Court (Trial / HC / SC)", "type": "text"},
        ],
        "system": "You are a mock-court coach for Indian law students. Return STRICT JSON with: 'issues_framed' (array of strings), 'arguments_for_side' (array of {'argument':string,'authorities':array of strings}), 'anticipated_opposing_arguments' (array of strings), 'rebuttals' (array of strings), 'landmark_cases_to_cite' (array of {'case':string,'citation':string,'relevance':string}), 'closing_statement_draft' (string), 'judge_questions_to_expect' (array of strings), 'presentation_tips' (array of strings).",
    },
    "marketplace": {
        "title": "Lawyer Marketplace",
        "fields": [
            {"key": "matter", "label": "What matter do you need help with?", "type": "textarea", "required": True},
            {"key": "city", "label": "City", "type": "text", "required": True},
            {"key": "budget", "label": "Budget (₹)", "type": "text"},
        ],
        "system": "You are an assistant helping Indian users choose the right lawyer. Return STRICT JSON with: 'required_specialisation' (string), 'seniority_needed' ('junior'|'mid'|'senior'), 'typical_fee_range_in_city' (string), 'red_flags_when_choosing_lawyer' (array of strings), 'questions_to_ask_before_hiring' (array of strings), 'expected_documents_lawyer_will_ask' (array of strings), 'engagement_letter_essentials' (array of strings), 'shortlist_criteria' (array of strings).",
    },
}


class ModuleReq(BaseModel):
    slug: str
    inputs: Dict[str, Any] = {}


@api.get("/module/{slug}/spec")
async def module_spec(slug: str):
    spec = MODULE_SPECS.get(slug)
    if not spec:
        raise HTTPException(status_code=404, detail="Unknown module")
    return {"slug": slug, "title": spec["title"], "fields": spec["fields"]}


@api.post("/module/run")
async def module_run(body: ModuleReq, user=Depends(current_user)):
    spec = MODULE_SPECS.get(body.slug)
    if not spec:
        raise HTTPException(status_code=404, detail="Unknown module")
    # Validate required
    for f in spec["fields"]:
        if f.get("required") and not str(body.inputs.get(f["key"], "")).strip():
            raise HTTPException(status_code=400, detail=f"Field '{f['label']}' is required.")
    # Build prompt
    lines = [f"MODULE: {spec['title']}", "INPUTS:"]
    for f in spec["fields"]:
        v = body.inputs.get(f["key"], "")
        if v:
            lines.append(f"- {f['label']}: {v}")
    prompt = "\n".join(lines) + "\n\nReturn ONLY JSON as per the schema."
    raw = await llm_once(spec["system"], prompt)
    data = extract_json(raw)
    rec = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "slug": body.slug,
        "inputs": body.inputs,
        "result": data,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.module_runs.insert_one(rec)
    return {"id": rec["id"], "slug": body.slug, "title": spec["title"], "result": data}


@api.get("/module/history/{slug}")
async def module_history(slug: str, user=Depends(current_user)):
    rows = await db.module_runs.find(
        {"user_id": user["id"], "slug": slug}, {"_id": 0}
    ).sort("created_at", -1).to_list(20)
    return rows


# ---------------------------------------------------------------------------
# File upload — PDF / DOCX text extraction for analyzers
# ---------------------------------------------------------------------------
def extract_text_from_upload(filename: str, data: bytes) -> str:
    name = (filename or "").lower()
    if name.endswith(".pdf"):
        try:
            reader = pypdf.PdfReader(io.BytesIO(data))
            text = "\n".join((p.extract_text() or "") for p in reader.pages)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Could not read PDF: {e}")
    elif name.endswith(".docx"):
        try:
            doc = DocxDocument(io.BytesIO(data))
            text = "\n".join(p.text for p in doc.paragraphs if p.text.strip())
            # include tables too
            for tbl in doc.tables:
                for row in tbl.rows:
                    text += "\n" + " | ".join(c.text for c in row.cells)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Could not read DOCX: {e}")
    elif name.endswith(".txt"):
        try:
            text = data.decode("utf-8", errors="ignore")
        except Exception:
            raise HTTPException(status_code=400, detail="Could not read TXT file")
    else:
        raise HTTPException(status_code=400, detail="Unsupported file. Upload .pdf, .docx or .txt")
    text = (text or "").strip()
    if len(text) < 30:
        raise HTTPException(status_code=400, detail="Extracted text is too short. Try a different file.")
    return text[:60000]


@api.post("/upload/extract")
async def upload_extract(file: UploadFile = File(...), user=Depends(current_user)):
    """Extract raw text from an uploaded PDF / DOCX / TXT — used by analyzer UIs."""
    data = await file.read()
    text = extract_text_from_upload(file.filename, data)
    return {
        "filename": file.filename,
        "chars": len(text),
        "preview": text[:400],
        "text": text,
    }


@api.post("/analyze/document/upload")
async def analyze_document_upload(file: UploadFile = File(...), user=Depends(current_user)):
    data = await file.read()
    text = extract_text_from_upload(file.filename, data)
    raw = await llm_once(SYS_DOC_ANALYZER, text[:20000])
    data_json = extract_json(raw)
    rec = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "type": "document_analysis",
        "filename": file.filename,
        "input_preview": text[:200],
        "result": data_json,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.analyses.insert_one(rec)
    return {"id": rec["id"], "filename": file.filename, "chars": len(text), "result": data_json}


@api.post("/review/contract/upload")
async def review_contract_upload(file: UploadFile = File(...), user=Depends(current_user)):
    data = await file.read()
    text = extract_text_from_upload(file.filename, data)
    raw = await llm_once(SYS_CONTRACT, text[:20000])
    data_json = extract_json(raw)
    rec = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "type": "contract_review",
        "filename": file.filename,
        "input_preview": text[:200],
        "result": data_json,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.analyses.insert_one(rec)
    return {"id": rec["id"], "filename": file.filename, "chars": len(text), "result": data_json}


# ---------------------------------------------------------------------------
# Bulk contract review — upload many, get a comparative league table
# ---------------------------------------------------------------------------
async def _review_one_contract(filename: str, data: bytes) -> Dict[str, Any]:
    """Run one contract through the reviewer; never raise — return {ok:false, error} on failure."""
    try:
        text = extract_text_from_upload(filename, data)
    except HTTPException as e:
        return {"ok": False, "filename": filename, "error": e.detail}
    except Exception as e:
        return {"ok": False, "filename": filename, "error": f"Extraction failed: {e}"}
    try:
        raw = await llm_once(SYS_CONTRACT, text[:20000])
        result = extract_json(raw)
    except Exception as e:
        return {"ok": False, "filename": filename, "error": f"AI review failed: {e}"}
    return {
        "ok": True,
        "filename": filename,
        "chars": len(text),
        "preview": text[:180],
        "full_text": text,
        "result": result,
    }


@api.post("/review/contract/bulk")
async def review_contract_bulk(files: List[UploadFile] = File(...), user=Depends(current_user)):
    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded")
    if len(files) > 20:
        raise HTTPException(status_code=400, detail="Max 20 contracts per batch")

    payloads: List[Any] = []
    for f in files:
        content = await f.read()
        if len(content) > 15 * 1024 * 1024:
            payloads.append({"ok": False, "filename": f.filename, "error": "File too large (>15 MB)"})
            continue
        payloads.append((f.filename, content))

    import asyncio as _aio
    tasks = []
    for item in payloads:
        if isinstance(item, tuple):
            tasks.append(_review_one_contract(item[0], item[1]))
        else:
            tasks.append(_return_value(item))
    results = await _aio.gather(*tasks)

    # Build league table
    league = []
    for r in results:
        if not r.get("ok"):
            league.append({
                "filename": r.get("filename"),
                "ok": False,
                "error": r.get("error"),
            })
            continue
        res = r.get("result", {}) or {}
        league.append({
            "filename": r.get("filename"),
            "ok": True,
            "chars": r.get("chars"),
            "preview": r.get("preview"),
            "full_text": r.get("full_text"),
            "contract_type": res.get("contract_type"),
            "overall_risk": res.get("overall_risk"),
            "risk_score": res.get("risk_score") if isinstance(res.get("risk_score"), int) else None,
            "summary": res.get("summary"),
            "red_flags_count": len(res.get("red_flags") or []),
            "missing_count": len(res.get("missing_protections") or []),
            "favourable_count": len(res.get("favourable_points") or []),
            "result": res,
        })

    # Aggregate stats
    ok_items = [x for x in league if x.get("ok") and isinstance(x.get("risk_score"), int)]
    scores = [x["risk_score"] for x in ok_items]
    stats = {
        "total": len(files),
        "processed": len([x for x in league if x.get("ok")]),
        "failed": len([x for x in league if not x.get("ok")]),
        "avg_risk_score": round(sum(scores) / len(scores), 1) if scores else None,
        "highest_risk": max(scores) if scores else None,
        "lowest_risk": min(scores) if scores else None,
        "high_risk_count": len([x for x in ok_items if (x.get("overall_risk") == "high")]),
    }

    batch_id = str(uuid.uuid4())
    rec = {
        "id": batch_id,
        "user_id": user["id"],
        "stats": stats,
        "items": league,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.contract_batches.insert_one(rec)
    return {"batch_id": batch_id, "stats": stats, "items": league}


async def _return_value(v):  # tiny helper for gather with pre-computed errors
    return v


@api.get("/review/batch/{batch_id}")
async def get_contract_batch(batch_id: str, user=Depends(current_user)):
    doc = await db.contract_batches.find_one({"id": batch_id, "user_id": user["id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Batch not found")
    return doc


@api.get("/review/batches")
async def list_contract_batches(user=Depends(current_user)):
    rows = await db.contract_batches.find(
        {"user_id": user["id"]},
        {"_id": 0, "id": 1, "stats": 1, "created_at": 1},
    ).sort("created_at", -1).to_list(30)
    return rows


# ---------------------------------------------------------------------------
# CNR live tracking — eCourts CNR portal
# The public eCourts CNR service (services.ecourts.gov.in) requires a captcha
# for direct HTTP fetches, so fully-automated live lookup is not reliably
# possible without a paid third-party API. We therefore combine:
#   1. CNR format validation (16-char alphanumeric)
#   2. A best-effort HEAD/GET ping to confirm the portal is reachable
#   3. AI-inferred stage + timeline based on the CNR structure & user-provided
#      last known status (clearly labelled as inferred, not live).
#   4. A deep link the user can open in the official portal.
# ---------------------------------------------------------------------------
CNR_REGEX = re.compile(r"^[A-Z]{2}[A-Z0-9]{2}\d{12}$", re.IGNORECASE)
ECOURTS_URL = "https://services.ecourts.gov.in/ecourtindia_v6/"


class CNRReq(BaseModel):
    cnr: str
    last_known_status: Optional[str] = None


@api.post("/cnr/track")
async def cnr_track(body: CNRReq, user=Depends(current_user)):
    cnr = body.cnr.strip().upper().replace(" ", "").replace("-", "")
    if len(cnr) != 16 or not CNR_REGEX.match(cnr):
        raise HTTPException(
            status_code=400,
            detail="Invalid CNR. Expected 16-character format like 'DLCT010012342024' (State-Court-Serial-Year).",
        )

    # Decode CNR structure
    state_code = cnr[0:2]
    court_code = cnr[2:4]
    serial = cnr[4:10]
    year = cnr[12:16]  # last 4 = year of registration in most CNRs

    STATE_MAP = {
        "DL": "Delhi", "MH": "Maharashtra", "KA": "Karnataka", "TN": "Tamil Nadu",
        "AP": "Andhra Pradesh", "TS": "Telangana", "KL": "Kerala", "GJ": "Gujarat",
        "RJ": "Rajasthan", "UP": "Uttar Pradesh", "MP": "Madhya Pradesh", "WB": "West Bengal",
        "BR": "Bihar", "OD": "Odisha", "PB": "Punjab", "HR": "Haryana", "JH": "Jharkhand",
        "CT": "Chhattisgarh", "AS": "Assam", "HP": "Himachal Pradesh", "UT": "Uttarakhand",
        "GA": "Goa", "MN": "Manipur", "TR": "Tripura", "SK": "Sikkim", "NL": "Nagaland",
        "MZ": "Mizoram", "AR": "Arunachal Pradesh", "JK": "Jammu & Kashmir", "LA": "Ladakh",
    }

    # Check portal reachability
    portal_ok = False
    try:
        async with httpx.AsyncClient(timeout=6.0, follow_redirects=True) as cx:
            r = await cx.get(ECOURTS_URL)
            portal_ok = r.status_code < 500
    except Exception:
        portal_ok = False

    # AI-inferred stage from CNR + optional last known status
    prompt = (
        f"CNR: {cnr}\n"
        f"Registered year: {year}\n"
        f"State: {STATE_MAP.get(state_code, state_code)}\n"
        f"Court code: {court_code}\n"
        f"Serial: {serial}\n"
        f"User provided last known status: {body.last_known_status or 'not provided'}\n\n"
        "Infer typical case stage, next steps, and how to monitor via eCourts. "
        "Do NOT invent a specific hearing date or judge — clearly say 'to be confirmed via eCourts'."
    )
    sys = (
        "You are an Indian court-case tracking assistant. Return STRICT JSON with keys: "
        "'inferred_stage' (string, e.g. 'Pleadings complete', 'Evidence stage', 'Arguments', 'Awaiting judgment'), "
        "'estimated_age_days' (integer approximate), "
        "'typical_next_steps' (array of strings), "
        "'documents_to_prepare' (array of strings), "
        "'how_to_monitor' (array of strings — mention eCourts portal, SMS alerts, cause list check), "
        "'red_flags' (array of strings — long pendency, missed dates etc.), "
        "'client_update_draft' (string — 2-3 sentence plain-English update). "
        "Return ONLY JSON."
    )
    raw = await llm_once(sys, prompt)
    ai = extract_json(raw)

    portal_deep_link = (
        f"{ECOURTS_URL}?p=cnr_status/searchByCNR&cnr={cnr}"
    )

    result = {
        "cnr": cnr,
        "decoded": {
            "state_code": state_code,
            "state_name": STATE_MAP.get(state_code, "Unknown"),
            "court_code": court_code,
            "serial_no": serial,
            "registered_year": year,
        },
        "portal_reachable": portal_ok,
        "official_portal_url": ECOURTS_URL,
        "portal_deep_link": portal_deep_link,
        "live_data": None,   # captcha-protected; user must open the deep link
        "live_lookup_note": (
            "The eCourts CNR service is captcha-protected — automated live scrape is unreliable. "
            "Click the deep link to view the live status on the official portal. "
            "Meanwhile the AI has inferred the likely stage from the CNR structure and your notes."
        ),
        "ai_inferred": ai,
    }

    rec = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "cnr": cnr,
        "result": result,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.cnr_lookups.insert_one(rec)
    return result


# ---------------------------------------------------------------------------
# Lawyer Directory
# ---------------------------------------------------------------------------
LAWYER_SEED = [
    # (name, city, state, specs, years, rating, price, gender, langs, bio)
    ("Adv. Anita Deshpande", "Mumbai", "Maharashtra", ["Family", "Divorce", "Child Custody"], 18, 4.8, 3500, "F", ["Hindi","English","Marathi"], "Senior family court advocate handling contested divorces, mediation and custody at Bombay HC."),
    ("Adv. Rohan Mehta", "Mumbai", "Maharashtra", ["Corporate", "M&A", "Compliance"], 12, 4.7, 6000, "M", ["English","Hindi","Gujarati"], "Ex-BigLaw associate now practising corporate advisory and cross-border M&A."),
    ("Adv. Priya Iyer", "Bengaluru", "Karnataka", ["IP", "Trademark", "Copyright"], 9, 4.9, 4500, "F", ["English","Tamil","Kannada"], "IP specialist for startups — trademark filing, oppositions, and copyright disputes."),
    ("Adv. Karthik Reddy", "Bengaluru", "Karnataka", ["Criminal", "Bail", "Cyber Crime"], 15, 4.6, 5000, "M", ["English","Telugu","Kannada"], "Trial-court criminal defence, bail applications and cyber-crime matters."),
    ("Adv. Sara Khan", "Delhi", "Delhi", ["Consumer", "RTI", "Public Interest"], 8, 4.7, 2500, "F", ["Hindi","English","Urdu"], "Public-interest lawyer taking consumer disputes and RTI matters pan-India."),
    ("Adv. Vikram Singh", "Delhi", "Delhi", ["Criminal", "White Collar"], 22, 4.9, 12000, "M", ["Hindi","English","Punjabi"], "Designated senior with 20+ years in Supreme Court criminal appeals and white-collar defence."),
    ("Adv. Meera Nair", "Kochi", "Kerala", ["Family", "Property", "Wills"], 14, 4.8, 3000, "F", ["Malayalam","English"], "Family and property lawyer — partitions, wills and matrimonial disputes."),
    ("Adv. Aditya Sharma", "Delhi", "Delhi", ["Tax", "GST", "Income Tax"], 11, 4.6, 5500, "M", ["Hindi","English"], "Direct & indirect tax practice — appears before ITAT, GSTAT and High Court."),
    ("Adv. Neha Choudhary", "Jaipur", "Rajasthan", ["Family", "Women's Rights", "Domestic Violence"], 7, 4.9, 2000, "F", ["Hindi","English"], "Specialises in domestic-violence protection orders and Sec 498A defence."),
    ("Adv. Farhan Sheikh", "Hyderabad", "Telangana", ["Real Estate", "RERA"], 10, 4.5, 4000, "M", ["Urdu","Hindi","English","Telugu"], "RERA disputes, builder-buyer matters and title due-diligence."),
    ("Adv. Kavya Gupta", "Chennai", "Tamil Nadu", ["Corporate", "Startup", "Contracts"], 6, 4.8, 3500, "F", ["Tamil","English"], "Startup GC-for-hire — cap table, ESOP, term sheets and contracts."),
    ("Adv. Prakash Rao", "Chennai", "Tamil Nadu", ["Labour", "Employment"], 20, 4.7, 3800, "M", ["Tamil","English","Telugu"], "Two-decade labour law veteran — industrial disputes, retrenchment, POSH."),
    ("Adv. Ritika Bansal", "Chandigarh", "Punjab", ["Family", "Divorce", "NRI Divorce"], 9, 4.7, 3200, "F", ["Punjabi","Hindi","English"], "NRI-specific divorce, mutual consent and international child custody."),
    ("Adv. Sameer Kulkarni", "Pune", "Maharashtra", ["IP", "Patent"], 13, 4.8, 5500, "M", ["Marathi","English","Hindi"], "Registered patent agent with strong pharma & software patent practice."),
    ("Adv. Divya Menon", "Bengaluru", "Karnataka", ["Employment", "POSH"], 8, 4.9, 3800, "F", ["English","Malayalam","Kannada"], "POSH inquiries, sexual harassment matters and employment disputes."),
    ("Adv. Ajay Verma", "Lucknow", "Uttar Pradesh", ["Criminal", "Cheque Bounce"], 16, 4.5, 2500, "M", ["Hindi","English"], "138 NI Act specialist and criminal trial court advocate."),
    ("Adv. Sunita Patel", "Ahmedabad", "Gujarat", ["Consumer", "Insurance Claims"], 11, 4.6, 2800, "F", ["Gujarati","Hindi","English"], "Insurance claim recovery and consumer commission appearances."),
    ("Adv. Ravi Krishnan", "Bengaluru", "Karnataka", ["Cyber Crime", "Data Protection", "DPDP"], 6, 4.8, 5000, "M", ["English","Tamil"], "DPDP Act, data breach response and cyber-crime defence for individuals & firms."),
    ("Adv. Pooja Malhotra", "Gurugram", "Haryana", ["Corporate", "Startup", "VC"], 10, 4.8, 6500, "F", ["Hindi","English","Punjabi"], "VC term sheets, SHA/SSA, exits and startup financing."),
    ("Adv. Manish Agarwal", "Kolkata", "West Bengal", ["Property", "Real Estate"], 19, 4.5, 3200, "M", ["Bengali","Hindi","English"], "Property title, partitions and Calcutta High Court civil practice."),
    ("Adv. Zoya Ansari", "Delhi", "Delhi", ["Immigration", "OCI", "Passport"], 7, 4.7, 3500, "F", ["Hindi","English","Urdu"], "OCI cards, passport impounding matters, immigration appeals."),
    ("Adv. Suresh Naidu", "Visakhapatnam", "Andhra Pradesh", ["Criminal", "Family"], 12, 4.4, 2200, "M", ["Telugu","English"], "General trial court practice — criminal and family matters."),
    ("Adv. Isha Kapoor", "Delhi", "Delhi", ["Media", "Defamation", "Entertainment"], 9, 4.8, 5500, "F", ["Hindi","English"], "Defamation, celebrity rights and OTT / broadcasting matters."),
    ("Adv. Deepak Joshi", "Dehradun", "Uttarakhand", ["Family", "Property"], 15, 4.6, 2400, "M", ["Hindi","English","Garhwali"], "Hills-region property disputes and family law."),
    ("Adv. Rani Balaji", "Chennai", "Tamil Nadu", ["Consumer", "E-commerce Disputes"], 5, 4.7, 2200, "F", ["Tamil","English"], "Online-shopping and e-commerce consumer commission cases."),
    ("Adv. Nikhil Bhatt", "Mumbai", "Maharashtra", ["Arbitration", "Commercial"], 14, 4.9, 8500, "M", ["Gujarati","Hindi","English"], "Domestic & international commercial arbitration under A&C Act 1996."),
    ("Adv. Simran Kaur", "Chandigarh", "Punjab", ["Motor Accident", "MACT"], 8, 4.6, 2000, "F", ["Punjabi","Hindi","English"], "Motor accident compensation claims before MACT."),
    ("Adv. Harshit Jain", "Indore", "Madhya Pradesh", ["GST", "Tax"], 7, 4.5, 3000, "M", ["Hindi","English"], "GST advisory, audits and appellate practice."),
    ("Adv. Bhavana Rao", "Hyderabad", "Telangana", ["Family", "Adoption"], 11, 4.8, 3200, "F", ["Telugu","English"], "Adoption, guardianship and family court practice."),
    ("Adv. Tarun Bose", "Kolkata", "West Bengal", ["IP", "Software Copyright"], 6, 4.7, 3800, "M", ["Bengali","English","Hindi"], "Software copyright, trade secrets and IT contract disputes."),
    ("Adv. Kritika Sen", "Bhubaneswar", "Odisha", ["Environment", "Public Interest"], 10, 4.9, 3000, "F", ["Odia","Hindi","English"], "Environmental PILs before NGT and Orissa HC."),
    ("Adv. Mohit Aggarwal", "Delhi", "Delhi", ["Insolvency", "IBC", "NCLT"], 12, 4.8, 8000, "M", ["Hindi","English"], "IBC / insolvency resolution and NCLT/NCLAT appearances."),
    ("Adv. Aparna Ghosh", "Kolkata", "West Bengal", ["Family", "Divorce"], 17, 4.7, 3000, "F", ["Bengali","English","Hindi"], "Divorce, maintenance and Guardianship & Wards Act matters."),
    ("Adv. Yash Goyal", "Jaipur", "Rajasthan", ["Cheque Bounce", "Recovery"], 9, 4.5, 2400, "M", ["Hindi","English"], "138 NI Act, money-recovery suits and summary trials."),
    ("Adv. Lakshmi Pillai", "Thiruvananthapuram", "Kerala", ["Constitutional", "Service Law"], 20, 4.9, 7500, "F", ["Malayalam","English"], "Government-service disputes and constitutional writ practice."),
    ("Adv. Rahul Dave", "Ahmedabad", "Gujarat", ["Criminal", "Bail"], 13, 4.6, 3200, "M", ["Gujarati","Hindi","English"], "Trial court criminal defence and anticipatory-bail practice."),
    ("Adv. Nandini Rao", "Mysuru", "Karnataka", ["Family", "Domestic Violence"], 6, 4.8, 2500, "F", ["Kannada","English","Hindi"], "DV Act protection orders, maintenance and mediation."),
    ("Adv. Ashwin Menon", "Bengaluru", "Karnataka", ["Cyber Crime", "Fintech"], 8, 4.9, 5500, "M", ["English","Malayalam"], "Fintech, digital-payment fraud and cyber-crime advisory."),
    ("Adv. Preeti Sinha", "Patna", "Bihar", ["Property", "Family"], 14, 4.5, 2000, "F", ["Hindi","English","Bhojpuri"], "Land dispute, will contests and matrimonial matters."),
    ("Adv. Rajesh Iyer", "Chennai", "Tamil Nadu", ["Arbitration", "Corporate"], 15, 4.7, 6500, "M", ["Tamil","English"], "Commercial disputes, arbitration and company-law matters."),
]


async def _ensure_lawyers_seeded():
    count = await db.lawyers.count_documents({})
    if count >= len(LAWYER_SEED):
        return
    await db.lawyers.delete_many({})
    docs = []
    for i, (name, city, state, specs, years, rating, price, gender, langs, bio) in enumerate(LAWYER_SEED):
        docs.append({
            "id": str(uuid.uuid4()),
            "name": name,
            "city": city,
            "state": state,
            "specialisations": specs,
            "experience_years": years,
            "rating": rating,
            "reviews_count": 20 + (i * 7) % 250,
            "consult_fee": price,
            "gender": gender,
            "languages": langs,
            "bio": bio,
            "verified": True,
            "avatar_seed": name.replace(" ", "").lower(),
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    if docs:
        await db.lawyers.insert_many(docs)


@app.on_event("startup")
async def _startup():
    await _ensure_lawyers_seeded()


@api.get("/lawyers")
async def list_lawyers(
    city: Optional[str] = None,
    specialisation: Optional[str] = None,
    min_experience: Optional[int] = None,
    max_fee: Optional[int] = None,
    min_rating: Optional[float] = None,
    q: Optional[str] = None,
    sort: str = "rating",
    limit: int = 60,
):
    query: Dict[str, Any] = {}
    if city:
        query["city"] = {"$regex": f"^{re.escape(city)}$", "$options": "i"}
    if specialisation:
        query["specialisations"] = {"$regex": specialisation, "$options": "i"}
    if min_experience is not None:
        query["experience_years"] = {"$gte": int(min_experience)}
    if max_fee is not None:
        query["consult_fee"] = {"$lte": int(max_fee)}
    if min_rating is not None:
        query["rating"] = {"$gte": float(min_rating)}
    if q:
        query["$or"] = [
            {"name": {"$regex": q, "$options": "i"}},
            {"bio": {"$regex": q, "$options": "i"}},
            {"specialisations": {"$regex": q, "$options": "i"}},
        ]

    sort_map = {
        "rating": ("rating", -1),
        "experience": ("experience_years", -1),
        "fee_low": ("consult_fee", 1),
        "fee_high": ("consult_fee", -1),
    }
    sk, sd = sort_map.get(sort, ("rating", -1))
    rows = await db.lawyers.find(query, {"_id": 0}).sort(sk, sd).to_list(int(limit))
    return {"total": len(rows), "lawyers": rows}


@api.get("/lawyers/facets")
async def lawyer_facets():
    cities = await db.lawyers.distinct("city")
    specs_raw = await db.lawyers.distinct("specialisations")
    return {
        "cities": sorted([c for c in cities if c]),
        "specialisations": sorted([s for s in specs_raw if s]),
    }


@api.get("/lawyers/{lawyer_id}")
async def get_lawyer(lawyer_id: str):
    doc = await db.lawyers.find_one({"id": lawyer_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Lawyer not found")
    return doc


class ConsultReq(BaseModel):
    lawyer_id: str
    preferred_date: Optional[str] = None
    preferred_time: Optional[str] = None
    matter_summary: str
    phone: Optional[str] = None


@api.post("/lawyers/consult")
async def request_consult(body: ConsultReq, user=Depends(current_user)):
    lawyer = await db.lawyers.find_one({"id": body.lawyer_id}, {"_id": 0})
    if not lawyer:
        raise HTTPException(status_code=404, detail="Lawyer not found")
    if not body.matter_summary.strip():
        raise HTTPException(status_code=400, detail="Please describe your matter")
    rec = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "user_name": user["name"],
        "user_email": user["email"],
        "lawyer_id": body.lawyer_id,
        "lawyer_name": lawyer["name"],
        "preferred_date": body.preferred_date,
        "preferred_time": body.preferred_time,
        "matter_summary": body.matter_summary,
        "phone": body.phone,
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.consult_requests.insert_one(rec)
    return {"id": rec["id"], "status": "pending", "lawyer": lawyer["name"], "fee": lawyer["consult_fee"]}


# ---------------------------------------------------------------------------
# Redline DOCX generator
# ---------------------------------------------------------------------------
_SEV_HL = {
    "high": WD_COLOR_INDEX.RED,
    "medium": WD_COLOR_INDEX.YELLOW,
    "low": WD_COLOR_INDEX.BRIGHT_GREEN,
}


def _add_heading(doc, text, level=1):
    h = doc.add_heading(text, level=level)
    for r in h.runs:
        r.font.color.rgb = RGBColor(0x0F, 0x17, 0x2A)
    return h


def _add_kv(doc, k, v):
    p = doc.add_paragraph()
    r1 = p.add_run(f"{k}: ")
    r1.bold = True
    r2 = p.add_run(str(v))
    return p


def _add_flag_note(doc, idx, flag):
    """Insert a numbered flag annotation block."""
    severity = (flag.get("severity") or "medium").lower()
    p = doc.add_paragraph()
    r = p.add_run(f"⚑ Flag {idx} — {flag.get('clause','(clause)')}")
    r.bold = True
    r.font.size = Pt(11)
    r.font.color.rgb = RGBColor(0x99, 0x1B, 0x1B) if severity == "high" else (
        RGBColor(0x9A, 0x34, 0x12) if severity == "medium" else RGBColor(0x16, 0x65, 0x34)
    )
    # Severity chip
    sev = doc.add_paragraph()
    s = sev.add_run(f"  Severity: {severity.upper()}")
    s.font.size = Pt(9)
    s.font.highlight_color = _SEV_HL.get(severity, WD_COLOR_INDEX.YELLOW)
    # Issue
    p2 = doc.add_paragraph()
    p2.add_run("Issue: ").bold = True
    p2.add_run(flag.get("issue") or "")
    # Suggestion (redline style)
    if flag.get("suggestion"):
        p3 = doc.add_paragraph()
        r_sug = p3.add_run("Suggested edit: ")
        r_sug.bold = True
        r_sug.font.color.rgb = RGBColor(0xC0, 0x00, 0x00)
        r_val = p3.add_run(flag.get("suggestion"))
        r_val.italic = True
        r_val.font.color.rgb = RGBColor(0xC0, 0x00, 0x00)
        r_val.underline = True


def _highlight_clauses_in_body(doc, contract_text: str, red_flags: List[Dict[str, Any]]):
    """Render the contract with risky clauses highlighted. Paragraph-based match."""
    # Split contract into logical paragraphs
    paras = [p for p in re.split(r"\n\s*\n|\r\n\r\n", contract_text) if p.strip()]
    if not paras:
        paras = [ln for ln in contract_text.splitlines() if ln.strip()]

    # Build lowercased search terms from red-flag clause labels
    flag_terms: List[Tuple[str, str]] = []  # (needle_lower, severity)
    for f in red_flags or []:
        clause = (f.get("clause") or "").strip()
        if not clause:
            continue
        # take first 3-6 significant words as a needle
        words = re.findall(r"[A-Za-z0-9']{3,}", clause)[:5]
        if not words:
            continue
        needle = " ".join(words).lower()
        flag_terms.append((needle, (f.get("severity") or "medium").lower()))

    for para in paras:
        low = para.lower()
        matched_sev = None
        for needle, sev in flag_terms:
            # Also try any individual significant word
            if needle in low:
                matched_sev = sev
                break
            for word in needle.split():
                if len(word) >= 5 and word in low:
                    matched_sev = sev
                    break
            if matched_sev:
                break
        p = doc.add_paragraph()
        run = p.add_run(para.strip())
        run.font.size = Pt(10)
        if matched_sev:
            run.font.highlight_color = _SEV_HL.get(matched_sev, WD_COLOR_INDEX.YELLOW)


def _build_redline_docx(contract_text: str, review: Dict[str, Any], source_name: str = "") -> bytes:
    doc = DocxDocument()

    # ---- Header / Cover ----
    _add_heading(doc, "Nyaya Mitra — Contract Redline Report", level=0)
    tag = doc.add_paragraph()
    r = tag.add_run("Confidential legal review · Powered by AI · Not a substitute for licensed counsel")
    r.italic = True
    r.font.size = Pt(9)
    r.font.color.rgb = RGBColor(0x47, 0x55, 0x69)

    doc.add_paragraph()  # spacer

    now_str = datetime.now(timezone.utc).strftime("%d %B %Y, %H:%M UTC")
    _add_kv(doc, "Source", source_name or "pasted-text")
    _add_kv(doc, "Reviewed on", now_str)
    _add_kv(doc, "Contract type", review.get("contract_type") or "—")

    overall = (review.get("overall_risk") or "").upper() or "—"
    score = review.get("risk_score") if isinstance(review.get("risk_score"), int) else "—"
    p_risk = doc.add_paragraph()
    r_r = p_risk.add_run(f"Overall risk: {overall}   ·   Score: {score}/100")
    r_r.bold = True
    r_r.font.size = Pt(12)
    if overall == "HIGH":
        r_r.font.color.rgb = RGBColor(0xDC, 0x26, 0x26)
    elif overall == "MEDIUM":
        r_r.font.color.rgb = RGBColor(0xEA, 0x58, 0x0C)
    else:
        r_r.font.color.rgb = RGBColor(0x16, 0xA3, 0x4A)

    if review.get("summary"):
        _add_heading(doc, "Executive Summary", level=2)
        doc.add_paragraph(review["summary"])

    # ---- Contract body (with highlights) ----
    _add_heading(doc, "Contract Text (risky clauses highlighted)", level=2)
    _highlight_clauses_in_body(doc, contract_text, review.get("red_flags") or [])

    # ---- Redline annotations ----
    red_flags = review.get("red_flags") or []
    if red_flags:
        _add_heading(doc, "Redline Annotations", level=2)
        for i, f in enumerate(red_flags, 1):
            _add_flag_note(doc, i, f)
            doc.add_paragraph()  # spacer

    # ---- Missing protections ----
    if review.get("missing_protections"):
        _add_heading(doc, "Missing Protections", level=2)
        for m in review["missing_protections"]:
            p = doc.add_paragraph(style="List Bullet")
            p.add_run(str(m))

    # ---- Favourable points ----
    if review.get("favourable_points"):
        _add_heading(doc, "Favourable Points", level=2)
        for m in review["favourable_points"]:
            p = doc.add_paragraph(style="List Bullet")
            p.add_run(str(m))

    # ---- Recommendations ----
    if review.get("recommendations"):
        _add_heading(doc, "Recommendations", level=2)
        for m in review["recommendations"]:
            p = doc.add_paragraph(style="List Number")
            p.add_run(str(m))

    # ---- Footer disclaimer ----
    doc.add_paragraph()
    disc = doc.add_paragraph()
    d = disc.add_run(
        "Disclaimer: This is an AI-assisted review under Indian law and is provided for information only. "
        "It does not constitute legal advice. Please have a licensed advocate confirm all conclusions "
        "before acting on this document."
    )
    d.italic = True
    d.font.size = Pt(8)
    d.font.color.rgb = RGBColor(0x47, 0x55, 0x69)

    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


class RedlineFromReviewReq(BaseModel):
    contract_text: str
    review: Dict[str, Any]
    filename: Optional[str] = None


@api.post("/review/contract/redline")
async def redline_from_text(body: ContractReq, user=Depends(current_user)):
    """Take contract text, run AI review, return a redlined DOCX file."""
    if len(body.contract_text.strip()) < 50:
        raise HTTPException(status_code=400, detail="Contract text too short (min 50 chars).")
    raw = await llm_once(SYS_CONTRACT, body.contract_text[:20000])
    review = extract_json(raw)
    docx_bytes = _build_redline_docx(body.contract_text, review, source_name="pasted-text")
    return FastAPIStreamResponse(
        io.BytesIO(docx_bytes),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": 'attachment; filename="nyaya-mitra-redline.docx"'},
    )


@api.post("/review/contract/redline-from-review")
async def redline_from_review(body: RedlineFromReviewReq, user=Depends(current_user)):
    """Given contract_text + existing review JSON, produce the redlined DOCX (no re-analysis)."""
    if not body.contract_text.strip():
        raise HTTPException(status_code=400, detail="Missing contract_text")
    docx_bytes = _build_redline_docx(body.contract_text, body.review or {}, source_name=body.filename or "contract")
    safe = re.sub(r"[^A-Za-z0-9._-]+", "-", (body.filename or "contract"))[:64]
    return FastAPIStreamResponse(
        io.BytesIO(docx_bytes),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="redline-{safe}.docx"'},
    )


@api.post("/review/contract/redline-upload")
async def redline_upload(file: UploadFile = File(...), user=Depends(current_user)):
    """Upload a contract file, run review, return redlined DOCX."""
    data = await file.read()
    text = extract_text_from_upload(file.filename, data)
    raw = await llm_once(SYS_CONTRACT, text[:20000])
    review = extract_json(raw)
    docx_bytes = _build_redline_docx(text, review, source_name=file.filename or "contract")
    safe = re.sub(r"[^A-Za-z0-9._-]+", "-", (file.filename or "contract"))[:64]
    return FastAPIStreamResponse(
        io.BytesIO(docx_bytes),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="redline-{safe}.docx"'},
    )


# ---------------------------------------------------------------------------
# Contract Templates Library
# ---------------------------------------------------------------------------
TEMPLATES: Dict[str, Dict[str, Any]] = {
    "nda-mutual": {
        "title": "Mutual Non-Disclosure Agreement (NDA)",
        "category": "Business",
        "icon": "shield",
        "description": "A balanced two-way confidentiality agreement between two Indian parties. Suitable for evaluating business collaborations.",
        "estimated_pages": 2,
        "fields": [
            {"key": "party_a_name", "label": "Party A — Full legal name", "type": "text", "required": True},
            {"key": "party_a_address", "label": "Party A — Registered address", "type": "textarea", "required": True},
            {"key": "party_b_name", "label": "Party B — Full legal name", "type": "text", "required": True},
            {"key": "party_b_address", "label": "Party B — Registered address", "type": "textarea", "required": True},
            {"key": "purpose", "label": "Purpose of disclosure", "type": "textarea", "required": True,
             "placeholder": "e.g. Evaluating a potential joint venture in fintech"},
            {"key": "duration_years", "label": "Duration of confidentiality (years)", "type": "text", "required": True, "default": "3"},
            {"key": "jurisdiction_city", "label": "Governing jurisdiction (city)", "type": "text", "required": True, "default": "Bengaluru"},
        ],
    },
    "nda-oneway": {
        "title": "One-Way Non-Disclosure Agreement",
        "category": "Business",
        "icon": "shield",
        "description": "One-way NDA where only one party discloses confidential information. Ideal for vendor evaluations.",
        "estimated_pages": 2,
        "fields": [
            {"key": "disclosing_party", "label": "Disclosing Party name", "type": "text", "required": True},
            {"key": "disclosing_address", "label": "Disclosing Party address", "type": "textarea", "required": True},
            {"key": "receiving_party", "label": "Receiving Party name", "type": "text", "required": True},
            {"key": "receiving_address", "label": "Receiving Party address", "type": "textarea", "required": True},
            {"key": "purpose", "label": "Purpose of disclosure", "type": "textarea", "required": True},
            {"key": "duration_years", "label": "Duration (years)", "type": "text", "required": True, "default": "2"},
            {"key": "jurisdiction_city", "label": "Governing jurisdiction (city)", "type": "text", "required": True, "default": "Mumbai"},
        ],
    },
    "employment": {
        "title": "Employment Agreement (India)",
        "category": "HR",
        "icon": "briefcase",
        "description": "Indian-law employment agreement including CTC, notice period, non-solicit, POSH clause and IP assignment.",
        "estimated_pages": 4,
        "fields": [
            {"key": "employer_name", "label": "Employer (company)", "type": "text", "required": True},
            {"key": "employer_address", "label": "Employer registered address", "type": "textarea", "required": True},
            {"key": "employee_name", "label": "Employee full name", "type": "text", "required": True},
            {"key": "employee_address", "label": "Employee address", "type": "textarea", "required": True},
            {"key": "designation", "label": "Designation / Role", "type": "text", "required": True},
            {"key": "join_date", "label": "Date of joining", "type": "text", "required": True},
            {"key": "ctc_lpa", "label": "CTC (₹ per annum, in lakhs)", "type": "text", "required": True, "default": "12"},
            {"key": "location", "label": "Work location", "type": "text", "required": True, "default": "Bengaluru, India"},
            {"key": "probation_months", "label": "Probation period (months)", "type": "text", "default": "6"},
            {"key": "notice_days", "label": "Notice period (days)", "type": "text", "default": "60"},
            {"key": "jurisdiction_city", "label": "Governing city", "type": "text", "default": "Bengaluru"},
        ],
    },
    "consultant": {
        "title": "Independent Consultant Agreement",
        "category": "HR",
        "icon": "user-check",
        "description": "For engaging an independent consultant. Includes deliverables, fees, IP assignment and confidentiality.",
        "estimated_pages": 3,
        "fields": [
            {"key": "client_name", "label": "Client / Company name", "type": "text", "required": True},
            {"key": "client_address", "label": "Client address", "type": "textarea", "required": True},
            {"key": "consultant_name", "label": "Consultant name", "type": "text", "required": True},
            {"key": "consultant_address", "label": "Consultant address", "type": "textarea", "required": True},
            {"key": "scope", "label": "Scope of work / Deliverables", "type": "textarea", "required": True},
            {"key": "fee", "label": "Consideration (₹) — total or monthly", "type": "text", "required": True},
            {"key": "duration_months", "label": "Duration (months)", "type": "text", "default": "6"},
            {"key": "jurisdiction_city", "label": "Governing city", "type": "text", "default": "Bengaluru"},
        ],
    },
    "rental": {
        "title": "Residential Rent Agreement (11-Month)",
        "category": "Property",
        "icon": "home",
        "description": "Standard Indian 11-month rent agreement — no need for compulsory registration. Includes deposit, notice, and jurisdiction clauses.",
        "estimated_pages": 3,
        "fields": [
            {"key": "landlord_name", "label": "Landlord name", "type": "text", "required": True},
            {"key": "landlord_address", "label": "Landlord address", "type": "textarea", "required": True},
            {"key": "tenant_name", "label": "Tenant name", "type": "text", "required": True},
            {"key": "tenant_address", "label": "Tenant permanent address", "type": "textarea", "required": True},
            {"key": "property_address", "label": "Rented property address", "type": "textarea", "required": True},
            {"key": "monthly_rent", "label": "Monthly rent (₹)", "type": "text", "required": True, "default": "30000"},
            {"key": "deposit", "label": "Security deposit (₹)", "type": "text", "required": True, "default": "180000"},
            {"key": "start_date", "label": "Start date", "type": "text", "required": True},
            {"key": "jurisdiction_city", "label": "Governing city", "type": "text", "required": True, "default": "Bengaluru"},
        ],
    },
    "commercial-lease": {
        "title": "Commercial Lease Agreement",
        "category": "Property",
        "icon": "building",
        "description": "Long-term lease for commercial office space including escalation clauses and lock-in.",
        "estimated_pages": 4,
        "fields": [
            {"key": "lessor_name", "label": "Lessor / Owner name", "type": "text", "required": True},
            {"key": "lessee_name", "label": "Lessee (Company) name", "type": "text", "required": True},
            {"key": "premises", "label": "Premises description & area (sq ft)", "type": "textarea", "required": True},
            {"key": "monthly_rent", "label": "Monthly rent (₹)", "type": "text", "required": True},
            {"key": "deposit", "label": "Security deposit (₹)", "type": "text", "required": True},
            {"key": "term_years", "label": "Lease term (years)", "type": "text", "required": True, "default": "3"},
            {"key": "escalation_pct", "label": "Rent escalation (% every year)", "type": "text", "default": "5"},
            {"key": "lock_in_months", "label": "Lock-in period (months)", "type": "text", "default": "12"},
            {"key": "jurisdiction_city", "label": "Governing city", "type": "text", "default": "Bengaluru"},
        ],
    },
    "freelance-sow": {
        "title": "Freelance Statement of Work",
        "category": "Business",
        "icon": "pen-tool",
        "description": "Short SOW between a client and freelancer with milestones and payment schedule.",
        "estimated_pages": 2,
        "fields": [
            {"key": "client_name", "label": "Client name", "type": "text", "required": True},
            {"key": "freelancer_name", "label": "Freelancer name", "type": "text", "required": True},
            {"key": "project_title", "label": "Project title", "type": "text", "required": True},
            {"key": "deliverables", "label": "Deliverables (milestones)", "type": "textarea", "required": True},
            {"key": "total_fee", "label": "Total fee (₹)", "type": "text", "required": True},
            {"key": "payment_terms", "label": "Payment terms", "type": "textarea", "default": "50% advance, 50% on delivery"},
            {"key": "deadline", "label": "Final delivery date", "type": "text"},
        ],
    },
    "mou": {
        "title": "Memorandum of Understanding (MoU)",
        "category": "Business",
        "icon": "handshake",
        "description": "A non-binding MoU to record mutual intent between two Indian parties.",
        "estimated_pages": 2,
        "fields": [
            {"key": "party_a", "label": "Party A", "type": "text", "required": True},
            {"key": "party_b", "label": "Party B", "type": "text", "required": True},
            {"key": "objectives", "label": "Objectives / Purpose", "type": "textarea", "required": True},
            {"key": "roles", "label": "Responsibilities of each party", "type": "textarea", "required": True},
            {"key": "term_months", "label": "Term (months)", "type": "text", "default": "12"},
        ],
    },
    "founder": {
        "title": "Co-Founders' Agreement",
        "category": "Business",
        "icon": "users",
        "description": "Covers equity split, vesting, roles and IP for Indian startup founders.",
        "estimated_pages": 4,
        "fields": [
            {"key": "startup_name", "label": "Startup name", "type": "text", "required": True},
            {"key": "founders", "label": "Founder names & equity split (e.g. Ram 40%, Sita 40%, Mohan 20%)", "type": "textarea", "required": True},
            {"key": "roles", "label": "Roles of each founder", "type": "textarea", "required": True},
            {"key": "vesting_years", "label": "Vesting period (years)", "type": "text", "default": "4"},
            {"key": "cliff_months", "label": "Cliff (months)", "type": "text", "default": "12"},
            {"key": "jurisdiction_city", "label": "Governing city", "type": "text", "default": "Bengaluru"},
        ],
    },
    "power-of-attorney": {
        "title": "Special Power of Attorney (SPA)",
        "category": "Personal",
        "icon": "stamp",
        "description": "Grants specific authority for defined acts (e.g. property registration, banking transactions).",
        "estimated_pages": 2,
        "fields": [
            {"key": "principal_name", "label": "Principal (grantor) name", "type": "text", "required": True},
            {"key": "principal_address", "label": "Principal address", "type": "textarea", "required": True},
            {"key": "attorney_name", "label": "Attorney-holder (agent) name", "type": "text", "required": True},
            {"key": "attorney_address", "label": "Attorney address", "type": "textarea", "required": True},
            {"key": "purpose", "label": "Powers granted (be specific)", "type": "textarea", "required": True},
            {"key": "valid_till", "label": "Valid till (date)", "type": "text"},
            {"key": "jurisdiction_city", "label": "City", "type": "text", "default": "Bengaluru"},
        ],
    },
    "will": {
        "title": "Simple Last Will and Testament",
        "category": "Personal",
        "icon": "scroll",
        "description": "A simple Indian will covering movable and immovable assets.",
        "estimated_pages": 3,
        "fields": [
            {"key": "testator_name", "label": "Testator (your) full name", "type": "text", "required": True},
            {"key": "testator_address", "label": "Address", "type": "textarea", "required": True},
            {"key": "spouse_name", "label": "Spouse name (if any)", "type": "text"},
            {"key": "children", "label": "Names of children / other family", "type": "textarea"},
            {"key": "assets", "label": "Assets to be distributed", "type": "textarea", "required": True},
            {"key": "distribution", "label": "How you want them distributed", "type": "textarea", "required": True},
            {"key": "executor_name", "label": "Executor name", "type": "text", "required": True},
        ],
    },
    "assignment-ip": {
        "title": "IP Assignment Agreement",
        "category": "Business",
        "icon": "copyright",
        "description": "Assigns intellectual property from a creator (e.g. contractor) to the company.",
        "estimated_pages": 2,
        "fields": [
            {"key": "assignor_name", "label": "Assignor (creator) name", "type": "text", "required": True},
            {"key": "assignee_name", "label": "Assignee (company) name", "type": "text", "required": True},
            {"key": "ip_description", "label": "Description of IP being assigned", "type": "textarea", "required": True},
            {"key": "consideration", "label": "Consideration (₹)", "type": "text", "required": True},
            {"key": "jurisdiction_city", "label": "Governing city", "type": "text", "default": "Bengaluru"},
        ],
    },
}


@api.get("/templates")
async def list_templates():
    items = []
    for slug, t in TEMPLATES.items():
        items.append({
            "slug": slug,
            "title": t["title"],
            "category": t["category"],
            "icon": t["icon"],
            "description": t["description"],
            "estimated_pages": t.get("estimated_pages"),
            "fields_count": len(t["fields"]),
        })
    categories = sorted(set(t["category"] for t in TEMPLATES.values()))
    return {"categories": categories, "templates": items}


@api.get("/templates/{slug}")
async def get_template(slug: str):
    t = TEMPLATES.get(slug)
    if not t:
        raise HTTPException(status_code=404, detail="Template not found")
    return {
        "slug": slug,
        "title": t["title"],
        "category": t["category"],
        "icon": t["icon"],
        "description": t["description"],
        "estimated_pages": t.get("estimated_pages"),
        "fields": t["fields"],
    }


class TemplateGenReq(BaseModel):
    inputs: Dict[str, Any] = {}


TEMPLATE_SYS = (
    "You are a senior Indian advocate drafting standard, market-tested Indian legal contracts. "
    "Given a template name and its input fields, produce a COMPLETE, ready-to-use draft in plain text (no markdown fencing). "
    "Use proper Indian legal formatting with numbered clauses, party recitals, cause title / preamble as appropriate, "
    "and end with signature blocks and space for witnesses if applicable. Always include: (i) governing law (Indian statutes: "
    "Contract Act 1872, IT Act 2000, POSH 2013, etc. as relevant), (ii) dispute resolution clause preferring "
    "mediation/arbitration under the Arbitration & Conciliation Act 1996 seat at the specified city, "
    "(iii) confidentiality where relevant, (iv) severability. Use ₹ and dd-mm-yyyy dates. Use the supplied party names "
    "verbatim. Where a field is missing, use a bracketed placeholder like [To be filled]. Do NOT wrap in code fencing."
)


async def _generate_template_text(slug: str, inputs: Dict[str, Any]) -> Tuple[Dict[str, Any], str]:
    t = TEMPLATES.get(slug)
    if not t:
        raise HTTPException(status_code=404, detail="Template not found")
    # validate required
    for f in t["fields"]:
        if f.get("required") and not str(inputs.get(f["key"], "")).strip():
            raise HTTPException(status_code=400, detail=f"Field '{f['label']}' is required.")
    # build prompt
    lines = [f"TEMPLATE: {t['title']}", "INPUTS:"]
    for f in t["fields"]:
        val = inputs.get(f["key"], "").strip() if isinstance(inputs.get(f["key"]), str) else inputs.get(f["key"])
        if not val and f.get("default"):
            val = f["default"]
        if val:
            lines.append(f"- {f['label']}: {val}")
    prompt = "\n".join(lines) + "\n\nDraft the complete document now."
    text = await llm_once(TEMPLATE_SYS, prompt)
    return t, text


@api.post("/templates/{slug}/generate")
async def template_generate(slug: str, body: TemplateGenReq, user=Depends(current_user)):
    t, text = await _generate_template_text(slug, body.inputs)
    rec = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "slug": slug,
        "title": t["title"],
        "inputs": body.inputs,
        "text": text,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.template_generations.insert_one(rec)
    return {"id": rec["id"], "slug": slug, "title": t["title"], "text": text}


def _build_template_docx(title: str, body_text: str) -> bytes:
    doc = DocxDocument()
    _add_heading(doc, title, level=0)
    tag = doc.add_paragraph()
    r = tag.add_run("Generated by Nyaya Mitra · Review with a licensed advocate before signing")
    r.italic = True
    r.font.size = Pt(9)
    r.font.color.rgb = RGBColor(0x47, 0x55, 0x69)
    doc.add_paragraph()

    # Body — one paragraph per line-block
    for block in re.split(r"\n\s*\n|\r\n\r\n", body_text.strip()):
        if not block.strip():
            continue
        para = doc.add_paragraph()
        run = para.add_run(block.strip())
        run.font.size = Pt(10.5)
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


@api.post("/templates/{slug}/docx")
async def template_generate_docx(slug: str, body: TemplateGenReq, user=Depends(current_user)):
    t, text = await _generate_template_text(slug, body.inputs)
    docx_bytes = _build_template_docx(t["title"], text)
    safe = re.sub(r"[^A-Za-z0-9._-]+", "-", slug)[:64]
    return FastAPIStreamResponse(
        io.BytesIO(docx_bytes),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{safe}.docx"'},
    )


# ---------------------------------------------------------------------------
# Regional-language translation for generated drafts
# ---------------------------------------------------------------------------
LANGUAGES: Dict[str, Dict[str, str]] = {
    "english":  {"label": "English",  "native": "English",   "script": "Latin"},
    "hindi":    {"label": "Hindi",    "native": "हिंदी",      "script": "Devanagari"},
    "tamil":    {"label": "Tamil",    "native": "தமிழ்",      "script": "Tamil"},
    "telugu":   {"label": "Telugu",   "native": "తెలుగు",     "script": "Telugu"},
    "bengali":  {"label": "Bengali",  "native": "বাংলা",       "script": "Bengali"},
    "marathi":  {"label": "Marathi",  "native": "मराठी",       "script": "Devanagari"},
}

SYS_TRANSLATE = (
    "You are an expert Indian legal translator. Translate the given English legal document "
    "into the target Indian language faithfully. Preserve: (a) numbering and clause structure, "
    "(b) party names, addresses, dates, amounts and monetary units verbatim (no translation of "
    "proper nouns or numerals), (c) legal cross-references (e.g. 'Section 138 of the Negotiable "
    "Instruments Act, 1881') — keep the statute name AND section number in a bilingual form: "
    "translated statute name followed by the English name in parentheses on first mention, then "
    "translated name thereafter. Return ONLY the translated text, without any preamble, without "
    "markdown fencing, without commentary."
)


class TranslateReq(BaseModel):
    text: str
    target_language: str  # one of LANGUAGES keys
    title: Optional[str] = None


@api.get("/languages")
async def list_languages():
    return [{"code": k, **v} for k, v in LANGUAGES.items()]


@api.post("/templates/translate")
async def translate_text(body: TranslateReq, user=Depends(current_user)):
    lang_key = (body.target_language or "").lower().strip()
    if lang_key not in LANGUAGES:
        raise HTTPException(status_code=400, detail=f"Unsupported language: {body.target_language}")
    if not body.text or len(body.text.strip()) < 10:
        raise HTTPException(status_code=400, detail="Text too short to translate")
    if lang_key == "english":
        return {"language": "english", "text": body.text}
    lang = LANGUAGES[lang_key]
    prompt = (
        f"Target language: {lang['label']} ({lang['native']}), script: {lang['script']}.\n\n"
        f"Translate this legal document now:\n\n"
        f"{body.text[:20000]}"
    )
    translated = await llm_once(SYS_TRANSLATE, prompt)
    return {"language": lang_key, "label": lang["label"], "native": lang["native"], "text": translated}


class TextDocxReq(BaseModel):
    title: str
    text: str
    language: Optional[str] = "english"


@api.post("/templates/docx-from-text")
async def docx_from_text(body: TextDocxReq, user=Depends(current_user)):
    """Build a DOCX from arbitrary title + text (used for translated drafts)."""
    if not body.text.strip():
        raise HTTPException(status_code=400, detail="Missing text")
    title = body.title.strip() or "Document"
    lang_label = LANGUAGES.get((body.language or "english").lower(), LANGUAGES["english"])["label"]
    display_title = title if lang_label == "English" else f"{title} — {lang_label}"
    docx_bytes = _build_template_docx(display_title, body.text)
    safe = re.sub(r"[^A-Za-z0-9._-]+", "-", f"{title}-{lang_label}")[:64]
    return FastAPIStreamResponse(
        io.BytesIO(docx_bytes),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{safe}.docx"'},
    )


class TemplateShareReq(BaseModel):
    slug: str
    title: str
    text: str
    inputs: Optional[Dict[str, Any]] = None


@api.post("/templates/share")
async def template_share(body: TemplateShareReq, user=Depends(current_user)):
    share_id = uuid.uuid4().hex[:12]
    rec = {
        "share_id": share_id,
        "user_id": user["id"],
        "user_name": user["name"],
        "slug": body.slug,
        "title": body.title,
        "text": body.text,
        "inputs": body.inputs or {},
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.template_shares.insert_one(rec)
    return {"share_id": share_id}


@api.get("/templates/share/{share_id}")
async def template_share_view(share_id: str):
    doc = await db.template_shares.find_one({"share_id": share_id}, {"_id": 0, "user_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Shared draft not found")
    return doc


# ---------------------------------------------------------------------------
# Modules registry (for the dashboard grid)
# ---------------------------------------------------------------------------
@api.get("/modules")
async def modules():
    return {
        "categories": [
            {
                "key": "core",
                "name": "Core Legal Services",
                "modules": [
                    {"slug": "case-management", "name": "Legal Case Management", "icon": "briefcase"},
                    {"slug": "document-analyzer", "name": "AI Document Analyzer", "icon": "file-search", "flagship": True},
                    {"slug": "consultation", "name": "Online Legal Consultation", "icon": "video"},
                    {"slug": "court-tracking", "name": "Court Case Tracking", "icon": "gavel"},
                    {"slug": "contract-review", "name": "Contract Review Automation", "icon": "file-check", "flagship": True},
                    {"slug": "research", "name": "Legal Research Engine", "icon": "search", "flagship": True},
                    {"slug": "cyber-crime", "name": "Cyber Crime Reporting", "icon": "shield-alert"},
                    {"slug": "ip-management", "name": "Intellectual Property Portal", "icon": "copyright"},
                    {"slug": "e-governance", "name": "E-Governance Complaint", "icon": "landmark"},
                    {"slug": "consumer", "name": "Consumer Grievance Platform", "icon": "shopping-bag"},
                    {"slug": "chatbot", "name": "Legal Knowledge Chatbot", "icon": "message-square", "flagship": True},
                    {"slug": "compliance", "name": "Compliance Monitoring", "icon": "clipboard-check"},
                    {"slug": "evidence", "name": "Digital Evidence Vault", "icon": "folder-lock"},
                    {"slug": "odr", "name": "Online Dispute Resolution", "icon": "handshake"},
                    {"slug": "risk", "name": "Legal Risk Assessment", "icon": "activity"},
                    {"slug": "traffic", "name": "Traffic Violation Manager", "icon": "car"},
                    {"slug": "rti", "name": "RTI Application Tracker", "icon": "file-text"},
                    {"slug": "e-notary", "name": "E-Notary Management", "icon": "stamp"},
                    {"slug": "judicial-analytics", "name": "Judicial Data Analytics", "icon": "bar-chart-3"},
                ],
            },
            {
                "key": "ai",
                "name": "Advanced AI Features",
                "modules": [
                    {"slug": "research-assistant", "name": "AI Legal Research Assistant", "icon": "sparkles"},
                    {"slug": "petition-draft", "name": "Petition & Notice Drafting", "icon": "pen-tool", "flagship": True},
                    {"slug": "contract-agent", "name": "AI Contract Review Agent", "icon": "shield-check"},
                    {"slug": "bulk-contracts", "name": "Bulk Contract Review", "icon": "layers", "flagship": True},
                    {"slug": "templates", "name": "Contract Templates Library", "icon": "book-marked", "flagship": True},
                    {"slug": "client-crm", "name": "Legal Client CRM", "icon": "users"},
                    {"slug": "case-agent", "name": "Court Case Tracking Agent", "icon": "radar"},
                    {"slug": "voice", "name": "Voice-Based Legal Assistant", "icon": "mic", "flagship": True},
                    {"slug": "multilang", "name": "Multi-Language Legal Support", "icon": "languages"},
                    {"slug": "mock-court", "name": "Mock Court (Law Students)", "icon": "graduation-cap"},
                    {"slug": "marketplace", "name": "Lawyer Marketplace", "icon": "store"},
                ],
            },
            {
                "key": "fraud",
                "name": "AI Scam & Fraud Detection",
                "modules": [
                    {"slug": "sms-scam", "name": "Message Scam Detection", "icon": "message-circle-warning", "flagship": True},
                    {"slug": "email-fraud", "name": "Email Fraud Detection", "icon": "mail-warning"},
                    {"slug": "phishing-url", "name": "Phishing URL Detection", "icon": "link-2"},
                    {"slug": "risk-engine", "name": "Real-Time Risk Scoring", "icon": "gauge"},
                    {"slug": "fraud-report", "name": "Fraud Reporting System", "icon": "flag"},
                    {"slug": "community-alerts", "name": "Community Threat Alerts", "icon": "bell-ring"},
                    {"slug": "awareness", "name": "Cyber Awareness Assistant", "icon": "brain"},
                ],
            },
        ]
    }


# ---------------------------------------------------------------------------
# Mount
# ---------------------------------------------------------------------------
app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)


@app.on_event("shutdown")
async def _shutdown():
    client.close()
