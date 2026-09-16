"""
config.py
---------
Centralised environment / secrets handling for SynapTwin backend.

- Loads `s24_backend/.env` (via python-dotenv) so local dev picks up keys
  without exporting them manually. Production (Render) uses real env vars,
  which always take precedence over .env values.
- Single source of truth for GEMINI_API_KEY / FERNET_SECRET_KEY / PORT etc.
- Validates formats early and exposes `is_gemini_configured()` so callers
  can cleanly fall back to deterministic offline logic.

Required keys: none (all optional with safe fallbacks).
  GEMINI_API_KEY    - Google Gemini API key for live explainability/alerts.
                      If empty/missing -> offline deterministic explainer.
  FERNET_SECRET_KEY - Base64 Fernet key for SecureMeterStore. If missing ->
                      a process-stable key is generated once at startup and
                      reused (NOT per-request). Set a persistent value in
                      production via Render env vars or .env.
  PORT              - Flask port (default 5000, Render injects $PORT).
  STATIC_FOLDER     - Override for built frontend dist folder.
  OPEN_METEO_TIMEOUT_SEC - HTTP timeout for live weather (default 4).
  OPEN_METEO_CACHE_TTL_HOURS - max age of cached weather before refetch (default 6).
"""

from __future__ import annotations

import logging
import os
from pathlib import Path

try:
    from dotenv import load_dotenv
except ImportError:  # pragma: no cover - dotenv is in requirements
    def load_dotenv(*args, **kwargs):  # type: ignore
        return False

_BACKEND_DIR = Path(__file__).resolve().parent
_DOTENV_PATH = _BACKEND_DIR / ".env"

# Load .env first so os.environ below sees it. Existing real env vars win
# (override=False is python-dotenv default behaviour for set vars).
load_dotenv(dotenv_path=_DOTENV_PATH, override=False)

log = logging.getLogger("synaptwin.config")


def _clean(v: str | None) -> str:
    return (v or "").strip().strip('"').strip("'")


GEMINI_API_KEY: str = _clean(os.environ.get("GEMINI_API_KEY", ""))
FERNET_SECRET_KEY: str = _clean(os.environ.get("FERNET_SECRET_KEY", ""))
PORT: int = int(_clean(os.environ.get("PORT", "")) or 5000)
STATIC_FOLDER_OVERRIDE: str = _clean(os.environ.get("STATIC_FOLDER", ""))

try:
    OPEN_METEO_TIMEOUT_SEC: float = float(_clean(os.environ.get("OPEN_METEO_TIMEOUT_SEC", "")) or 4.0)
except ValueError:
    OPEN_METEO_TIMEOUT_SEC = 4.0

try:
    OPEN_METEO_CACHE_TTL_HOURS: float = float(_clean(os.environ.get("OPEN_METEO_CACHE_TTL_HOURS", "")) or 6.0)
except ValueError:
    OPEN_METEO_CACHE_TTL_HOURS = 6.0


def is_gemini_configured() -> bool:
    """True only if a plausible Gemini key is present (not placeholder)."""
    if not GEMINI_API_KEY:
        return False
    lowered = GEMINI_API_KEY.lower()
    placeholders = ("your-", "placeholder", "changeme", "xxx", "test-key", "example")
    if any(p in lowered for p in placeholders):
        return False
    # Real Gemini keys are ~39 chars starting with AIza; be lenient for future formats.
    return len(GEMINI_API_KEY) >= 20


def gemini_status() -> dict:
    """Safe status for /api/status without leaking the key."""
    if not GEMINI_API_KEY:
        return {"configured": False, "mode": "offline_deterministic", "reason": "GEMINI_API_KEY not set"}
    if not is_gemini_configured():
        return {"configured": False, "mode": "offline_deterministic", "reason": "GEMINI_API_KEY looks like a placeholder"}
    return {"configured": True, "mode": "live_gemini", "key_prefix": GEMINI_API_KEY[:4] + "…", "key_len": len(GEMINI_API_KEY)}


def fernet_status() -> dict:
    if not FERNET_SECRET_KEY:
        return {"configured": False, "mode": "ephemeral_process_key", "reason": "FERNET_SECRET_KEY not set - generated once at startup"}
    return {"configured": True, "mode": "persistent_env_key"}
