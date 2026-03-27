"""
DB Service — archAIc Layer 1
Port: 8002

Responsibilities:
  - Simulated in-memory database (products + carts)
  - Read/write operations with logged query times
  - Main failure generator for cascade testing
  - Support failure injection: timeout, crash, incorrect data, cpu
  - Emit structured JSON logs with trace_id
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

from fastapi import FastAPI, HTTPException, Header, Query, Request
from pydantic import BaseModel
from typing import Optional, List

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
            "service": "db-service",
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
logger = logging.getLogger("db-service")
logger.addHandler(handler)
logger.setLevel(logging.INFO)
logger.propagate = False


# ─── App & In-Memory State ────────────────────────────────────────────────────

app = FastAPI(title="DB Service", version="1.0.0")

# ─── OpenTelemetry Setup ──────────────────────────────────────────────────────
OTEL_ENDPOINT = os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT", "").rstrip("/")
resource = Resource(attributes={
    "service.name": "db-service"
})
provider = TracerProvider(resource=resource)
if OTEL_ENDPOINT:
    processor = BatchSpanProcessor(OTLPSpanExporter(endpoint=f"{OTEL_ENDPOINT}/v1/traces"))
    provider.add_span_processor(processor)
trace.set_tracer_provider(provider)

FastAPIInstrumentor.instrument_app(app)
Instrumentator().instrument(app).expose(app)

_products: List[dict] = [
    {"id": "p1", "name": "Wireless Headphones", "price": 79.99, "stock": 50},
    {"id": "p2", "name": "Mechanical Keyboard", "price": 129.99, "stock": 30},
    {"id": "p3", "name": "USB-C Hub", "price": 39.99, "stock": 100},
    {"id": "p4", "name": "Monitor Stand", "price": 49.99, "stock": 25},
    {"id": "p5", "name": "Webcam HD", "price": 89.99, "stock": 15},
]

# { user_id: [ {product_id, name, price, qty} ] }
_carts: dict[str, List[dict]] = {}

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


async def _apply_failure(trace_id: str) -> bool:
    global failure_start_time

    if not failure_config.get("enabled", False):
        return False

    duration = failure_config.get("duration")
    if duration is not None:
        if failure_start_time is None:
            failure_start_time = time.time()
        elif (time.time() - failure_start_time) > duration:
            failure_config.update({"enabled": False, "type": None})
            failure_start_time = None
            return False

    probability = failure_config.get("probability", 1.0)
    if random.random() > probability:
        return False

    ftype = failure_config.get("type")
    intensity = max(1, int(failure_config.get("intensity", 1)))
    _log("ERROR", f"Failure triggered: {ftype}", trace_id)

    if ftype == "timeout":
        await asyncio.sleep(2 * intensity)
        return True
    elif ftype == "error":
        raise HTTPException(status_code=500, detail="Simulated failure")
    elif ftype == "cpu":
        def _cpu_burn_forever():
            while True:
                _ = sum(range(100_000))

        threading.Thread(target=_cpu_burn_forever, daemon=True).start()
        return True
    elif ftype == "crash":
        os._exit(1)
    elif ftype == "bad_data":
        return True

    return False


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


# ─── Models ───────────────────────────────────────────────────────────────────

class CartItem(BaseModel):
    user_id: str
    product_id: str
    quantity: int = 1


# ─── Product Endpoints ────────────────────────────────────────────────────────

@app.get("/products")
async def get_products(request: Request):
    trace_id = request.state.trace_id
    failure_triggered = await _apply_failure(trace_id)
    _log("info", "DB read: fetching all products", trace_id)

    t0 = time.time()

    # "bad_data" failure mode: return corrupted/partial data
    if failure_config.get("type") == "bad_data" and failure_triggered:
        _log("warning", "Returning bad/corrupted product data", trace_id)
        corrupted = [{"id": p["id"], "name": None, "price": -1} for p in _products]
        return corrupted

    query_ms = round((time.time() - t0) * 1000, 2)
    _log("info", f"DB read success: {len(_products)} products fetched in {query_ms}ms", trace_id)
    return _products


# ─── Cart Endpoints ───────────────────────────────────────────────────────────

@app.post("/cart/add")
async def add_to_cart(item: CartItem, request: Request):
    trace_id = request.state.trace_id
    await _apply_failure(trace_id)
    _log("info", f"DB write: cart add — user={item.user_id} product={item.product_id} qty={item.quantity}", trace_id)

    t0 = time.time()
    product = next((p for p in _products if p["id"] == item.product_id), None)
    if not product:
        _log("warning", f"DB write failed: product not found — {item.product_id}", trace_id)
        raise HTTPException(status_code=404, detail=f"Product {item.product_id} not found")

    if product["stock"] < item.quantity:
        _log("warning", f"DB write failed: insufficient stock for {item.product_id}", trace_id)
        raise HTTPException(status_code=409, detail="Insufficient stock")

    cart = _carts.setdefault(item.user_id, [])
    existing = next((c for c in cart if c["product_id"] == item.product_id), None)
    if existing:
        existing["quantity"] += item.quantity
    else:
        cart.append({
            "product_id": item.product_id,
            "name": product["name"],
            "price": product["price"],
            "quantity": item.quantity,
        })

    product["stock"] -= item.quantity
    query_ms = round((time.time() - t0) * 1000, 2)
    _log("info", f"DB write success: cart updated for user={item.user_id} in {query_ms}ms", trace_id)
    return {"status": "added", "cart": _carts[item.user_id], "trace_id": trace_id}


@app.get("/cart/{user_id}")
async def get_cart(user_id: str, request: Request):
    trace_id = request.state.trace_id
    await _apply_failure(trace_id)
    _log("info", f"DB read: cart fetch for user={user_id}", trace_id)

    t0 = time.time()
    cart = _carts.get(user_id, [])
    query_ms = round((time.time() - t0) * 1000, 2)
    total = sum(i["price"] * i["quantity"] for i in cart)
    _log("info", f"DB read success: cart({len(cart)} items, total=${total:.2f}) in {query_ms}ms", trace_id)
    return {"user_id": user_id, "items": cart, "total": round(total, 2), "trace_id": trace_id}


# ─── Health ───────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "healthy", "service": "db-service", "failure": failure_config["type"]}


# ─── Failure Injection ────────────────────────────────────────────────────────

@app.post("/inject-failure")
async def inject_failure(
    type: str = Query(..., description="timeout | error | cpu | crash | bad_data"),
    intensity: int = Query(1),
    probability: float = Query(1.0),
    duration: Optional[int] = Query(None),
):
    global failure_start_time

    valid = ("timeout", "error", "cpu", "crash", "bad_data")
    if type not in valid:
        raise HTTPException(status_code=400, detail=f"Invalid type. Use one of: {valid}")
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
    _log("warning", f"Failure injected on DB service: {type}", "SYSTEM")
    return {"service": "db-service", "failure_config": failure_config}


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
    _log("info", "DB failure state reset to normal", "SYSTEM")
    return {"status": "reset", "service": "db-service"}
