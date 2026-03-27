# Payment Service — archAIc Layer 1

> **Stripe Checkout Integration**
> Handles payment processing with distributed tracing, token validation, and failure injection for RCA testing.

---

Service directory: `services/payment`

---

## Architecture

```
Client
  │
  ▼
Payment Service   :8004   ← Entry point for checkout
  │
  ├─→ Auth Service (token validation)
  │
  ├─→ DB Service (fetch cart total)
  │
  └─→ Stripe API (create checkout session)
```

**Dependency graph:** `payment → auth`, `payment → db`, `payment → stripe`

---

## Quick Start

### With Docker (recommended)

From repo root:

```bash
docker compose -f infra/docker/docker-compose.yml up --build
```

Payment service starts at `http://localhost:8004` after auth + db services are healthy.

### Without Docker (local dev)

```bash
cd services/payment
pip install -r requirements.txt
export STRIPE_API_KEY=sk_test_dummy
export AUTH_SERVICE_URL=http://localhost:8001
export DB_SERVICE_URL=http://localhost:8002
uvicorn main:app --port 8004 --reload
```

---

## Service APIs

### Payment Service — `http://localhost:8004`

| Method | Endpoint                                                                | Description                                  |
| ------ | ----------------------------------------------------------------------- | -------------------------------------------- |
| POST   | `/create-checkout-session`                                              | Create Stripe checkout (requires auth token) |
| GET    | `/health`                                                               | Health + failure state                       |
| POST   | `/inject-failure?type=X&intensity=1&probability=1.0&duration=<seconds>` | Inject failure                               |
| POST   | `/reset`                                                                | Clear failure                                |

---

## Detailed Endpoints

### **POST** `/create-checkout-session`

Creates a Stripe checkout session for the authenticated user's cart.

**Request:**

```
Headers:
  Authorization: Bearer <JWT_TOKEN>
```

**Response (200):**

```json
{
  "checkout_url": "https://mock.stripe.com/checkout/550e8400-e29b-41d4...",
  "amount_usd": 79.99,
  "session_id": "cs_test_550e8400-e29b-41d4...",
  "trace_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Error Responses:**

| Status | Condition                      |
| ------ | ------------------------------ |
| `400`  | Cart is empty                  |
| `401`  | Token validation failed        |
| `500`  | Stripe API error               |
| `503`  | Auth or DB service unreachable |
| `504`  | Auth or DB service timeout     |

**Flow:**

1. Extract `Authorization` token from headers
2. Call `auth-service /validate` to verify token → extract email
3. Extract `user_id` from email (split on "@")
4. Call `db-service /cart/{user_id}` to fetch cart total
5. Validate cart is not empty
6. Create Stripe checkout session
7. Return checkout URL + trace_id

---

### **GET** `/health`

Service health status + current failure injection state.

**Response (200):**

```json
{
  "status": "healthy",
  "service": "payment-service",
  "failure": null
}
```

When failure is injected:

```json
{
  "status": "healthy",
  "service": "payment-service",
  "failure": "timeout"
}
```

---

## Failure Injection

Each failure type tests different failure scenarios relevant to payment processing.

### **POST** `/inject-failure?type=<TYPE>&intensity=1&probability=1.0&duration=<seconds>`

Query parameters:

- `type` (required): `timeout`, `error`, `cpu`, `crash`
- `intensity` (optional, default `1`): positive integer multiplier
- `probability` (optional, default `1.0`): trigger chance per request (`0.0` to `1.0`)
- `duration` (optional): failure auto-disables after given seconds

| Type      | Effect                                    | Use Case                      |
| --------- | ----------------------------------------- | ----------------------------- |
| `timeout` | Delays request by `2 * intensity` seconds | Test timeout handling in RCA  |
| `error`   | Returns HTTP 500 (`Simulated failure`)    | Test error recovery           |
| `cpu`     | Starts background CPU pressure thread     | Monitor CPU impact            |
| `crash`   | Process exits (`os._exit(1)`)             | Test service restart behavior |

**Example:**

```bash
curl -X POST "http://localhost:8004/inject-failure?type=timeout&intensity=2&probability=0.5&duration=30"
```

**Response (200):**

```json
{
  "service": "payment-service",
  "failure_config": {
    "enabled": true,
    "type": "timeout",
    "intensity": 2,
    "probability": 0.5,
    "duration": 30
  }
}
```

### **POST** `/reset`

Clear all failure injections.

**Response (200):**

```json
{
  "status": "reset",
  "service": "payment-service"
}
```

---

## Example: Full Checkout Flow

### 1. Sign up

```bash
curl -X POST http://localhost:8001/signup \
  -H "Content-Type: application/json" \
  -d '{"email": "alice@example.com", "password": "secure123"}'
```

### 2. Login → get token

```bash
TOKEN=$(curl -s -X POST http://localhost:8001/login \
  -H "Content-Type: application/json" \
  -d '{"email": "alice@example.com", "password": "secure123"}' | python -c "import sys,json; print(json.load(sys.stdin)['access_token'])")
```

### 3. Add items to cart

```bash
curl -X POST http://localhost:8003/cart/add \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"product_id": "p1", "quantity": 2}'

curl -X POST http://localhost:8003/cart/add \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"product_id": "p2", "quantity": 1}'
```

### 4. Create checkout session

```bash
curl -X POST http://localhost:8004/create-checkout-session \
  -H "Authorization: Bearer $TOKEN"
```

**Expected output:**

```json
{
  "checkout_url": "https://mock.stripe.com/checkout/550e8400-e29b-41d4...",
  "amount_usd": 79.99,
  "session_id": "cs_test_...",
  "trace_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

---

## Example: Failure Cascade Flow

### 1. Inject DB timeout

```bash
curl -X POST "http://localhost:8002/inject-failure?type=timeout"
```

### 2. Attempt checkout (will fail)

```bash
curl -X POST http://localhost:8004/create-checkout-session \
  -H "Authorization: Bearer $TOKEN"
```

**Expected response (504):**

```json
{
  "detail": "DB service timeout — cart unavailable"
}
```

**Log trace shows:**

```
db-service:      "Injected DB timeout — sleeping 15s"
payment-service: "DB-service timeout on cart fetch after 10002ms"
```

### 3. Reset and retry

```bash
curl -X POST http://localhost:8002/reset
curl -X POST http://localhost:8004/create-checkout-session \
  -H "Authorization: Bearer $TOKEN"
```

**Expected (200):** checkout_url returned.

---

## Log Format

Every log line is valid JSON with trace correlation:

```json
{
  "service": "payment-service",
  "level": "INFO",
  "message": "Creating Stripe Checkout Session for user=alice, total=$79.99",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "trace_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

The same `trace_id` appears in:

- `auth-service` (token validation)
- `db-service` (cart fetch)
- `payment-service` (checkout creation)

This enables **distributed tracing** for RCA across all service layers.

---

## Environment Variables

| Variable                      | Default                    | Description                        |
| ----------------------------- | -------------------------- | ---------------------------------- |
| `AUTH_SERVICE_URL`            | `http://auth-service:8001` | Auth service endpoint              |
| `DB_SERVICE_URL`              | `http://db-service:8002`   | DB service endpoint                |
| `STRIPE_API_KEY`              | `sk_test_dummy`            | Stripe API key (dummy for testing) |
| `REQUEST_TIMEOUT`             | `8`                        | HTTP request timeout in seconds    |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | ``                         | OpenTelemetry endpoint (optional)  |

---

## Stripe Integration Notes

### With Dummy Key (`sk_test_dummy`)

Returns mock checkout URLs:

```json
{
  "checkout_url": "https://mock.stripe.com/checkout/{uuid}",
  "session_id": "cs_test_{uuid}"
}
```

Useful for **testing without real Stripe account**.

### With Real Stripe Key

Set `STRIPE_API_KEY=sk_test_<your_real_key>` in `infra/docker/docker-compose.yml` or environment.

Returns real Stripe checkout URLs:

```json
{
  "checkout_url": "https://checkout.stripe.com/pay/...",
  "session_id": "cs_..."
}
```

---

## Observability

### Metrics (Prometheus)

Automatic instrumentation tracks:

- HTTP request latency
- Request count per endpoint
- Error rates
- Dependency latencies (auth, db, stripe)

Access at: `http://localhost:8004/metrics`

### Traces (Jaeger)

All requests propagate `trace_id` across service chain:

- Payment service calls → auth-service (traced)
- Payment service calls → db-service (traced)
- Total latency visible across all hops

### Logs (Structured JSON)

All logs include:

- Service name: `payment-service`
- Log level: `INFO`, `WARNING`, `ERROR`, `CRITICAL`
- Trace ID for correlation
- Timestamp in ISO 8601 format

---

## Testing Checklist

- [ ] **Health check:** `GET /health` returns 200
- [ ] **Signup → Login → Checkout:** Full flow succeeds with checkout URL
- [ ] **Empty cart:** Returns 400 "Cart is empty"
- [ ] **Invalid token:** Returns 401 "Unauthorized"
- [ ] **Auth timeout:** Inject on auth-service, payment returns 504
- [ ] **DB timeout:** Inject on db-service, payment returns 504
- [ ] **Failure reset:** After reset, service returns to normal
- [ ] **Distributed tracing:** Same trace_id in auth, db, payment logs
- [ ] **Metrics endpoint:** `GET /metrics` returns Prometheus metrics

---

## Dependencies

- **FastAPI** (web framework)
- **httpx** (async HTTP client for service calls)
- **stripe** (Stripe Python SDK)
- **prometheus-fastapi-instrumentator** (metrics)
- **opentelemetry** (distributed tracing)

See `requirements.txt` for versions.

---

## What's Next (Layer 2)

- **Webhook handling** — Stripe webhook verification + order creation
- **Transaction persistence** — Log transactions to data store
- **Receipt emails** — Send confirmation emails via notification service
- **Refund handling** — Support partial/full refund workflows
- **Payment analytics** — Aggregate payment metrics for business insights
- **Retry logic** — Auto-retry failed payments with exponential backoff

---

## Troubleshooting

### "Auth service unreachable"

- Check auth-service is running: `docker ps | grep auth`
- Verify `AUTH_SERVICE_URL` env var points to correct host:port

### "DB service timeout"

- DB service may be slow, increase `REQUEST_TIMEOUT` env var
- Check db-service logs: `docker logs payment-service` (via docker-compose)

### "Cart is empty"

- Add items via product service `/cart/add` endpoint with valid token
- Verify user_id matches between auth token and cart

### "Stripe API error"

- If using real key, check Stripe API credentials
- For testing, use dummy key `sk_test_dummy` (default)

---

## References

- [Stripe Checkout Docs](https://stripe.com/docs/payments/checkout)
- [Main README](../../README.md) — full archAIc project overview
- Service ports: auth=8001, db=8002, product=8003, payment=8004
