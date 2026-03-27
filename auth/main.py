"""
Auth Service — archAIc Layer 1
Port: 8001

Responsibilities:
  - User signup / login / token validation
  - Generate trace_id for every request (UUID)
  - Propagate trace_id via X-Trace-ID header
  - Emit structured JSON logs
  - Support failure injection for chaos testing
"""

import os
import time
import uuid
import json
import logging
import hashlib
import hmac
import asyncio
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException, Header, Query, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional


# ─── Structured JSON Logger ───────────────────────────────────────────────────

class JSONFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        log_obj = {
            "service": "auth-service",
            "level": record.levelname,
            "message": record.getMessage(),
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "trace_id": getattr(record, "trace_id", "N/A"),
        }
        if record.exc_info:
            log_obj["exception"] = self.formatException(record.exc_info)
        return json.dumps(log_obj)


handler = logging.StreamHandler()
handler.setFormatter(JSONFormatter())
logger = logging.getLogger("auth-service")
logger.addHandler(handler)
logger.setLevel(logging.INFO)
logger.propagate = False


# ─── App & Config ─────────────────────────────────────────────────────────────

app = FastAPI(title="Auth Service", version="1.0.0")

SECRET_KEY = os.getenv("JWT_SECRET", "archaIc-secret-key-2024")

# In-memory user store: { email: hashed_password }
_users: dict[str, str] = {}

# Failure injection state
_failure_state: dict = {
    "type": None,  # "timeout" | "error" | "cpu" | "crash" | None
}


def _hash_password(password: str) -> str:
    return hmac.new(SECRET_KEY.encode(), password.encode(), hashlib.sha256).hexdigest()


def _make_token(email: str) -> str:
    payload = f"{email}:{int(time.time())}"
    sig = hmac.new(SECRET_KEY.encode(), payload.encode(), hashlib.sha256).hexdigest()
    return f"{payload}:{sig}"


def _verify_token_str(token: str) -> Optional[str]:
    try:
        parts = token.split(":")
        if len(parts) != 3:
            return None
        email, ts, sig = parts
        expected = hmac.new(SECRET_KEY.encode(), f"{email}:{ts}".encode(), hashlib.sha256).hexdigest()
        if hmac.compare_digest(sig, expected):
            return email
        return None
    except Exception:
        return None


def _log(level: str, message: str, trace_id: str = "N/A"):
    extra = {"trace_id": trace_id}
    getattr(logger, level.lower())(message, extra=extra)


async def _apply_failure(trace_id: str):
    ftype = _failure_state.get("type")
    if ftype == "timeout":
        _log("warning", "Injected timeout — sleeping 10s", trace_id)
        await asyncio.sleep(10)
    elif ftype == "error":
        _log("error", "Injected error — raising 500", trace_id)
        raise HTTPException(status_code=500, detail="Injected failure: error")
    elif ftype == "cpu":
        _log("warning", "Injected CPU spike — busy loop", trace_id)
        end = time.time() + 2
        while time.time() < end:
            _ = sum(range(10_000))
    elif ftype == "crash":
        _log("critical", "Injected crash — service terminating", trace_id)
        os._exit(1)


# ─── Middleware — trace_id injection ──────────────────────────────────────────

@app.middleware("http")
async def trace_middleware(request: Request, call_next):
    trace_id = request.headers.get("X-Trace-ID", str(uuid.uuid4()))
    request.state.trace_id = trace_id
    start = time.time()
    response = await call_next(request)
    latency_ms = round((time.time() - start) * 1000, 2)
    response.headers["X-Trace-ID"] = trace_id
    _log("info", f"{request.method} {request.url.path} → {response.status_code} [{latency_ms}ms]", trace_id)
    return response


# ─── Models ───────────────────────────────────────────────────────────────────

class UserCredentials(BaseModel):
    email: str
    password: str


# ─── Endpoints ────────────────────────────────────────────────────────────────

@app.post("/signup")
async def signup(user: UserCredentials, request: Request):
    trace_id = request.state.trace_id
    await _apply_failure(trace_id)

    if user.email in _users:
        _log("warning", f"Signup failed — email already exists: {user.email}", trace_id)
        raise HTTPException(status_code=409, detail="Email already registered")

    _users[user.email] = _hash_password(user.password)
    _log("info", f"Signup success: {user.email}", trace_id)
    token = _make_token(user.email)
    return {"access_token": token, "token_type": "bearer", "trace_id": trace_id}


@app.post("/login")
async def login(user: UserCredentials, request: Request):
    trace_id = request.state.trace_id
    _log("info", f"Login attempt: {user.email}", trace_id)
    await _apply_failure(trace_id)

    stored = _users.get(user.email)
    if stored is None or stored != _hash_password(user.password):
        _log("warning", f"Login failed — invalid credentials: {user.email}", trace_id)
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = _make_token(user.email)
    _log("info", f"Login success: {user.email}", trace_id)
    return {"access_token": token, "token_type": "bearer", "trace_id": trace_id}


@app.get("/validate")
async def validate(request: Request, authorization: str = Header(...)):
    trace_id = request.state.trace_id
    await _apply_failure(trace_id)

    token = authorization.removeprefix("Bearer ").strip()
    email = _verify_token_str(token)
    if not email:
        _log("warning", "Token validation failed — invalid token", trace_id)
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    _log("info", f"Token validated for: {email}", trace_id)
    return {"valid": True, "email": email, "trace_id": trace_id}


@app.get("/health")
async def health():
    return {"status": "healthy", "service": "auth-service", "failure": _failure_state["type"]}


# ─── Failure Injection ────────────────────────────────────────────────────────

@app.post("/inject-failure")
async def inject_failure(type: str = Query(..., description="timeout | error | cpu | crash")):
    if type not in ("timeout", "error", "cpu", "crash"):
        raise HTTPException(status_code=400, detail="Invalid failure type. Use: timeout, error, cpu, crash")
    _failure_state["type"] = type
    _log("warning", f"Failure injected: {type}", "SYSTEM")
    return {"injected": type, "service": "auth-service"}


@app.post("/reset")
async def reset():
    _failure_state["type"] = None
    _log("info", "Failure state reset to normal", "SYSTEM")
    return {"status": "reset", "service": "auth-service"}