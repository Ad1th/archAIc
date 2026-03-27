# DB Service API

Base URL (local): `http://localhost:8002`
Service directory: `services/db`

This service injects/propagates `X-Trace-ID` for all requests.

## Header Conventions

### Request Headers

| Header                           | Required                      | Notes                              |
| -------------------------------- | ----------------------------- | ---------------------------------- |
| `Content-Type: application/json` | Required for `POST /cart/add` | JSON body endpoint                 |
| `X-Trace-ID`                     | Optional on all routes        | If omitted, service generates UUID |

### Response Headers (all routes)

| Header                           | Present | Notes                                      |
| -------------------------------- | ------- | ------------------------------------------ |
| `Content-Type: application/json` | Yes     | JSON response payload                      |
| `X-Trace-ID`                     | Yes     | Echoes incoming trace ID or generated UUID |

## Routes

### 1) GET `/products`

Fetch all products.

- Request headers:
  - `X-Trace-ID` (optional)
- Request body: none

- Success response (`200`):

```json
[
  {
    "id": "p1",
    "name": "Wireless Headphones",
    "price": 79.99,
    "stock": 50
  }
]
```

- Common error responses:
  - `503` injected DB error (`type=error`)

Note: when failure mode is `bad_data`, this route intentionally returns corrupted values such as `name: null` and `price: -1`.

### 2) POST `/cart/add`

Add a product to a user cart and decrement stock.

- Request headers:
  - `Content-Type: application/json` (required)
  - `X-Trace-ID` (optional)
- Request body:

```json
{
  "user_id": "alice",
  "product_id": "p1",
  "quantity": 2
}
```

- Success response (`200`):

```json
{
  "status": "added",
  "cart": [
    {
      "product_id": "p1",
      "name": "Wireless Headphones",
      "price": 79.99,
      "quantity": 2
    }
  ],
  "trace_id": "<uuid>"
}
```

- Common error responses:
  - `404` product not found
  - `409` insufficient stock
  - `503` injected DB error (`type=error`)

### 3) GET `/cart/{user_id}`

Fetch cart for specific user ID.

- Request headers:
  - `X-Trace-ID` (optional)
- Path params:
  - `user_id` (required)
- Request body: none

- Success response (`200`):

```json
{
  "user_id": "alice",
  "items": [
    {
      "product_id": "p1",
      "name": "Wireless Headphones",
      "price": 79.99,
      "quantity": 2
    }
  ],
  "total": 159.98,
  "trace_id": "<uuid>"
}
```

- Common error responses:
  - `503` injected DB error (`type=error`)

### 4) GET `/health`

Health and current failure mode.

- Request headers:
  - `X-Trace-ID` (optional)
- Request body: none

- Success response (`200`):

```json
{
  "status": "healthy",
  "service": "db-service",
  "failure": null
}
```

### 5) POST `/inject-failure?type=<timeout|error|cpu|crash|bad_data>&intensity=1&probability=1.0&duration=<seconds>`

Enable failure injection mode.

- Request headers:
  - `X-Trace-ID` (optional)
- Query params:
  - `type` (required): `timeout`, `error`, `cpu`, `crash`, `bad_data`
  - `intensity` (optional, default `1`): positive integer multiplier
  - `probability` (optional, default `1.0`): trigger chance per request in range `0.0` to `1.0`
  - `duration` (optional): seconds before failure auto-disables
- Request body: none

- Success response (`200`):

```json
{
  "service": "db-service",
  "failure_config": {
    "enabled": true,
    "type": "bad_data",
    "intensity": 1,
    "probability": 1.0,
    "duration": null
  }
}
```

- Common error responses:
  - `400` invalid failure type
  - `400` invalid `intensity`, `probability`, or `duration`

Failure behavior notes:

- `timeout`: delays request by `2 * intensity` seconds
- `error`: returns HTTP `500` with `Simulated failure`
- `cpu`: starts background CPU pressure
- `crash`: terminates process
- `bad_data`: returns intentionally corrupted product payloads

### 6) POST `/reset`

Disable failure injection mode.

- Request headers:
  - `X-Trace-ID` (optional)
- Request body: none

- Success response (`200`):

```json
{
  "status": "reset",
  "service": "db-service"
}
```
