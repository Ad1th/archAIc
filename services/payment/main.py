"""
Payment Service — archAIc Layer 1
Port: 8004

Responsibilities:
  - Handles Stripe Checkout integrations
  - Calls auth-service to validate tokens
  - Calls db-service to fetch cart total
  - Propagates trace_id across all calls
  - Emits structured JSON logs with latency metrics
  - Supports failure injection
"""

import os
import time
import json
import logging
import asyncio
import uuid
import random
import threading
from datetime import datetime, timezone
from typing import Optional

import httpx
from fastapi import FastAPI, HTTPException, Header, Query, Request
import stripe

# ─── Observability Imports ────────────────────────────────────────────────────
from prometheus_fastapi_instrumentator import Instrumentator
from opentelemetry import trace
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor


# ─── Structured JSON Logger ───────────────────────────────────────────────────

class JSONFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        log_obj = {
            "service": "payment-service",
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
logger = logging.getLogger("payment-service")
logger.addHandler(handler)
logger.setLevel(logging.INFO)
logger.propagate = False


# ─── App & Config ─────────────────────────────────────────────────────────────

app = FastAPI(title="Payment Service", version="1.0.0")

# ─── OpenTelemetry Setup ──────────────────────────────────────────────────────
OTEL_ENDPOINT = os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT", "").rstrip("/")
resource = Resource(attributes={
    "service.name": "payment-service"
})
provider = TracerProvider(resource=resource)
if OTEL_ENDPOINT:
    processor = BatchSpanProcessor(OTLPSpanExporter(endpoint=f"{OTEL_ENDPOINT}/v1/traces"))
    provider.add_span_processor(processor)
trace.set_tracer_provider(provider)

FastAPIInstrumentor.instrument_app(app)
HTTPXClientInstrumentor().instrument()
Instrumentator().instrument(app).expose(app)

AUTH_SERVICE_URL = os.getenv("AUTH_SERVICE_URL", "http://auth-service:8001")
DB_SERVICE_URL   = os.getenv("DB_SERVICE_URL",   "http://db-service:8002")
REQUEST_TIMEOUT  = float(os.getenv("REQUEST_TIMEOUT", "8"))
stripe.api_key = os.getenv("STRIPE_API_KEY", "sk_test_dummy")

failure_config: dict = {
    "enabled": False,
    "type": None,
    "intensity": 1,
    "probability": 1.0,
    "duration": None,
}
failure_start_time = None


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


# ─── Middleware ────────────────────────────────────────────────────────────────

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


# ─── Helpers ──────────────────────────────────────────────────────────────────

async def _validate_token(authorization: str, trace_id: str) -> str:
    """Call auth-service to validate token. Returns email on success."""
    t0 = time.time()
    _log("info", "Calling auth-service for token validation", trace_id)
    try:
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
            res = await client.get(
                f"{AUTH_SERVICE_URL}/validate",
                headers={"Authorization": authorization, "X-Trace-ID": trace_id},
            )
        latency_ms = round((time.time() - t0) * 1000, 2)
        if res.status_code != 200:
            _log("warning", f"Auth validation failed [{res.status_code}] in {latency_ms}ms", trace_id)
            raise HTTPException(status_code=401, detail="Unauthorized — token validation failed")
        email = res.json().get("email", "unknown")
        _log("info", f"Auth validation success for {email} in {latency_ms}ms", trace_id)
        return email
    except httpx.TimeoutException:
        latency_ms = round((time.time() - t0) * 1000, 2)
        _log("error", f"Auth-service timeout after {latency_ms}ms", trace_id)
        raise HTTPException(status_code=504, detail="Auth service timeout")
    except httpx.RequestError as e:
        _log("error", f"Auth-service unreachable: {e}", trace_id)
        raise HTTPException(status_code=503, detail="Auth service unreachable")


async def _db_get_cart(user_id: str, trace_id: str) -> dict:
    """Fetch cart from db-service to determine total checkout amount."""
    t0 = time.time()
    _log("info", f"Calling db-service: GET /cart/{user_id}", trace_id)
    try:
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
            res = await client.get(
                f"{DB_SERVICE_URL}/cart/{user_id}",
                headers={"X-Trace-ID": trace_id},
            )
        latency_ms = round((time.time() - t0) * 1000, 2)
        if res.status_code != 200:
            _log("error", f"DB cart fetch failed [{res.status_code}] in {latency_ms}ms", trace_id)
            raise HTTPException(status_code=502, detail="DB service error fetching cart")
        cart = res.json()
        _log("info", f"DB cart fetch success for user={user_id} in {latency_ms}ms", trace_id)
        return cart
    except httpx.TimeoutException:
        latency_ms = round((time.time() - t0) * 1000, 2)
        _log("error", f"DB-service timeout on cart fetch after {latency_ms}ms", trace_id)
        raise HTTPException(status_code=504, detail="DB service timeout — cart unavailable")
    except httpx.RequestError as e:
        _log("error", f"DB-service unreachable on cart: {e}", trace_id)
        raise HTTPException(status_code=503, detail="DB service unreachable")


# ─── Endpoints ────────────────────────────────────────────────────────────────

@app.post("/create-checkout-session")
async def create_checkout_session(request: Request, authorization: str = Header(...)):
    trace_id = request.state.trace_id
    await _apply_failure(trace_id)
    _log("info", "Handling POST /create-checkout-session", trace_id)

    email = await _validate_token(authorization, trace_id)
    user_id = email.split("@")[0]

    cart = await _db_get_cart(user_id, trace_id)
    total_amount_usd = cart.get("total", 0.0)

    if total_amount_usd <= 0:
        _log("warning", f"Checkout failed: cart empty for user={user_id}", trace_id)
        raise HTTPException(status_code=400, detail="Cart is empty")

    _log("info", f"Creating Stripe Checkout Session for user={user_id}, total=${total_amount_usd}", trace_id)

    # In a real environment with valid keys, you would create the actual stripe checkout.
    # For simulation/mock purposes if dummy key is used
    if stripe.api_key == "sk_test_dummy":
        _log("info", "Stripe dummy key detected, mocking checkout session URL", trace_id)
        return {
            "checkout_url": f"https://mock.stripe.com/checkout/{uuid.uuid4()}",
            "amount_usd": total_amount_usd,
            "session_id": "cs_test_" + str(uuid.uuid4()),
            "trace_id": trace_id
        }

    try:
        session = stripe.checkout.Session.create(
            payment_method_types=['card'],
            line_items=[{
                'price_data': {
                    'currency': 'usd',
                    'product_data': {
                        'name': 'archAIc Cart Checkout',
                    },
                    'unit_amount': int(total_amount_usd * 100),
                },
                'quantity': 1,
            }],
            mode='payment',
            success_url='http://localhost:8004/success?session_id={CHECKOUT_SESSION_ID}',
            cancel_url='http://localhost:8004/cancel',
        )
        _log("info", f"Stripe checkout session created: {session.id}", trace_id)
        return {"checkout_url": session.url, "session_id": session.id, "trace_id": trace_id}
    except Exception as e:
        _log("error", f"Stripe API error: {str(e)}", trace_id)
        raise HTTPException(status_code=500, detail="Failed to communicate with Stripe")


@app.get("/health")
async def health():
    return {"status": "healthy", "service": "payment-service", "failure": failure_config["type"]}


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
        raise HTTPException(status_code=400, detail="Invalid type. Use: timeout, error, cpu, crash")
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
    _log("warning", f"Failure injected on payment-service: {type}", "SYSTEM")
    return {"service": "payment-service", "failure_config": failure_config}


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
    _log("info", "Payment-service failure state reset", "SYSTEM")
    return {"status": "reset", "service": "payment-service"}
