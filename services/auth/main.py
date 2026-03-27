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
import random
import threading
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException, Header, Query, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional

# ─── Observability Imports ────────────────────────────────────────────────────
from prometheus_fastapi_instrumentator import Instrumentator
from opentelemetry import trace
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor


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

# ─── OpenTelemetry Setup ──────────────────────────────────────────────────────
OTEL_ENDPOINT = os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT", "").rstrip("/")
resource = Resource(attributes={
    "service.name": "auth-service"
})
provider = TracerProvider(resource=resource)
if OTEL_ENDPOINT:
    processor = BatchSpanProcessor(OTLPSpanExporter(endpoint=f"{OTEL_ENDPOINT}/v1/traces"))
    provider.add_span_processor(processor)
trace.set_tracer_provider(provider)

FastAPIInstrumentor.instrument_app(app)
Instrumentator().instrument(app).expose(app)

SECRET_KEY = os.getenv("JWT_SECRET", "archaIc-secret-key-2024")

# In-memory user store: { email: hashed_password }
_users: dict[str, str] = {}

failure_config: dict = {
    "enabled": False,
    "type": None,
    "intensity": 1,
    "probability": 1.0,
    "duration": None,
}
failure_start_time = None


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
    global failure_start_time

    if not failure_config.get("enabled", False):
        return

    duration = failure_config.get("duration")
    if duration is not None:
        if failure_start_time is None:
            failure_start_time = time.time()
        elif (time.time() - failure_start_time) > duration:
            failure_config.update({"enabled": False, "type": None})
            failure_start_time = None
            return

    probability = failure_config.get("probability", 1.0)
    if random.random() > probability:
        return

    ftype = failure_config.get("type")
    intensity = max(1, int(failure_config.get("intensity", 1)))
    _log("ERROR", f"Failure triggered: {ftype}", trace_id)

    if ftype == "timeout":
        await asyncio.sleep(2 * intensity)
    elif ftype == "error":
        raise HTTPException(status_code=500, detail="Simulated failure")
    elif ftype == "cpu":
        def _cpu_burn_forever():
            while True:
                _ = sum(range(100_000))

        threading.Thread(target=_cpu_burn_forever, daemon=True).start()
    elif ftype == "crash":
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
    await _apply_failure(trace_id)
    _log("info", f"Login attempt: {user.email}", trace_id)

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
    return {"status": "healthy", "service": "auth-service", "failure": failure_config["type"]}


# ─── Failure Injection ────────────────────────────────────────────────────────

@app.post("/inject-failure")
async def inject_failure(
    type: str = Query(..., description="timeout | error | cpu | crash"),
    intensity: int = Query(1),
    probability: float = Query(1.0),
    duration: Optional[int] = Query(None),
):
    global failure_start_time

    if type not in ("timeout", "error", "cpu", "crash"):
        raise HTTPException(status_code=400, detail="Invalid failure type. Use: timeout, error, cpu, crash")
    if intensity < 1:
        raise HTTPException(status_code=400, detail="intensity must be >= 1")
    if probability < 0 or probability > 1:
        raise HTTPException(status_code=400, detail="probability must be between 0 and 1")
    if duration is not None and duration < 1:
        raise HTTPException(status_code=400, detail="duration must be >= 1 when provided")

    failure_config.update({
        "enabled": True,
        "type": type,
        "intensity": intensity,
        "probability": probability,
        "duration": duration,
    })
    failure_start_time = None
    _log("warning", f"Failure injected: {type}", "SYSTEM")
    return {"service": "auth-service", "failure_config": failure_config}


@app.post("/reset")
async def reset():
    global failure_start_time

    failure_config.update({
        "enabled": False,
        "type": None,
        "intensity": 1,
        "probability": 1.0,
        "duration": None,
    })
    failure_start_time = None
    _log("info", "Failure state reset to normal", "SYSTEM")
    return {"status": "reset", "service": "auth-service"}