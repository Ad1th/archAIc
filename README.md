# archAIc — AI-Powered Observability & Self-Healing System

> **Layer 1: Microservices Foundation**
> The distributed system that generates real logs, traces, and metrics for the AI intelligence layer.

---

## Architecture

```
Client
  │
  ▼
Auth Service      :8001   ← Entry point, token generation, trace_id origin
  │
  ▼
Product Service   :8003   ← Business logic, calls auth + db
  │
  ▼
DB Service        :8002   ← In-memory store, primary failure generator
```

**Dependency graph:** `product → auth`, `product → db`
This chain is what enables Root Cause Analysis in Layer 2.

---

## Quick Start

### With Docker (recommended)

```bash
docker-compose up --build
```

All three services start with health checks. `product-service` waits for the other two before starting.

### Without Docker (local dev)

```bash
# Terminal 1 — Auth Service
cd auth
pip install -r requirements.txt
uvicorn main:app --port 8001 --reload

# Terminal 2 — DB Service
cd db
pip install -r requirements.txt
uvicorn main:app --port 8002 --reload

# Terminal 3 — Product Service
cd product
pip install -r requirements.txt
AUTH_SERVICE_URL=http://localhost:8001 DB_SERVICE_URL=http://localhost:8002 \
uvicorn main:app --port 8003 --reload
```

---

## Service APIs

### Auth Service — `http://localhost:8001`

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/signup` | Register a user |
| POST | `/login` | Login, get JWT token |
| GET | `/validate` | Validate a token (used by product-service) |
| GET | `/health` | Health + failure state |
| POST | `/inject-failure?type=X` | Inject failure |
| POST | `/reset` | Clear failure |

### DB Service — `http://localhost:8002`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/products` | All products |
| POST | `/cart/add` | Add item to cart |
| GET | `/cart/{user_id}` | Get user cart |
| GET | `/health` | Health + failure state |
| POST | `/inject-failure?type=X` | Inject failure |
| POST | `/reset` | Clear failure |

### Product Service — `http://localhost:8003`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/products` | Fetch catalog (requires auth token) |
| POST | `/cart/add` | Add to cart (requires auth token) |
| GET | `/cart` | View cart (requires auth token) |
| GET | `/health` | Health + failure state |
| POST | `/inject-failure?type=X` | Inject failure |
| POST | `/reset` | Clear failure |

---

## Failure Injection

Each service supports the `POST /inject-failure?type=<TYPE>` endpoint.

| Type | Effect |
|------|--------|
| `timeout` | Sleeps 10-15s (simulates hang) |
| `error` | Returns HTTP 500/503 |
| `cpu` | Busy loop for 2-3s (CPU spike) |
| `crash` | Process exits (`os._exit(1)`) |
| `bad_data` | Returns corrupted data *(DB only)* |

Reset with `POST /reset`.

---

## Example: Normal Flow

```bash
# 1. Sign up
curl -X POST http://localhost:8001/signup \
  -H "Content-Type: application/json" \
  -d '{"email": "alice@example.com", "password": "secure123"}'

# 2. Login → get token
TOKEN=$(curl -s -X POST http://localhost:8001/login \
  -H "Content-Type: application/json" \
  -d '{"email": "alice@example.com", "password": "secure123"}' | python -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# 3. Fetch products (trace flows Auth → Product → DB)
curl http://localhost:8003/products -H "Authorization: Bearer $TOKEN"

# 4. Add to cart
curl -X POST http://localhost:8003/cart/add \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"product_id": "p1", "quantity": 2}'

# 5. View cart
curl http://localhost:8003/cart -H "Authorization: Bearer $TOKEN"
```

---

## Example: Cascade Failure Flow

```bash
# Inject DB timeout
curl -X POST "http://localhost:8002/inject-failure?type=timeout"

# Now call product-service — it calls DB, detects timeout, logs upstream impact
curl http://localhost:8003/products -H "Authorization: Bearer $TOKEN"

# Logs show:
#   db-service:      "Injected DB timeout — sleeping 15s"
#   product-service: "DB-service timeout after 8002ms — upstream impact detected"

# Reset
curl -X POST http://localhost:8002/reset
```

**Expected RCA:** Root cause = `db-service` timeout → cascaded to `product-service`.

---

## Log Format

Every log line is valid JSON:

```json
{
  "service": "product-service",
  "level": "INFO",
  "message": "DB products fetch success: 5 items in 12.3ms",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "trace_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

The same `trace_id` appears across **all** services for a single request chain — enabling distributed tracing in Layer 2.

---

## What's Next (Layer 2)

- **Log ingestion** — pipe JSON logs to a collector
- **Anomaly detection** — AI model on latency, error rate, log patterns
- **Root cause analysis** — trace_id correlation across service logs
- **Auto-remediation** — automated `POST /reset` when anomaly detected
- **Dashboard** — real-time observability UI