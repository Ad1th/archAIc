"""
Product/Cart Service — archAIc Layer 1
Port: 8003

Responsibilities:
  - Business logic: product catalog, cart management
  - Calls auth-service to validate tokens
  - Calls db-service for data reads/writes
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
from datetime import datetime, timezone
from typing import Optional

import httpx
from fastapi import FastAPI, HTTPException, Header, Query, Request
from pydantic import BaseModel

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
            "service": "product-service",
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
logger = logging.getLogger("product-service")
logger.addHandler(handler)
logger.setLevel(logging.INFO)
logger.propagate = False


# ─── App & Config ─────────────────────────────────────────────────────────────

app = FastAPI(title="Product/Cart Service", version="1.0.0")

# ─── OpenTelemetry Setup ──────────────────────────────────────────────────────
OTEL_ENDPOINT = os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT", "").rstrip("/")
resource = Resource(attributes={
    "service.name": "product-service"
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

_failure_state: dict = {
    "type": None,  # "timeout" | "error" | "cpu" | "crash"
}


def _log(level: str, message: str, trace_id: str = "N/A"):
    extra = {"trace_id": trace_id}
    getattr(logger, level.lower())(message, extra=extra)


async def _apply_failure(trace_id: str):
    ftype = _failure_state.get("type")
    if ftype == "timeout":
        _log("warning", "Injected timeout on product-service — sleeping 10s", trace_id)
        await asyncio.sleep(10)
    elif ftype == "error":
        _log("error", "Injected error on product-service — raising 500", trace_id)
        raise HTTPException(status_code=500, detail="Injected failure: error")
    elif ftype == "cpu":
        _log("warning", "Injected CPU spike on product-service", trace_id)
        end = time.time() + 2
        while time.time() < end:
            _ = sum(range(10_000))
    elif ftype == "crash":
        _log("critical", "Injected crash on product-service — terminating", trace_id)
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


async def _db_get_products(trace_id: str) -> list:
    """Fetch products from db-service."""
    t0 = time.time()
    _log("info", "Calling db-service: GET /products", trace_id)
    try:
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
            res = await client.get(
                f"{DB_SERVICE_URL}/products",
                headers={"X-Trace-ID": trace_id},
            )
        latency_ms = round((time.time() - t0) * 1000, 2)
        if res.status_code != 200:
            _log("error", f"DB products fetch failed [{res.status_code}] in {latency_ms}ms", trace_id)
            raise HTTPException(status_code=502, detail="DB service error fetching products")
        data = res.json()
        _log("info", f"DB products fetch success: {len(data)} items in {latency_ms}ms", trace_id)
        return data
    except httpx.TimeoutException:
        latency_ms = round((time.time() - t0) * 1000, 2)
        _log("error", f"DB-service timeout on products after {latency_ms}ms — upstream impact detected", trace_id)
        raise HTTPException(status_code=504, detail="DB service timeout — unable to fetch products")
    except httpx.RequestError as e:
        _log("error", f"DB-service unreachable: {e}", trace_id)
        raise HTTPException(status_code=503, detail="DB service unreachable")


async def _db_add_to_cart(user_id: str, product_id: str, quantity: int, trace_id: str) -> dict:
    """Write cart item to db-service."""
    t0 = time.time()
    _log("info", f"Calling db-service: POST /cart/add user={user_id} product={product_id}", trace_id)
    try:
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
            res = await client.post(
                f"{DB_SERVICE_URL}/cart/add",
                json={"user_id": user_id, "product_id": product_id, "quantity": quantity},
                headers={"X-Trace-ID": trace_id},
            )
        latency_ms = round((time.time() - t0) * 1000, 2)
        if res.status_code not in (200, 201):
            _log("error", f"DB cart/add failed [{res.status_code}] in {latency_ms}ms", trace_id)
            raise HTTPException(status_code=res.status_code, detail=res.json().get("detail", "Cart update failed"))
        _log("info", f"DB cart/add success in {latency_ms}ms", trace_id)
        return res.json()
    except httpx.TimeoutException:
        latency_ms = round((time.time() - t0) * 1000, 2)
        _log("error", f"DB-service timeout on cart/add after {latency_ms}ms", trace_id)
        raise HTTPException(status_code=504, detail="DB service timeout — cart not updated")
    except httpx.RequestError as e:
        _log("error", f"DB-service unreachable on cart/add: {e}", trace_id)
        raise HTTPException(status_code=503, detail="DB service unreachable")


async def _db_get_cart(user_id: str, trace_id: str) -> dict:
    """Fetch cart from db-service."""
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


# ─── Models ───────────────────────────────────────────────────────────────────

class CartAddRequest(BaseModel):
    product_id: str
    quantity: int = 1


# ─── Endpoints ────────────────────────────────────────────────────────────────

@app.get("/products")
async def get_products(request: Request, authorization: str = Header(...)):
    trace_id = request.state.trace_id
    await _apply_failure(trace_id)
    _log("info", "Handling GET /products", trace_id)

    email = await _validate_token(authorization, trace_id)
    _log("info", f"Fetching product catalog for user: {email}", trace_id)

    products = await _db_get_products(trace_id)
    _log("info", f"Returning {len(products)} products to client", trace_id)
    return {"products": products, "trace_id": trace_id}


@app.post("/cart/add")
async def add_to_cart(
    body: CartAddRequest,
    request: Request,
    authorization: str = Header(...),
):
    trace_id = request.state.trace_id
    await _apply_failure(trace_id)
    _log("info", f"Handling POST /cart/add — product={body.product_id} qty={body.quantity}", trace_id)

    email = await _validate_token(authorization, trace_id)
    user_id = email.split("@")[0]  # use email prefix as user_id

    result = await _db_add_to_cart(user_id, body.product_id, body.quantity, trace_id)
    _log("info", f"Cart updated successfully for user={user_id}", trace_id)
    result["trace_id"] = trace_id
    return result


@app.get("/cart")
async def get_cart(request: Request, authorization: str = Header(...)):
    trace_id = request.state.trace_id
    await _apply_failure(trace_id)
    _log("info", "Handling GET /cart", trace_id)

    email = await _validate_token(authorization, trace_id)
    user_id = email.split("@")[0]

    cart = await _db_get_cart(user_id, trace_id)
    cart["trace_id"] = trace_id
    return cart


@app.get("/health")
async def health():
    return {"status": "healthy", "service": "product-service", "failure": _failure_state["type"]}


# ─── Failure Injection ────────────────────────────────────────────────────────

@app.post("/inject-failure")
async def inject_failure(type: str = Query(..., description="timeout | error | cpu | crash")):
    if type not in ("timeout", "error", "cpu", "crash"):
        raise HTTPException(status_code=400, detail="Invalid type. Use: timeout, error, cpu, crash")
    _failure_state["type"] = type
    _log("warning", f"Failure injected on product-service: {type}", "SYSTEM")
    return {"injected": type, "service": "product-service"}


@app.post("/reset")
async def reset():
    _failure_state["type"] = None
    _log("info", "Product-service failure state reset", "SYSTEM")
    return {"status": "reset", "service": "product-service"}