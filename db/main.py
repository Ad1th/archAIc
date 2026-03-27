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
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException, Header, Query, Request
from pydantic import BaseModel
from typing import Optional, List


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

_products: List[dict] = [
    {"id": "p1", "name": "Wireless Headphones", "price": 79.99, "stock": 50},
    {"id": "p2", "name": "Mechanical Keyboard", "price": 129.99, "stock": 30},
    {"id": "p3", "name": "USB-C Hub", "price": 39.99, "stock": 100},
    {"id": "p4", "name": "Monitor Stand", "price": 49.99, "stock": 25},
    {"id": "p5", "name": "Webcam HD", "price": 89.99, "stock": 15},
]

# { user_id: [ {product_id, name, price, qty} ] }
_carts: dict[str, List[dict]] = {}

_failure_state: dict = {
    "type": None,  # "timeout" | "error" | "cpu" | "crash" | "bad_data"
}


def _log(level: str, message: str, trace_id: str = "N/A"):
    extra = {"trace_id": trace_id}
    getattr(logger, level.lower())(message, extra=extra)


async def _apply_failure(trace_id: str):
    ftype = _failure_state.get("type")
    if ftype == "timeout":
        _log("warning", "Injected DB timeout — sleeping 15s", trace_id)
        await asyncio.sleep(15)
    elif ftype == "error":
        _log("error", "Injected DB error — raising 503", trace_id)
        raise HTTPException(status_code=503, detail="DB service failure: injected error")
    elif ftype == "cpu":
        _log("warning", "Injected CPU spike on DB", trace_id)
        end = time.time() + 3
        while time.time() < end:
            _ = sum(range(10_000))
    elif ftype == "crash":
        _log("critical", "Injected DB crash — terminating process", trace_id)
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


# ─── Models ───────────────────────────────────────────────────────────────────

class CartItem(BaseModel):
    user_id: str
    product_id: str
    quantity: int = 1


# ─── Product Endpoints ────────────────────────────────────────────────────────

@app.get("/products")
async def get_products(request: Request):
    trace_id = request.state.trace_id
    _log("info", "DB read: fetching all products", trace_id)
    await _apply_failure(trace_id)

    t0 = time.time()

    # "bad_data" failure mode: return corrupted/partial data
    if _failure_state.get("type") == "bad_data":
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
    _log("info", f"DB write: cart add — user={item.user_id} product={item.product_id} qty={item.quantity}", trace_id)
    await _apply_failure(trace_id)

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
    _log("info", f"DB read: cart fetch for user={user_id}", trace_id)
    await _apply_failure(trace_id)

    t0 = time.time()
    cart = _carts.get(user_id, [])
    query_ms = round((time.time() - t0) * 1000, 2)
    total = sum(i["price"] * i["quantity"] for i in cart)
    _log("info", f"DB read success: cart({len(cart)} items, total=${total:.2f}) in {query_ms}ms", trace_id)
    return {"user_id": user_id, "items": cart, "total": round(total, 2), "trace_id": trace_id}


# ─── Health ───────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "healthy", "service": "db-service", "failure": _failure_state["type"]}


# ─── Failure Injection ────────────────────────────────────────────────────────

@app.post("/inject-failure")
async def inject_failure(type: str = Query(..., description="timeout | error | cpu | crash | bad_data")):
    valid = ("timeout", "error", "cpu", "crash", "bad_data")
    if type not in valid:
        raise HTTPException(status_code=400, detail=f"Invalid type. Use one of: {valid}")
    _failure_state["type"] = type
    _log("warning", f"Failure injected on DB service: {type}", "SYSTEM")
    return {"injected": type, "service": "db-service"}


@app.post("/reset")
async def reset():
    _failure_state["type"] = None
    _log("info", "DB failure state reset to normal", "SYSTEM")
    return {"status": "reset", "service": "db-service"}
