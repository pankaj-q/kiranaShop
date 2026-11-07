# MajitKirana — Backend

Express 5 + TypeScript + Prisma + PostgreSQL API for the MajitKirana order & pickup app.

## Quick start

```bash
# 1. install
npm install

# 2. environment
cp .env.example .env      # then edit values

# 3. run
npm run dev               # http://localhost:4000/api/v1/healthz
```

Postgres is added in B2 via `docker-compose.yml` (port **5433**).

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Watch mode with `tsx` |
| `npm run build` | Compile to `dist/` |
| `npm start` | Run compiled build |
| `npm run typecheck` | Type check without emitting |

## Layout

```
src/
  index.ts                 boot + graceful shutdown
  app.ts                   express wiring
  config.ts                env validation (zod)
  routes.ts                /api/v1 routes
  middleware/
    requestLogger.ts       request id + one log line per request
    error.ts               AppError, 404, central error handler
  lib/
    logger.ts              pino logger
```

## Response format

Success: `{ "data": ... }`
Error: `{ "error": { "code", "message", "details?", "requestId?" } }`

Every response carries an `x-request-id` header.

## Health

`GET /api/v1/healthz` → `{ "data": { "status": "ok", "uptime": 12, "timestamp": "..." } }`

## Build order

B1 skeleton (done) → B2 database → B3 auth → B4 catalogue → B5 cart/pricing →
B6 orders → B7 payments → B8 receipts/push → B9 tests & seed.
