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
| orders | order number, idempotency key, raw list, bill note, snapshots, status, paise totals |
| order_items | bill snapshots (name/unit/price/quantity text) |
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
  When the order is placed, the same function runs and its prices are
  snapshot into `order_items`.

## Orders

The primary flow is a **free-text shopping list**: the customer speaks or types
("2 kilo chini, 1 litre tel, Maggi") and the owner builds the bill. Customers do
not pick catalogue items or see prices.

Customer (session required):

| Endpoint | Purpose |
|---|---|
| `POST /api/v1/orders/parse` | Suggest catalogue matches for a list (`listText`) |
| `POST /api/v1/orders/request` | Send a list (`listText`, `customerNote?`, `idempotencyKey?`) |
| `PATCH /api/v1/orders/:id/request` | Replace the list; any bill is cleared |
| `GET /api/v1/orders/:id/bill` | Bill text + `wa.me` link to the shop |
| `POST /api/v1/orders` | Structured order (`items`) — kept for compatibility |
| `GET /api/v1/orders` | Own orders; `status`, `page`, `limit` |
| `GET /api/v1/orders/:id` | Own order with items + event trail |
| `PATCH /api/v1/orders/:id/items` | Replace items while `REQUESTED`, `PLACED` or `ACCEPTED` |
| `POST /api/v1/orders/:id/cancel` | Cancel while `REQUESTED`, `PLACED` or `ACCEPTED` |

Owner only:

| Endpoint | Purpose |
|---|---|
| `GET /api/v1/admin/orders` | Queue; `status`, `page`, `limit`, newest first |
| `POST /api/v1/admin/orders/parse` | Same parser, for the owner's billing screen |
| `GET /api/v1/admin/orders/:id` | Any order |
| `GET /api/v1/admin/orders/:id/bill` | Bill text + `wa.me` link to the customer |
| `PATCH /api/v1/admin/orders/:id/quote` | Turn a list into a bill (`items`, `billNote?`) |
| `PATCH /api/v1/admin/orders/:id/status` | `{ status, note? }` |

**Status flow**

```
REQUESTED ──(owner quote)──► PLACED ──► ACCEPTED ──► PREPARING ──► READY_FOR_PICKUP ──► COMPLETED
    │                          │           │
    └──► REJECTED (owner)      └───────────┴──► REJECTED (owner)
                                           └──► CANCELLED (customer, until PREPARING)
```

`REQUESTED` means the list arrived but no bill exists yet (`totalPaise = 0`).
The owner may also move `PLACED` straight to `PREPARING`. Any other transition
returns `409 INVALID_STATUS_TRANSITION` with the allowed list.

**Parser (`POST /orders/parse`, `/admin/orders/parse`)**

- Splits on new lines, commas, semicolons, `aur` / `and`, `+`.
- Understands digits and common Hindi numbers (`ek`, `do`, `dedh`, `dhai`, …)
  plus units (`kilo`, `litre`, `gm`, `packet`, `dozen`, …).
- Matches product name + `aliases[]`: exact → prefix → all words → any word.
- Returns `{ items, unmatched }`. Each suggestion has `confidence`
  (`high`/`medium`/`low`), `quantity` and `quantityText` (e.g. `"2 kg"`).
- Suggestions are **not** saved; the owner confirms the final bill.

**Quote / bill (`PATCH /admin/orders/:id/quote`)**

```json
{
  "items": [
    { "productId": "...", "quantity": 2 },
    { "productId": "...", "quantity": 1, "quantityText": "1.5 kg", "pricePaise": 6750 },
    { "name": "Doodh", "unit": "500 ml", "quantity": 2, "pricePaise": 3000 }
  ],
  "billNote": "Sugar aaj ₹45/kg"
}
```

- `productId` uses the DB name/unit/price; `pricePaise` may override it.
- Custom lines need `name`, `unit`, `pricePaise`.
- Loose weight: send `quantity: 1` + `quantityText: "1.5 kg"`.
- Re-quoting `PLACED` replaces the old bill and increments `version`.
- `GET /orders/:id/bill` returns `billText` and a `wa.me` link addressed to the
  shop; the owner's variant links to the customer's phone. Sending is a free
  tap-to-send WhatsApp flow — no Cloud API.
- A bill is informational; there is no customer confirmation step. The customer
  can pay (B7), pay at shop, update the list (bill is cleared → `REQUESTED`), or
  cancel before `PREPARING`.

**Behaviour**

- Structured orders are re-priced from the DB; prices are copied into
  `order_items` so later owner changes don't alter past bills.
- Unavailable/removed items block a structured order with `400 CART_INVALID`.
- Name and phone are snapshotted on the order from the customer session.
- `idempotencyKey` makes retried requests safe — same key returns the same order.
- Orders are accepted 24/7. Between close and open, `scheduledFor` is set to the
  next opening time in IST (e.g. ordered 23:30 → 06:00 next day); during shop
  hours it is `null`.
- Every status change is appended to `order_events` (actor + role + note).
- Order number format: `MK-YYYYMMDD-XXXXXX` (IST date + random suffix).

## Response format

Success: `{ "data": ... }`
Error: `{ "error": { "code", "message", "details?", "requestId?" } }`

Every response carries an `x-request-id` header.

## Health

`GET /api/v1/healthz` → `{ "data": { "status": "ok", "uptime": 12, "timestamp": "..." } }`

## Build order

B1 skeleton (done) → B2 database (done) → B3 auth (done) → B4 catalogue (done) →
B5 cart/pricing (done) → B6 structured orders (done) → B6.5 text-list flow (done) →
B7 payments → B8 receipts/push → B9 tests & seed.
