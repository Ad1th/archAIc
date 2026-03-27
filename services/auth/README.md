# Auth Service API

Base URL (local): `http://localhost:8001`
Service directory: `services/auth`

This service injects/propagates `X-Trace-ID` for all requests.

## Header Conventions

### Request Headers

| Header                           | Required                                   | Notes                              |
| -------------------------------- | ------------------------------------------ | ---------------------------------- |
| `Content-Type: application/json` | Required for `POST /signup`, `POST /login` | JSON body endpoints                |
| `Authorization: Bearer <token>`  | Required for `GET /validate`               | Validates token signature          |
| `X-Trace-ID`                     | Optional on all routes                     | If omitted, service generates UUID |

### Response Headers (all routes)

| Header                           | Present | Notes                                      |
| -------------------------------- | ------- | ------------------------------------------ |
| `Content-Type: application/json` | Yes     | JSON response payload                      |
| `X-Trace-ID`                     | Yes     | Echoes incoming trace ID or generated UUID |

## Routes

### 1) POST `/signup`

Register a new user and return an access token.

- Request headers:
  - `Content-Type: application/json` (required)
  - `X-Trace-ID` (optional)
- Request body:

```json
{
  "email": "alice@example.com",
  "password": "secure123"
}
```

- Success response (`200`):

```json
{
  "access_token": "<token>",
  "token_type": "bearer",
  "trace_id": "<uuid>"
}
```

- Common error responses:
  - `409` email already registered
  - `500` injected failure (`type=error`)

### 2) POST `/login`

Authenticate user and return an access token.

- Request headers:
  - `Content-Type: application/json` (required)
  - `X-Trace-ID` (optional)
- Request body:

```json
{
  "email": "alice@example.com",
  "password": "secure123"
}
```

- Success response (`200`):

```json
{
  "access_token": "<token>",
  "token_type": "bearer",
  "trace_id": "<uuid>"
}
```

- Common error responses:
  - `401` invalid credentials
  - `500` injected failure (`type=error`)

### 3) GET `/validate`

Validate bearer token. Used by product-service.

- Request headers:
  - `Authorization: Bearer <token>` (required)
  - `X-Trace-ID` (optional)
- Request body: none

- Success response (`200`):

```json
{
  "valid": true,
  "email": "alice@example.com",
  "trace_id": "<uuid>"
}
```

- Common error responses:
  - `401` invalid or expired token
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
  "service": "auth-service",
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
  "service": "auth-service",
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
  "service": "auth-service"
}
```
