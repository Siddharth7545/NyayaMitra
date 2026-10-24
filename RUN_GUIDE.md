# Run NyayMitra locally (VS Code, Windows / macOS / Linux)

Prerequisites: Python 3.10-3.12, Node.js 18+, MongoDB running locally (or a free MongoDB Atlas URI), and an AI provider key (Groq / Grok, Gemini) or Ollama.

## AI options

- **Groq / Grok Cloud**: In `backend/.env`, set `LLM_PROVIDER=groq`, `GROQ_API_KEY=your_key` (or `GROK_API_KEY=your_key`), and `GROQ_MODEL=openai/gpt-oss-120b`.
- **Local Ollama (no API key needed)**: Install Ollama from https://ollama.com/download, run `ollama run llama3.2`, and in `backend/.env` set `LLM_PROVIDER=ollama`.
- **Google Gemini**: In `backend/.env`, set `LLM_PROVIDER=gemini` and set `GEMINI_API_KEY`.

Local models can be less accurate than hosted models. Review legal information carefully; the app does not replace advice from a qualified lawyer.

## 1. Backend (terminal 1)
cd backend
python -m venv venv
venv\Scripts\activate            # macOS/Linux: source venv/bin/activate
pip install -r requirements-local.txt
copy .env.example .env           # macOS/Linux: cp .env.example .env
# edit .env: set a long random JWT_SECRET and choose an AI provider:
#   Groq / Grok: LLM_PROVIDER=groq and set GROQ_API_KEY (or GROK_API_KEY)
#   Gemini:      LLM_PROVIDER=gemini and set GEMINI_API_KEY
#   Ollama:      LLM_PROVIDER=ollama and set OLLAMA_MODEL=llama3.2
uvicorn server:app --reload --port 8001

Check: http://localhost:8001/api/  ->  {"app":"Nyaya Mitra","status":"ok"}   |   API docs: http://localhost:8001/docs

## 2. Frontend (terminal 2)
cd frontend
npm install --legacy-peer-deps
npm start
# opens http://localhost:3000   (frontend/.env already points to http://localhost:8001)

Do NOT use backend/requirements.txt (Emergent-only packages, fails on a normal PC).
