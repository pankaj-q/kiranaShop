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

## Auth

| Endpoint | Purpose |
|---|---|
| `POST /api/v1/admin/login` | Owner login (`login` = phone, `password`) |
| `POST /api/v1/admin/logout` | Owner logout |
| `GET /api/v1/admin/me` | Current owner |
| `POST /api/v1/customer/session` | Create/restore customer session (`name`, `phone`) |
| `POST /api/v1/customer/logout` | Customer logout |
| `GET /api/v1/customer/me` | Current customer |

Sessions are opaque 32-byte tokens, stored as SHA-256 hashes in `sessions`, sent
in the `mk_session` cookie (HttpOnly, SameSite=Lax, Secure in production, 30 days).
Auth endpoints are limited to 10 requests/minute per IP. Owner passwords use
Node's built-in scrypt.

## Catalogue

Public:

| Endpoint | Purpose |
|---|---|
| `GET /api/v1/categories` | Active categories + product count |
| `GET /api/v1/products` | Products; `query`, `category` (slug), `page`, `limit` (max 50) |
| `GET /api/v1/products/:id` | Single product |

Owner only (cookie from `/admin/login`):

| Endpoint | Purpose |
|---|---|
| `GET /api/v1/admin/categories` | All categories, including inactive |
| `POST /api/v1/admin/categories` | Create (`name`, `displayOrder`, `isActive`) |
| `PATCH /api/v1/admin/categories/:id` | Update any field |
| `GET /api/v1/admin/products` | All products; same filters as public |
| `POST /api/v1/admin/products` | Create (`categoryId`, `name`, `aliases`, `unit`, `pricePaise`, `imageUrl`, …) |
| `PATCH /api/v1/admin/products/:id` | Update any field, incl. `isAvailable` |
| `POST /api/v1/admin/products/import` | Import CSV (`{ "csv": "..." }`), upsert by category+name+unit |

Search matches `searchName` (product name + aliases, lowercased) and ranks exact →
prefix → contains. `chini` → Sugar, `tel` → Mustard Oil, `aata` → Aatta. Inactive
categories are hidden publicly; unavailable products stay listed with
`isAvailable: false`. Prices are paise (`4500` = ₹45).

CSV columns: `name, category, unit, price` (rupees), optional `aliases`
(`|` or `;` separated), `image_url`, `description`. Missing image falls back to
`/images/placeholder.png`. Import is all-or-nothing; bad rows return `details`
with row numbers.

## Cart pricing

The cart lives in the browser. Nothing is saved server-side.

`POST /api/v1/cart/price` — body `{ "items": [{ "productId": "...", "quantity": 2 }] }`

Returns one line per product with the **current** DB price:

```json
{
  "data": {
    "items": [
      { "productId": "...", "quantity": 2, "name": "Sugar", "unit": "1 kg",
        "pricePaise": 4500, "lineTotalPaise": 9000,
        "isAvailable": true, "removed": false }
    ],
    "subtotalPaise": 9000,
    "totalPaise": 9000
  }
}
```

- Duplicate `productId`s are merged; total quantity is capped at 99; max 50 lines.
- `isAvailable: false` → product is out of stock or its category is inactive.
  The line is still returned, but **not** added to the total.
- `removed: true` → product no longer exists; `name`/`pricePaise` are `null`.
- Prices are read fresh on every call, so owner changes show up immediately.
  When the order is placed in B6, the same function runs and its prices are
  snapshot into `order_items`.

## Response format

Success: `{ "data": ... }`
Error: `{ "error": { "code", "message", "details?", "requestId?" } }`

Every response carries an `x-request-id` header.

## Health

`GET /api/v1/healthz` → `{ "data": { "status": "ok", "uptime": 12, "timestamp": "..." } }`

## Build order

B1 skeleton (done) → B2 database (done) → B3 auth (done) → B4 catalogue (done) →
B5 cart/pricing (done) → B6 orders → B7 payments → B8 receipts/push → B9 tests & seed.
