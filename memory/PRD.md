# Nyaya Mitra — Indian Legal-Tech Platform (PRD)

## Original problem statement
"Analyse everything from this file and help me create it." (`Key Modules.docx`)

The document specified: Frontend Next.js, Backend FastAPI, AI/RAG Gemini/OpenAI, Firebase DB, and 35 modules across three categories (Core Legal Services x19, Advanced AI Features x9, AI Scam & Fraud Detection x7).

## User choices (confirmed via ask_human)
- MVP scope: **Full unified dashboard with ALL 35 modules + deep logic for 6 flagship ones**
- Stack: **React (CRA) + FastAPI + MongoDB** (Next.js+Firebase not supported in this environment)
- AI provider: **Gemini 3 Flash** via Emergent Universal LLM Key
- Auth: **Email/password (JWT)**
- Jurisdiction: **Indian law**

## Architecture
- **Backend** (`/app/backend/server.py`): FastAPI, MongoDB (motor), JWT auth (PyJWT + bcrypt), `emergentintegrations` LlmChat streaming for Gemini 3 Flash. All endpoints under `/api/*`.
- **Frontend** (`/app/frontend/src/`): React + React Router 7 + Tailwind + custom "Nyaya Mitra editorial" CSS (Cabinet Grotesk + IBM Plex). Axios API client with bearer-token interceptor.
- **Design system**: Saffron `#E65100` + deep ink `#0F172A`, rounded-none/neo-brutalist cards with 6px translate-hover shadow, dot-grid background, Cabinet Grotesk display font, editorial layout.

## Implemented (all live in production preview)
- Landing page with hero, live stats card, 6-flagship overview, footer disclaimer
- Auth: register + login + JWT persistence + logout, protected `/app/*` routes
- **Dashboard**: 35 modules across 3 categorised sections; every card is LIVE and clickable
- **6 flagship modules** with dedicated UX:
  1. Legal Chatbot — streaming SSE (`POST /api/chat/stream`) with session persistence
  2. Document Analyzer — structured breakdown (parties, obligations, risks, missing clauses)
  3. Petition & Notice Drafting — 10 case types, court-ready output with copy button
  4. Contract Review — risk score /100, red flags with severity, missing protections
  5. Legal Research Engine — statutes + landmark cases with citations
  6. Fraud & Scam Detection — 7 subtypes (SMS, email, URL, risk engine, report, community feed, awareness) with risk score, category, safety advice, report-to portals + community threat feed
- **21 generic modules** via `SmartModule.jsx` + `/api/module/{slug}/spec` + `/api/module/run`:
  case-management, consultation, court-tracking, cyber-crime, ip-management, e-governance, consumer, compliance, evidence, odr, risk, traffic, rti, e-notary, judicial-analytics, client-crm, case-agent, voice, multilang, mock-court, marketplace
- Every response is structured JSON tailored per module (drafts, checklists, timelines, applicable sections, forums, citations, etc.)

## Testing (iteration 1, 2026-01-05)
- Backend: 21/21 pytest passed (auth, module registry, spec/run for 5 slugs, chat stream, document/petition/contract/research, fraud + community, validation errors)
- Frontend: 100% success on landing / auth / dashboard / all 6 flagships / 4 SmartModule slugs / community feed / reload persistence / logout
- No blocking issues. Report: `/app/test_reports/iteration_1.json`

## Backlog / roadmap (nice-to-haves)
- P1 — Voice input for `/app/module/voice` (currently text)
- P1 — Real file upload (PDF/DOCX) for Document Analyzer & Contract Review (currently paste)
- P1 — eCourts CNR live lookup for Court Case Tracking (currently AI-inferred)
- P2 — Search bar on dashboard to jump to any of 35 modules
- P2 — Payment/subscription (Razorpay) for premium usage
- P2 — Rate-limit LLM endpoints, tighten CORS in production
- P2 — Split `server.py` into `routers/` (auth, modules, chat, fraud) once feature set stabilises
- P2 — Save drafts/history browsing UI (endpoints exist, no UI yet)

---

## Iteration 2 — 2026-01-05 (Three requested feature adds)

### Newly implemented
1. **File Upload for analyzers** — Drag-drop PDF/DOCX/TXT to Document Analyzer and Contract Review. Backend extracts text via `pypdf` and `python-docx`. Endpoints: `POST /api/analyze/document/upload`, `POST /api/review/contract/upload`, `POST /api/upload/extract`. Max 15 MB.
2. **CNR Live Tracking** (`/app/cnr`) — Court Case Tracking dedicated page. Decodes 16-char CNR (state, court, serial, year), pings services.ecourts.gov.in to confirm portal reachable, provides deep-link "Open on eCourts", AI-inferred stage + next steps (labelled AI-INFERRED because the official portal is captcha-protected). Endpoint: `POST /api/cnr/track`.
3. **Lawyer Directory / Marketplace** (`/app/marketplace`) — 40 seeded verified Indian advocates across 15+ cities & 20+ specialisations. Full-featured filter sidebar (city, spec, max-fee slider, min-experience slider, min-rating buttons, sort). Modal booking flow persisting to `db.consult_requests`. Endpoints: `GET /api/lawyers` (filters + sort), `GET /api/lawyers/facets`, `GET /api/lawyers/{id}`, `POST /api/lawyers/consult`.
- Sidebar now includes CNR Tracker + Lawyer Directory quick links.
- Dashboard routing updated: Court Case Tracking → /app/cnr, Case Tracking Agent → /app/cnr, Marketplace → /app/marketplace.

### Testing (iteration 2)
- Backend: 26/26 new tests pass (upload + CNR + lawyers + consult + all error cases).
- Frontend: 100% pass on all iteration-2 flows + regression on iteration-1 features.
- Report: `/app/test_reports/iteration_2.json`

---

## Iteration 3 — 2026-01-05 (Bulk Contract Review)

### Newly implemented
- **Bulk Contract Review** (`/app/bulk-contracts`): Multi-file drop zone that accepts 2–20 PDF/DOCX/TXT contracts, runs Gemini 3 Flash reviews **in parallel** via `asyncio.gather`, and returns a comparative **league table** with:
  - Batch stats (total processed, average risk, high-risk count, safest score)
  - Safest / Riskiest contract callouts
  - Sortable league table (risk desc/asc, red-flags count, filename A–Z) with expandable per-row detail (summary, red flags with severity, missing protections, favourable points, recommendations)
  - Graceful per-file failure handling (unsupported/broken files return `ok:false` without failing the batch)
- Endpoints: `POST /api/review/contract/bulk`, `GET /api/review/batch/{id}`, `GET /api/review/batches`.
- Added Bulk Contracts to sidebar and as a flagship card on the dashboard (advanced AI category).

### Testing (iteration 3)
- Backend: 7/7 pytest pass (multi-file happy path, size cap, extension mixing, auth checks, batch retrieval, ownership guard).
- Frontend: 100% pass on dropzone / queue / sort / expand / regression.
- Report: `/app/test_reports/iteration_3.json`

---

## Iteration 4 — 2026-01-05 (Redline Downloads + Contract Templates Library)

### Newly implemented
- **Redline DOCX Downloads**: On every Contract Review result (single or bulk) users can download a **redlined DOCX** — cover page with risk score, executive summary, contract body with risky paragraphs highlighted (severity-coloured), per-flag annotations block (severity chip + issue + suggestion in red italic underline), missing protections, favourable points, recommendations, and a signed disclaimer. Endpoints:
  - `POST /api/review/contract/redline` (text → review + DOCX)
  - `POST /api/review/contract/redline-from-review` (skip re-review — uses cached review + text)
  - `POST /api/review/contract/redline-upload` (file → review + DOCX)
- **Contract Templates Library** (`/app/templates`): 12 vetted Indian templates across 4 categories (Business, HR, Property, Personal): Mutual NDA, One-way NDA, Employment, Consultant, Rental, Commercial Lease, Freelance SoW, MoU, Founders' Agreement, SPA, Will, IP Assignment. Each template has typed field spec, defaults, AI-drafted text via Gemini 3 Flash, and one-click DOCX download. Public share links via `/share/{id}` route (no auth). Endpoints:
  - `GET /api/templates`
  - `GET /api/templates/{slug}`
  - `POST /api/templates/{slug}/generate`
  - `POST /api/templates/{slug}/docx`
  - `POST /api/templates/share`, `GET /api/templates/share/{id}` (public)
- Sidebar has a new "Templates" link (BookMarked icon). Dashboard has a new flagship card "Contract Templates Library".

### Testing (iteration 4)
- Backend: 17/17 pytest pass (templates CRUD-like flows + all redline endpoints + auth + share auth guard exception).
- Frontend: 100% pass. DOCX downloads verified as valid python-docx files with all required sections. Public share view works without auth.
- Report: `/app/test_reports/iteration_4.json`
- Fixed testing-agent's LOW-priority finding: clipboard failure now shows an informational fallback toast instead of a misleading "Share failed".

---

## Iteration 5 — 2026-01-05 (Regional-Language Template Drafts)

### Newly implemented
- **One-click translation to 5 Indian languages** (Hindi, Tamil, Telugu, Bengali, Marathi) in the Templates Library modal — tab bar with native-script pills (हिंदी, தமிழ், తెలుగు, বাংলা, मराठी).
- **Verbatim preservation** enforced in the translation prompt: party names, addresses, dates, amounts, monetary units and statute cross-references stay in English, everything else translates.
- **Client-side cache**: switching between already-translated languages is instant; no re-hitting the API.
- **DOCX + Share respect current language**: downloading while a translated language is active hits `/api/templates/docx-from-text` and the file title / filename get the language suffix (e.g. `nda-mutual-hindi.docx`, title paragraph "Mutual NDA — Hindi"). Shared links preserve the translated content.
- **Noto Sans <script>** fonts imported in `index.css` so Devanagari/Tamil/Telugu/Bengali glyphs render correctly across all UI including chips.
- Endpoints: `GET /api/languages`, `POST /api/templates/translate`, `POST /api/templates/docx-from-text`.

### Testing (iteration 5)
- Backend: 13/13 pass — all 5 non-English languages return valid translations preserving proper nouns; English echoes input; error paths (unsupported lang, short text, missing auth) all return correct codes.
- Frontend: 100% pass. Client cache verified (zero extra network calls on repeat switches). Cosmetic fix pushed for Indic-script chip rendering.
- Report: `/app/test_reports/iteration_5.json`
