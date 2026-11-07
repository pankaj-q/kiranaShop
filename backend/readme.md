# MajitKirana — Backend

Express 5 + TypeScript + Prisma + PostgreSQL API for the MajitKirana order & pickup app.

## Quick start

```bash
# 1. install
npm install

# 2. environment
cp .env.example .env      # then edit values

# 3. database (Postgres 18 on port 5433)
docker compose up -d

# 4. schema + seed
npx prisma migrate dev
npx prisma db seed

# 5. run
npm run dev               # http://localhost:4000/api/v1/healthz
```

Owner login defaults used by the seed: `ADMIN_LOGIN` / `ADMIN_PASSWORD` from `.env`.

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Watch mode with `tsx` |
| `npm run build` | Generate Prisma client + compile to `dist/` |
| `npm start` | Run compiled build |
| `npm run typecheck` | Type check without emitting |
| `npm run db:generate` | Regenerate Prisma client |
| `npm run db:migrate` | Create/apply a dev migration |
| `npm run db:deploy` | Apply migrations in production |
| `npm run db:seed` | Seed store settings + owner |

## Layout

```
prisma/
  schema.prisma            10 models, 5 enums
  migrations/              SQL migrations
  seed.ts                  store settings + owner (idempotent)
prisma7.config.ts          Prisma 7 config (schema, migrations, seed)
src/
  index.ts                 boot + graceful shutdown
  app.ts                   express wiring
  config.ts                env validation (zod)
  db.ts                    Prisma client + pg adapter
  routes.ts                /api/v1 routes
  middleware/
    requestLogger.ts       request id + one log line per request
    error.ts               AppError, 404, central error handler
  lib/
    logger.ts              pino logger
    password.ts            scrypt hash/verify (owner password)
  generated/prisma/        generated client (gitignored)
```

## Data model

| Table | Purpose |
|---|---|
| users | customer + owner accounts, phone unique, scrypt password |
| sessions | opaque session tokens (hashed), expiry |
| categories | catalogue categories |
| products | ~400 SKUs, aliases[] for chini/tel search, image URL |
| orders | order number, idempotency key, snapshots, status, paise totals |
| order_items | item snapshots (name/unit/price at order time) |
| order_events | audit trail for every status change |
| payments | pay-at-shop / UPI manual + UTR + verification |
| store_settings | singleton: MajitKirana, 06:00–23:00 IST |
| push_subscriptions | Web Push endpoints per customer |

Money is integer **paise**. Timestamps are UTC; business rules use `Asia/Kolkata`.


## Response format

Success: `{ "data": ... }`
Error: `{ "error": { "code", "message", "details?", "requestId?" } }`

Every response carries an `x-request-id` header.

## Health

`GET /api/v1/healthz` → `{ "data": { "status": "ok", "uptime": 12, "timestamp": "..." } }`

## Build order

B1 skeleton (done) → B2 database (done) → B3 auth → B4 catalogue →
B5 cart/pricing → B6 orders → B7 payments → B8 receipts/push → B9 tests & seed.
