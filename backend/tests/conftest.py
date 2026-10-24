import os
from pathlib import Path

# Ensure REACT_APP_BACKEND_URL defaults to http://localhost:8001 if not set
if not os.environ.get("REACT_APP_BACKEND_URL"):
    frontend_env = Path(__file__).resolve().parent.parent.parent / "frontend" / ".env"
    if frontend_env.exists():
        try:
            with open(frontend_env) as f:
                for line in f:
                    if line.startswith("REACT_APP_BACKEND_URL"):
                        os.environ["REACT_APP_BACKEND_URL"] = line.split("=", 1)[1].strip().strip('"').rstrip("/")
                        break
        except Exception:
            pass
    if not os.environ.get("REACT_APP_BACKEND_URL"):
        os.environ["REACT_APP_BACKEND_URL"] = "http://localhost:8001"
