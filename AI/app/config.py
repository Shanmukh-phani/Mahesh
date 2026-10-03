import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "").strip()
GROQ_MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-20b").strip()
JWT_SECRET = os.getenv("JWT_SECRET", "secret123")
BACKEND_API_URL = os.getenv("BACKEND_API_URL", "http://127.0.0.1:5001/api").rstrip("/")
AI_PORT = int(os.getenv("AI_PORT", "8000"))

ACTION_TTL_SECONDS = 15 * 60
