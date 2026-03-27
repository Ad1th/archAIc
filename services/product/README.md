# Product Service API

Base URL (local): `http://localhost:8003`
Service directory: `services/product`

This service injects/propagates `X-Trace-ID` for all requests and calls auth-service + db-service upstream.

## Header Conventions

### Request Headers

| Header                           | Required                                                    | Notes                               |
| -------------------------------- | ----------------------------------------------------------- | ----------------------------------- |
| `Authorization: Bearer <token>`  | Required for `GET /products`, `POST /cart/add`, `GET /cart` | Token is validated via auth-service |
| `Content-Type: application/json` | Required for `POST /cart/add`                               | JSON body endpoint                  |
| `X-Trace-ID`                     | Optional on all routes                                      | If omitted, service generates UUID  |

### Response Headers (all routes)

| Header                           | Present | Notes                                      |
| -------------------------------- | ------- | ------------------------------------------ |
| `Content-Type: application/json` | Yes     | JSON response payload                      |
| `X-Trace-ID`                     | Yes     | Echoes incoming trace ID or generated UUID |

## Routes

### 1) GET `/products`

Return product catalog after auth validation.

- Request headers:
  - `Authorization: Bearer <token>` (required)
  - `X-Trace-ID` (optional)
- Request body: none

- Success response (`200`):

```json
{
  "products": [
    {
      "id": "p1",
      "name": "Wireless Headphones",
      "price": 79.99,
      "stock": 50
    }
  ],
  "trace_id": "<uuid>"
}
```

- Common error responses:
  - `401` auth validation failed
  - `503` auth/db service unreachable
  - `504` auth/db service timeout
  - `500` injected failure (`type=error`)

### 2) POST `/cart/add`

Add authenticated user item to cart.

- Request headers:
  - `Authorization: Bearer <token>` (required)
  - `Content-Type: application/json` (required)
  - `X-Trace-ID` (optional)
- Request body:

```json
{
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
  - `401` auth validation failed
  - `404` product not found (from db-service)
  - `409` insufficient stock (from db-service)
  - `503` auth/db service unreachable
  - `504` auth/db service timeout
  - `500` injected failure (`type=error`)

### 3) GET `/cart`

Fetch authenticated user cart.

- Request headers:
  - `Authorization: Bearer <token>` (required)
  - `X-Trace-ID` (optional)
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
  - `401` auth validation failed
  - `503` auth/db service unreachable
  - `504` auth/db service timeout
  - `500` injected failure (`type=error`)

### 4) GET `/health`

Health and current failure mode.

- Request headers:
  - `X-Trace-ID` (optional)
- Request body: none

- Success response (`200`):

```json
{
  "status": "healthy",
  "service": "product-service",
  "failure": null
}
```

### 5) POST `/inject-failure?type=<timeout|error|cpu|crash>&intensity=1&probability=1.0&duration=<seconds>`

Enable failure injection mode.

- Request headers:
  - `X-Trace-ID` (optional)
- Query params:
  - `type` (required): `timeout`, `error`, `cpu`, `crash`
  - `intensity` (optional, default `1`): positive integer multiplier
  - `probability` (optional, default `1.0`): trigger chance per request in range `0.0` to `1.0`
  - `duration` (optional): seconds before failure auto-disables
- Request body: none

- Success response (`200`):

```json
{
  "service": "product-service",
  "failure_config": {
    "enabled": true,
    "type": "timeout",
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

### 6) POST `/reset`

Disable failure injection mode.

- Request headers:
  - `X-Trace-ID` (optional)
- Request body: none

- Success response (`200`):

```json
{
  "status": "reset",
  "service": "product-service"
}
```
