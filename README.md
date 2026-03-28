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

Client
  │
  ▼
Payment Service   :8004   ← Checkout flow, calls auth + db (+ Stripe)
```

**Dependency graph:** `product → auth`, `product → db`, `payment → auth`, `payment → db`, `payment → stripe`
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

### 1. With Kubernetes / Minikube (Recommended for AI-Ops)

To run the full stack (including apps, Prometheus, Jaeger, Loki, and Grafana) locally on a Kubernetes cluster:

```bash
# 1. Start Minikube
minikube start

# 2. Point terminal to Minikube's Docker daemon
# PowerShell:
minikube docker-env | Invoke-Expression
# Bash/Zsh:
eval $(minikube docker-env)

# 3. Build application images directly into the Minikube registry
docker build -t auth-service:latest ./services/auth
docker build -t db-service:latest ./services/db
docker build -t product-service:latest ./services/product
docker build -t payment-service:latest ./services/payment
docker build -t anomaly-detector:latest ./services/anomaly-detector
docker build -t ai-operator:latest ./services/ai-operator

# 4. Deploy Base Services and Observability Stack
kubectl apply -k infra/k8s/base
kubectl apply -k infra/k8s/observability

# 5. Wait for pods to initialize
kubectl get pods -A -w

# 6. Expose Dashboards via Port-Forwarding
# (Run these in separate terminal tabs)
kubectl port-forward svc/grafana 3000:3000 -n observability
kubectl port-forward svc/jaeger-all-in-one-query 16686:16686 -n observability
kubectl port-forward svc/product-service 8003:8003 -n archaics

# Optional: payment service (if/when deployed in k8s base)
# kubectl port-forward svc/payment-service 8004:8004 -n archaics

# View AI-Ops Pipeline Logs
# kubectl logs -f deployment/anomaly-detector -n archaics
# kubectl logs -f deployment/ai-operator -n archaics
```

### 2. With Docker Compose (Local Dev)

```bash
docker compose -f infra/docker/docker-compose.yml up --build
```

All four services start with health checks. `product-service` and `payment-service` wait for auth/db before starting.

### 3. Without Docker (Bare Metal)

```bash
# Terminal 1 — Auth Service
cd services/auth
pip install -r requirements.txt
uvicorn main:app --port 8001 --reload

# Terminal 2 — DB Service
cd services/db
pip install -r requirements.txt
uvicorn main:app --port 8002 --reload

# Terminal 3 — Product Service
cd services/product
pip install -r requirements.txt
AUTH_SERVICE_URL=http://localhost:8001 DB_SERVICE_URL=http://localhost:8002 \
uvicorn main:app --port 8003 --reload

# Terminal 4 — Payment Service
cd services/payment
pip install -r requirements.txt
AUTH_SERVICE_URL=http://localhost:8001 DB_SERVICE_URL=http://localhost:8002 STRIPE_API_KEY=sk_test_dummy \
uvicorn main:app --port 8004 --reload
```

### 4. Run On Alternate Local Ports (when defaults are busy)

Use this mapping:

- `auth -> 8101`
- `db -> 8102`
- `product -> 8103`
- `payment -> 8104`
- `dashboard -> 7000`

#### Option A: Kubernetes port-forward (auth/db/product from cluster)

```bash
# Run each in a separate terminal
kubectl port-forward svc/auth-service 8101:8001 -n archaics
kubectl port-forward svc/db-service 8102:8002 -n archaics
kubectl port-forward svc/product-service 8103:8003 -n archaics
kubectl port-forward svc/ai-operator 8105:8005 -n archaics
kubectl port-forward svc/anomaly-detector 8106:8006 -n archaics

# If payment-service exists in your cluster:
# kubectl port-forward svc/payment-service 8104:8004 -n archaics
```

#### Option B: Bare-metal services on alternate ports

```bash
# Terminal 1 — Auth
cd services/auth
pip install -r requirements.txt
uvicorn main:app --port 8101 --reload

# Terminal 2 — DB
cd services/db
pip install -r requirements.txt
uvicorn main:app --port 8102 --reload

# Terminal 3 — Product
cd services/product
pip install -r requirements.txt
AUTH_SERVICE_URL=http://localhost:8101 DB_SERVICE_URL=http://localhost:8102 \
uvicorn main:app --port 8103 --reload

# Terminal 4 — Payment
cd services/payment
pip install -r requirements.txt
AUTH_SERVICE_URL=http://localhost:8101 DB_SERVICE_URL=http://localhost:8102 STRIPE_API_KEY=sk_test_dummy \
uvicorn main:app --port 8104 --reload
```

### Dashboard

The repo now includes a Next.js dashboard at `http://localhost:7000/dashboard`.

```bash
# Install frontend dependencies
cd apps/dashboard
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

Example (dashboard pointed at alternate local ports):

```bash
cd apps/dashboard
AUTH_SERVICE_URL=http://127.0.0.1:8101 \
DB_SERVICE_URL=http://127.0.0.1:8102 \
PRODUCT_SERVICE_URL=http://127.0.0.1:8103 \
PAYMENT_SERVICE_URL=http://127.0.0.1:8104 \
npm run dev
```

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

## AI-Powered Remediation (Layer 2)

The system includes an `anomaly-detector` service and an `ai-operator` service that monitor the Prometheus metrics and automatically orchestrate fixes when services degrade using an LLM.

### Testing the AI Recovery Pipeline

We have provided a convenient script, `generate_errors.sh`, to inject failures and generate traffic so that the anomaly detection system triggers an alert and sends an automated payload to the AI operator.

```bash
# Before running make sure to expose the local ports for the services
# Run the error generation script
bash ./generate_errors.sh
```

Watch the autonomous system detect, analyze, and resolve the issue:

```bash
# Terminal 1: Watch the Anomaly Detector notice the issue and alert the AI Operator
kubectl logs -f deployment/anomaly-detector -n archaics

# Terminal 2: Watch the AI Operator analyze the metrics, determine root causes, and execute fixes
kubectl logs -f deployment/ai-operator -n archaics

# Terminal 3: Watch your Kubernetes pods auto-recover
kubectl get pods -n archaics -w
```
