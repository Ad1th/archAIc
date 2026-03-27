# archAIc — AI-Powered Observability & Self-Healing System

> **Layer 1: Microservices Foundation**
> The distributed system that generates real logs, traces, and metrics for the AI intelligence layer.
> It now includes chaos engineering controls to simulate realistic, unpredictable failure patterns seen in production systems.
> You can run controlled experiments with probabilistic, time-bound, and intensity-based failures across dependent services.

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

## Features

- **Probabilistic failure simulation**: Trigger failures randomly using per-request probability controls.
- **Time-bound failures**: Configure automatic failure deactivation after a specified duration.
- **Intensity-based chaos controls**: Scale timeout length and CPU-pressure impact safely during experiments.
- **Cascading failure testing**: Observe upstream/downstream impact when auth or DB degrades.
- **Distributed trace tracking**: Follow request flow across services using shared `trace_id` / `X-Trace-ID`.
- **Structured observability output**: JSON logs and metrics-ready behavior for analysis and RCA.

---

## Quick Start

### With Docker (recommended)

```bash
docker-compose up --build
```

```
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo add jaegertracing https://jaegertracing.github.io/helm-charts
helm repo add grafana https://grafana.github.io/helm-charts
helm repo update
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

### Dashboard

The repo now includes a Next.js dashboard at `http://localhost:3000/dashboard`.

```bash
# Install frontend dependencies
npm install

# Start the dashboard
npm run dev
```

By default the dashboard targets:

- `AUTH_SERVICE_URL=http://127.0.0.1:8001`
- `DB_SERVICE_URL=http://127.0.0.1:8002`
- `PRODUCT_SERVICE_URL=http://127.0.0.1:8003`
- `PAYMENT_SERVICE_URL=http://127.0.0.1:8004`

Override those environment variables before `npm run dev` if your services are exposed elsewhere.

---

## Service APIs

### Auth Service — `http://localhost:8001`

| Method | Endpoint                 | Description                                |
| ------ | ------------------------ | ------------------------------------------ |
| POST   | `/signup`                | Register a user                            |
| POST   | `/login`                 | Login, get JWT token                       |
| GET    | `/validate`              | Validate a token (used by product-service) |
| GET    | `/health`                | Health + failure state                     |
| POST   | `/inject-failure?type=X` | Inject failure                             |
| POST   | `/reset`                 | Clear failure                              |

### DB Service — `http://localhost:8002`

| Method | Endpoint                 | Description            |
| ------ | ------------------------ | ---------------------- |
| GET    | `/products`              | All products           |
| POST   | `/cart/add`              | Add item to cart       |
| GET    | `/cart/{user_id}`        | Get user cart          |
| GET    | `/health`                | Health + failure state |
| POST   | `/inject-failure?type=X` | Inject failure         |
| POST   | `/reset`                 | Clear failure          |

### Product Service — `http://localhost:8003`

| Method | Endpoint                 | Description                         |
| ------ | ------------------------ | ----------------------------------- |
| GET    | `/products`              | Fetch catalog (requires auth token) |
| POST   | `/cart/add`              | Add to cart (requires auth token)   |
| GET    | `/cart`                  | View cart (requires auth token)     |
| GET    | `/health`                | Health + failure state              |
| POST   | `/inject-failure?type=X` | Inject failure                      |
| POST   | `/reset`                 | Clear failure                       |

---

## Failure Injection System

Each service supports `POST /inject-failure` with query params:

- `type`: failure mode (`timeout`, `error`, `cpu`, `crash`, plus `bad_data` on DB)
- `intensity`: positive integer multiplier (default: `1`)
- `probability`: trigger chance per request from `0.0` to `1.0` (default: `1.0`)
- `duration`: optional active window in seconds; failure auto-disables when elapsed

Reset any service with `POST /reset`.

| Type       | Effect                                                                     |
| ---------- | -------------------------------------------------------------------------- |
| `timeout`  | Adds async delay (`2 * intensity` seconds) to simulate latency/hangs       |
| `error`    | Returns simulated HTTP 500 failure response                                |
| `cpu`      | Starts CPU pressure workload in background to simulate resource exhaustion |
| `crash`    | Terminates service process (`os._exit(1)`)                                 |
| `bad_data` | Returns intentionally corrupted payloads _(DB service only)_               |

### Failure Injection Examples

```bash
# Probabilistic failure on Product service (30% of requests fail with error)
curl -X POST "http://localhost:8003/inject-failure?type=error&probability=0.3"

# Duration-based timeout on Auth service (active for 45 seconds)
curl -X POST "http://localhost:8001/inject-failure?type=timeout&intensity=2&duration=45"

# DB bad_data for 20 seconds at full probability
curl -X POST "http://localhost:8002/inject-failure?type=bad_data&probability=1.0&duration=20"

# Reset after experiment
curl -X POST http://localhost:8001/reset
curl -X POST http://localhost:8002/reset
curl -X POST http://localhost:8003/reset
```

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

## Demo Scenarios

### 1. Auth failure -> Product fails

```bash
# Force Auth errors
curl -X POST "http://localhost:8001/inject-failure?type=error&probability=1.0"

# Product depends on Auth token validation, so protected calls fail upstream
curl http://localhost:8003/products -H "Authorization: Bearer $TOKEN"
```

Expected behavior: product-service returns auth-related failure path (`401`/upstream unavailability behavior), and logs show dependency impact.

### 2. DB bad_data -> Corrupted response

```bash
# Inject corrupted data responses in DB
curl -X POST "http://localhost:8002/inject-failure?type=bad_data&duration=30"

# Product fetch now receives malformed DB payload content
curl http://localhost:8003/products -H "Authorization: Bearer $TOKEN"
```

Expected behavior: DB returns intentionally degraded fields (for example `name: null`, invalid prices), enabling downstream resilience testing.

### 3. Random failures -> Partial system instability

```bash
# Random timeout spikes on DB at 40% probability
curl -X POST "http://localhost:8002/inject-failure?type=timeout&intensity=2&probability=0.4&duration=60"

# Repeated calls show intermittent success/failure patterns
for i in {1..10}; do
  curl -s -o /dev/null -w "request $i -> %{http_code}\n" http://localhost:8003/products -H "Authorization: Bearer $TOKEN"
done
```

Expected behavior: mixed response outcomes that emulate real distributed instability and intermittent degradation.

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

## Why This Matters

Real distributed systems fail in unpredictable ways: partial outages, latency spikes, and bad downstream data are common in production.
This project lets you simulate those conditions safely, observe the resulting behavior via trace-linked logs, and validate resilience strategies before real incidents occur.

---

## What's Next (Layer 2)

- **Log ingestion** — pipe JSON logs to a collector
- **Anomaly detection** — AI model on latency, error rate, log patterns
- **Root cause analysis** — trace_id correlation across service logs
- **Auto-remediation** — automated `POST /reset` when anomaly detected
- **Dashboard** — real-time observability UI
