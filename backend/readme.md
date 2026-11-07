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
The same seed adds a starter catalogue of 216 common kirana products with
Hinglish aliases and placeholder images. Prices are rough starting values — the
owner should review them in the admin panel. Re-running the seed only adds
missing rows, so owner edits are never overwritten.

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Watch mode with `tsx` |
| `npm run build` | Generate Prisma client + compile to `dist/` |
| `npm start` | Run compiled build |
| `npm run typecheck` | Type check without emitting |
| `npm test` | Integration tests against a dedicated test database |
| `npm run test:prepare` | Apply migrations to the test database |
| `npm run db:generate` | Regenerate Prisma client |
| `npm run db:migrate` | Create/apply a dev migration |
| `npm run db:deploy` | Apply migrations in production |
| `npm run db:seed` | Seed store, owner and starter catalogue |

## Tests

The suite uses Node's test runner + `supertest` against the real Express app and
Postgres. It covers auth, catalogue/search, list parsing, request → quote → bill,
receipts, UPI verification, ready transitions and authz.

```bash
# one-time: create the test database
docker exec majitkirana-db createdb -U majit majitkirana_test

npm run test:prepare      # apply migrations to majitkirana_test
npm test
```

- Tests **refuse to run** unless the database name contains `test`.
- They truncate only the test database before and after the run.
- Override with `TEST_DATABASE_URL` or `TEST_SESSION_SECRET` if needed.
- Currently 20 tests (16 API integration + 4 IST/date unit); `npm test` is
  sequential by design and sets `OTP_PROVIDER=memory` for the OTP tests.

## Layout

```
docs/
  otp-design.md            OTP login design + Phase 1 implementation notes
prisma/
  schema.prisma            11 models, 6 enums
  migrations/              SQL migrations
  catalogue.ts             starter catalogue (216 SKUs, rupee prices)
  seed.ts                  store + owner + catalogue (idempotent)
prisma7.config.ts          Prisma 7 config (schema, migrations, seed)
src/
  index.ts                 boot + graceful shutdown
  app.ts                   express wiring
  config.ts                env validation (zod)
  db.ts                    Prisma client + pg adapter
  routes.ts                /api/v1 routes + DB-backed health check
  middleware/
    requestLogger.ts       request id + one log line per request
    error.ts               AppError, 404, central error handler
    rateLimit.ts           per-customer order + per-IP OTP limiters
  tests/
    api.test.ts            end-to-end API integration tests
    ist.test.ts            IST opening-hours/date tests
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
| otp_challenges | hashed OTP codes, attempts, expiry, single-use |
| categories | catalogue categories |
| products | 216 starter SKUs, aliases[] for chini/tel search, image URL |
| orders | order number, idempotency key, raw list, bill note, snapshots, status, paise totals |
| order_items | bill snapshots (name/unit/price/quantity text) |
| order_events | audit trail for every status change |
| payments | pay-at-shop / UPI manual + UTR + verification |
| store_settings | singleton: MajitKirana, 06:00–23:00 IST |
| push_subscriptions | Web Push endpoints per customer |

Money is integer **paise**. Timestamps are UTC; business rules use `Asia/Kolkata`.

## Auth

Customer login uses a 6-digit OTP. The owner still logs in with phone + password.

| Endpoint | Purpose |
|---|---|
| `POST /api/v1/admin/login` | Owner login (`login` = phone, `password`) |
| `POST /api/v1/admin/logout` | Owner logout |
| `GET /api/v1/admin/me` | Current owner |
| `POST /api/v1/customer/otp/request` | Send a code (`phone`); response is the same for new and existing numbers |
| `POST /api/v1/customer/otp/verify` | Verify `phone`, `code`, optional `name`; sets the session cookie |
| `POST /api/v1/customer/session` | Legacy name+phone shortcut (tests/frontend migration only) |
| `POST /api/v1/customer/logout` | Customer logout |
| `GET /api/v1/customer/me` | Current customer |

OTP rules:

- 6-digit code, stored as an HMAC-SHA256 hash, 5-minute TTL, single use.
- Maximum 5 attempts per code; wrong and expired codes both return `OTP_INVALID`.
- Resend cooldown 60 seconds; per-phone 5/hour and 10 per rolling 24 hours;
  global cap 500 per rolling 24 hours.
- Per-IP limits: **30 requests/hour** and **30 verifies/15 minutes**.
- New customers must send `name` on verify (`NAME_REQUIRED` otherwise); existing
  customers reuse their saved name and may update it.
- The owner phone is blocked on the customer flow (`PHONE_NOT_ALLOWED`).
- Development uses `OTP_PROVIDER=console` (prints the code to the server log);
  tests use `memory`. Production requires a real SMS/WhatsApp provider. Until one
  is configured, production OTP endpoints return `503 OTP_NOT_CONFIGURED`.
- `OTP_HASH_SECRET` defaults to `SESSION_SECRET`; use a separate random value in
  production.

Local testing with OTP:

1. Run backend in dev mode: `npm run dev` (uses `OTP_PROVIDER=console`).
2. Open the app, enter a phone number, click "Code bhejein".
3. The 6-digit code is printed in the backend terminal:
   `OTP code for 98******10: 123456`
4. Enter that code in the UI and verify.
5. Each phone has a 60-second resend cooldown; use a different number to test again.
6. If you see `OTP_NOT_CONFIGURED`, the backend is running in production mode
   without a real provider — restart with `NODE_ENV=development`.

For tests, `npm test` sets `OTP_PROVIDER=memory` automatically.

Sessions are opaque 32-byte tokens, stored as SHA-256 hashes in `sessions`, sent
in the `mk_session` cookie (HttpOnly, SameSite=Lax in development, SameSite=None
+ Secure in production for the split Pages/Render setup, 30 days).
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

Search matches `searchName` (product name + aliases, lowercased) word-wise: every
query word must prefix a word in the search name, so `chini` → Sugar but not
`dalchini` → Cinnamon. Results rank exact → prefix → contains. `tel` → Mustard
Oil, `aata` → Aatta. Inactive categories are hidden publicly; unavailable
products stay listed with `isAvailable: false`. Prices are paise (`4500` = ₹45).

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
    { "productId": "...", "quantity": 1, "quantityText": "1.5 kg", "pricePaise": 4500, "lineTotalPaise": 6750 },
    { "name": "Doodh", "unit": "500 ml", "quantity": 2, "pricePaise": 3000 }
  ],
  "billNote": "Sugar aaj ₹45/kg"
}
```

- `productId` uses the DB name/unit/price; `pricePaise` may override it.
- Custom lines need `name`, `unit`, `pricePaise`.
- Loose weight: send `quantity: 1` + `quantityText: "1.5 kg"` + the exact
  `lineTotalPaise` (e.g. 1.5 kg × ₹45 = `6750`), so the receipt shows the right
  rate and amount.
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
- New order creation (structured or text list) is limited to **10 per 10
  minutes per customer**; exceeding it returns `429 RATE_LIMITED` with a
  `Retry-After` header. The limiter is in-memory and suits one Render instance.
- Name and phone are snapshotted on the order from the customer session.
- `idempotencyKey` makes retried requests safe — same key returns the same order.
- Orders are accepted 24/7. Between close and open, `scheduledFor` is set to the
  next opening time in IST (e.g. ordered 23:30 → 06:00 next day); during shop
  hours it is `null`.
- Every status change is appended to `order_events` (actor + role + note).
- Order number format: `MK-YYYYMMDD-XXXXXX` (IST date + random suffix).

## Payments

UPI is manual: the customer scans a dynamic UPI QR, pays in their own app, then
submits the UTR. The owner verifies it. Cash at pickup is recorded by the owner.
UPI can only start after a bill exists (`PLACED` or later).

**Settings** (owner configures the shop UPI ID; `null` means UPI is off):

| Endpoint | Purpose |
|---|---|
| `GET /api/v1/settings` | Public store info incl. `upiId` |
| `GET /api/v1/admin/settings` | Full store settings |
| `PATCH /api/v1/admin/settings` | Update `upiId`, store name, phone, hours, `pickupNote`, `manualClosed` |

`manualClosed` is a storefront banner flag for the frontend; orders are still
accepted 24/7 and scheduled by the opening hours above.

Customer (session required):

| Endpoint | Purpose |
|---|---|
| `GET /api/v1/orders/:id/payment` | Amount due, UPI intent + QR, payment history |
| `POST /api/v1/orders/:id/payments/upi` | Submit `{ "utrReference": "..." }` after paying |

Owner only:

| Endpoint | Purpose |
|---|---|
| `GET /api/v1/admin/payments` | Payment queue; `status`, `page`, `limit` |
| `POST /api/v1/admin/payments/:id/verify` | Confirm UTR; optional `amountPaise`, `note` |
| `POST /api/v1/admin/payments/:id/reject` | Reject a pending UTR; optional `note` |
| `POST /api/v1/admin/payments/:id/refund` | Refund a paid/partial payment; optional `note` |
| `POST /api/v1/admin/orders/:id/pay-at-shop` | Record cash; optional `amountPaise`, `note` |

**Payment screen response**

```json
{
  "billReady": true,
  "totalPaise": 9000,
  "amountPaidPaise": 0,
  "amountDuePaise": 9000,
  "paymentStatus": "UNPAID",
  "canPay": true,
  "canPayAtShop": true,
  "pendingPaymentId": null,
  "upi": {
    "upiId": "shop@upi",
    "uri": "upi://pay?pa=shop%40upi&pn=MajitKirana&am=90.00&cu=INR&tn=Order%20MK-...",
    "qrDataUrl": "data:image/png;base64,..."
  },
  "payments": []
}
```

- `upi` is `null` when UPI is not configured, nothing is due, or a payment is
  already pending. In that case the customer can still pay at the shop.
- The QR is a PNG data URL generated from the exact amount due, so it is always
  dynamic per order/part-payment.
- Without a configured `upiId`, submitting UPI returns `409 UPI_NOT_CONFIGURED`;
  cash at shop still works.

**Rules**

- Payment is allowed for `PLACED`, `ACCEPTED`, `PREPARING`, `READY_FOR_PICKUP`
  and `COMPLETED`. `REQUESTED`, `CANCELLED` and `REJECTED` cannot be paid.
- `REQUESTED` (no bill yet) → `409 BILL_NOT_READY`.
- UTR: 6–50 letters/numbers, stored uppercase, unique across all non-rejected
  payments.
- Only one pending UPI payment per order (`409 PAYMENT_PENDING` otherwise).
- Owner verification can lower the amount (part payment). `amountPaise` must
  not exceed the remaining due.
- Order `paymentStatus` is derived: `PAID` when paid ≥ total, else
  `AWAITING_VERIFICATION` while a UTR is pending, else `PARTIAL` when something
  was paid, else `UNPAID`. Refunded payments are excluded.
- While a payment is pending or paid, the customer cannot edit the list or
  cancel, and the owner cannot re-quote or reject the order. Reject/refund the
  payment first (`409 ORDER_HAS_PAYMENT`).
- Every payment action is appended to `order_events`.
- `PATCH /admin/settings` validates the UPI ID (`shop@upi` style); send `""` or
  `null` to disable UPI.

## Web Push

The customer subscribes after login; when the owner marks an order
`READY_FOR_PICKUP`, every registered device gets a push.

| Endpoint | Purpose |
|---|---|
| `GET /api/v1/push/public-key` | `{ enabled, publicKey }` for the browser |
| `POST /api/v1/push/subscribe` | Save `{ endpoint, keys: { p256dh, auth } }` |
| `POST /api/v1/push/unsubscribe` | Remove `{ endpoint }` for this customer |

Enable it with VAPID keys in the environment:

```bash
npx web-push generate-vapid-keys --json
# put the values in .env
VAPID_PUBLIC_KEY="..."
VAPID_PRIVATE_KEY="..."
VAPID_SUBJECT="mailto:owner@example.com"
```

- If keys are missing, `/push/public-key` returns `enabled: false`, and
  `/push/subscribe` returns `503 PUSH_DISABLED`. Orders and receipts still work.
- The same browser endpoint can be re-subscribed; it moves to the latest
  customer (useful after logout/login).
- Push payload: title, body, order URL and a stable tag. Sending failures never
  block the status update.
- Dead subscriptions (`404`/`410` from the push service) are deleted
  automatically; successful sends update `last_success_at`.

## Printable receipt

| Endpoint | Purpose |
|---|---|
| `GET /api/v1/orders/:id/receipt` | Receipt JSON + print-ready `html` |
| `GET /api/v1/orders/:id/receipt.html` | Direct A4-printable HTML |
| `GET /api/v1/admin/orders/:id/receipt` | Same, owner view |
| `GET /api/v1/admin/orders/:id/receipt.html` | Owner printable HTML |

- Works once a bill exists; `REQUESTED`/empty bills return `409 BILL_NOT_READY`.
- The first receipt request assigns a unique `receiptNumber`
  (`R-YYYYMMDD-XXXXXX`) and stores it on the order.
- Receipts include store details, customer, items, subtotal, total, paid, due,
  payment status/method/UTR, bill note, pickup note and UPI ID when unpaid.
- HTML is A4 print-ready with inline CSS; open the `.html` URL and use
  Ctrl/Cmd + P to print or save as PDF. All user/store text is HTML-escaped.
- Any bill change (list edit, item edit, re-quote) clears `receiptNumber`, so the
  next printout gets a fresh number for the new bill.

## Response format

Success: `{ "data": ... }`
Error: `{ "error": { "code", "message", "details?", "requestId?" } }`

Malformed JSON returns `400 INVALID_JSON`; bodies over 1 MB return
`413 PAYLOAD_TOO_LARGE`.

Every response carries an `x-request-id` header.

## Health

| Endpoint | Checks | Use |
|---|---|---|
| `GET /api/v1/livez` | process only | Render liveness probe (cheap, no DB wake) |
| `GET /api/v1/healthz` | Postgres (`SELECT 1`) | readiness / uptime monitoring |
| `GET /api/v1/readyz` | Postgres (`SELECT 1`) | explicit readiness alias |

```json
{ "data": { "status": "ok", "database": "ok", "uptime": 12, "timestamp": "...", "latencyMs": 3 } }
```

If the database is unreachable `/healthz` and `/readyz` return **503** with
`status: "degraded"` and `database: "down"`. Point Render's frequent health probe
at `/livez` so Neon can auto-suspend and stay within the free compute hours; use
`/healthz` for an occasional deeper check.

## Build order

B1 skeleton (done) → B2 database (done) → B3 auth (done) → B4 catalogue (done) →
B5 cart/pricing (done) → B6 structured orders (done) → B6.5 text-list flow (done) →
B7 payments (done) → B8 receipts/push (done) → B9 tests & seed (done) →
OTP login Phase 1 (done) → OTP real providers + enforcement → B10 deployment.
