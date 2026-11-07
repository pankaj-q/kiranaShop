# OTP Login — Design (not implemented yet)

Status: **design for review**. The current customer login (`POST /customer/session`
with name + phone) is still active in all environments today; it is a temporary
shortcut and must be replaced before public launch.

## Goal

Prove that the customer owns the phone number before creating a session, without
passwords and without adding a paid user database.

Hinglish UX:

- “Mobile number daalein — hum 6 digit ka code bhejenge.”
- “Code 5 minute me expire ho jayega.”
- “Code nahi mila? 60 second baad dobara bhejein.”

## Current state

| Item | Today |
|---|---|
| Customer identity | `users.phone` unique |
| Login | `POST /api/v1/customer/session` `{ name, phone }` |
| Session | 30-day HttpOnly cookie `mk_session` |
| Abuse control | 10 auth requests/minute per IP |
| OTP | none |

This design replaces only the **customer login** step. Owner login stays
phone + password. Sessions, roles, orders and payments do not change.

## Recommended approach

A provider-agnostic OTP module with three parts:

1. **Challenge stored in Postgres** (hashed code, expiry, attempts).
2. **Rate limits** per phone, per IP and a global daily send cap.
3. **Pluggable sender**:
   - `console` — development/test, prints the code to logs, ₹0.
   - `msg91` or `fast2sms` — production SMS in India.
   - `whatsapp` / `email` — optional later.

### Why not a truly ₹0 SMS for 1,000 users?

There is no reliable free SMS channel for an Indian phone-first app:

| Channel | Cost / catch |
|---|---|
| Console (dev) | Free, but sends nothing |
| MSG91 / Fast2SMS SMS | ~₹0.10–0.25 per SMS + DLT registration |
| Twilio SMS | Higher per-message + India DLT |
| WhatsApp auth template | Paid per message; Meta business + template approval |
| Firebase Phone Auth | Small free SMS quota/day; not enough for launch |
| Email OTP | Free tiers exist, but proves email, not phone |
| Telegram OTP | Free, but not every customer uses Telegram |

At 1,000 customers × 1–2 OTPs/month × ₹0.20, budget roughly **₹200–400/month**,
plus operator-dependent DLT registration. That is the honest cost of SMS OTP.
Hosting can stay ₹0; OTP delivery is the one small variable cost.

**Recommendation:** start with `console` in dev, then **Fast2SMS or MSG91** for
production because both support Indian DLT and are cheaper than Twilio. If the
shop already has WhatsApp Business, a WhatsApp authentication template is a good
alternative. Final choice is an open decision below.

## Customer flow

```
POST /customer/otp/request  { phone, name? }
        │
        ├─ validate phone / block owner number
        ├─ rate-limit phone + IP + global daily cap
        ├─ create OtpChallenge (HMAC hash, 5 min TTL)
        └─ send code via provider  → generic 200 response
                                      (never reveal if phone exists)

POST /customer/otp/verify   { phone, code, name? }
        │
        ├─ latest active challenge for phone
        ├─ check expiry + attempts (max 5)
        ├─ constant-time compare of hash
        ├─ mark consumed (single use)
        ├─ create/update customer (name required for new users)
        └─ create session + set cookie → { user }
```

### Request response

Always the same, whether the phone is new, existing or the provider is slow:

```json
{
  "data": {
    "sent": true,
    "expiresInSeconds": 300,
    "retryAfterSeconds": 60
  }
}
```

The code is **never** returned in production responses. Tests use an injected
in-memory sender, not a debug API.

### Verify response

```json
{ "data": { "user": { "id": "...", "name": "Pankaj", "phone": "9876543210", "role": "CUSTOMER" } } }
```

## UI screens

1. **Mobile number**
   - “Apna mobile number daalein”
   - 10-digit input, `+91` prefix shown but not required
   - Button: “Code bhejein”
   - Small print: “Sirf order pickup ke liye. Koi spam nahi.”

2. **OTP**
   - “6 digit ka code daalein”
   - 6 single-digit boxes, paste-friendly
   - “Code 5 minute me expire ho jayega”
   - Resend disabled for 60 seconds: “Dobara bhejein (00:47)”
   - “Number badlein” goes back without losing the entered name
   - Errors: “Code galat hai”, “Code expire ho gaya, naya code bhejein”,
     “Bahut attempts ho gaye, 15 minute baad try karein”

3. **Name (new customers only)**
   - “Apna naam likhein” so the owner knows whose order it is
   - Existing customers skip this screen; the saved name is reused.

4. **Done**
   - Session cookie set, redirect to the shopping-list screen.
   - Existing orders remain under the same phone number.

## API surface

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/api/v1/customer/otp/request` | Send/resend a code |
| `POST` | `/api/v1/customer/otp/verify` | Verify code, create session |
| `GET` | `/api/v1/customer/me` | Existing session check (unchanged) |
| `POST` | `/api/v1/customer/logout` | Existing logout (unchanged) |

`POST /customer/session` (name + phone, no OTP) becomes **dev/test only**:

- allowed when `NODE_ENV !== 'production'`, or
- allowed when `ALLOW_LEGACY_SESSION=true` is explicitly set.

In production without that flag it returns `403 OTP_REQUIRED`.

### Error codes

| Code | HTTP | When |
|---|---|---|
| `OTP_SENT` | 200 | Code sent (normal response) |
| `RATE_LIMITED` | 429 | Per-phone/IP/window limit |
| `OTP_INVALID` | 400 | Wrong or expired code |
| `OTP_ATTEMPTS_EXCEEDED` | 429 | 5 wrong attempts; request a new code |
| `OTP_SEND_FAILED` | 503 | Provider unavailable; try again |
| `OTP_NOT_CONFIGURED` | 503 | Production started without a provider |
| `PHONE_NOT_ALLOWED` | 403 | Owner number used on the customer flow |
| `INVALID_PHONE` | 400 | Not a valid 10–15 digit number |

Wrong and expired codes share `OTP_INVALID` to avoid revealing which phones have
accounts.

## Data model

```prisma
enum OtpPurpose {
  CUSTOMER_LOGIN
}

model OtpChallenge {
  id                String      @id @default(cuid())
  phone             String
  codeHash          String      @map("code_hash")
  purpose           OtpPurpose  @default(CUSTOMER_LOGIN)
  attempts          Int         @default(0)
  maxAttempts       Int         @default(5) @map("max_attempts")
  expiresAt         DateTime    @map("expires_at")
  consumedAt        DateTime?   @map("consumed_at")
  requestIp         String?     @map("request_ip")
  provider          String?
  providerMessageId String?     @map("provider_message_id")
  createdAt         DateTime    @default(now()) @map("created_at")

  @@index([phone, createdAt])
  @@index([expiresAt])
  @@map("otp_challenges")
}
```

Rules:

- 6-digit code from `crypto.randomInt`, zero-padded.
- Stored as `HMAC-SHA256(OTP_HASH_SECRET, challengeId + ":" + code)`.
- Never store the plain code.
- TTL 5 minutes; single use.
- A new request marks previous active challenges consumed/superseded.
- Attempt counter increments before comparison, so parallel guesses cannot
  exceed the limit.
- Consumed/expired rows are deleted after 7 days (daily cleanup).

## Rate limits

| Scope | Limit | Storage |
|---|---|---|
| Resend to same phone | 1 per 60 seconds | DB (`last challenge`) |
| Same phone | 5 per hour, 10 per day | DB counts |
| Same IP | 10 per hour, 30 per day | `express-rate-limit` |
| Verify attempts | 5 per challenge | DB row |
| Global sends | 300–500 per day | DB count / in-memory counter |
| Owner login | existing 10/min per IP | `express-rate-limit` |

The global cap is the cost circuit-breaker. When it is hit, log an alert and
return `OTP_SEND_FAILED` with a “call the shop” fallback message.

For one Render instance, an in-memory IP limiter is enough. If the API ever runs
on multiple instances, move the IP counters to Upstash Redis (free tier) or a
small Postgres table.

## Provider interface

```ts
// src/modules/auth/otp/sender.ts
export type OtpSender = {
  send(input: { phone: string; code: string }): Promise<{ providerMessageId?: string }>
}
```

Implementations:

- `consoleSender` — logs `[otp] 98765xxxxx -> 123456` in development only.
- `msg91Sender` — DLT template + auth key.
- `fast2smsSender` — DLT template + API key.
- `memorySender` — test-only; exposes the last code to the test process.

The sender is selected at startup from `OTP_PROVIDER`. Invalid/missing config
fails fast in production (`OTP_NOT_CONFIGURED`).

### Environment

```bash
OTP_PROVIDER=console            # console | msg91 | fast2sms | whatsapp | email

OTP_TTL_SECONDS=300
OTP_MAX_ATTEMPTS=5
OTP_RESEND_COOLDOWN_SECONDS=60
OTP_MAX_PER_PHONE_HOUR=5
OTP_MAX_PER_PHONE_DAY=10
OTP_GLOBAL_DAILY_CAP=500
OTP_HASH_SECRET="random-32-plus-char-string"

# Provider credentials (only the chosen provider is needed)
MSG91_AUTH_KEY=""
MSG91_SENDER_ID=""
MSG91_TEMPLATE_ID=""
MSG91_DLT_ENTITY_ID=""

FAST2SMS_API_KEY=""
FAST2SMS_SENDER_ID=""
FAST2SMS_TEMPLATE_ID=""
```

## Security checklist

- No account enumeration: request always returns the same response.
- Code hashed with a server-side pepper, compared in constant time.
- 6 digits, 5-minute TTL, 5 attempts, single use.
- Previous challenge invalidated on resend.
- Phone, IP and global send caps.
- Codes never logged in production; phone numbers redacted in logs.
- Owner phone cannot use the customer OTP flow.
- Session cookie stays HttpOnly; production uses `SameSite=None; Secure`.
- Provider errors are logged with the provider message id, never the code.
- Optional later: Cloudflare Turnstile on the request endpoint (free) if abuse
  appears.

## Migration and rollout

1. **Phase 1 — foundation (no SMS):**
   - Add `OtpChallenge` model + migration.
   - Add sender interface, console sender, memory sender.
   - Add request/verify endpoints and tests.
   - Keep current `/customer/session` for dev/tests.
2. **Phase 2 — frontend:** phone screen → OTP screen → resend timer → session.
3. **Phase 3 — real delivery:** DLT registration, provider credentials, send to
   real test numbers in staging.
4. **Phase 4 — enforce:** in production, disable legacy name+phone login
   (`OTP_REQUIRED`), monitor send volume and failures.

## Tests to add

- Request creates a challenge and sends exactly one code.
- Request for a new vs existing phone has the same response shape.
- Correct code creates/restores the customer and session.
- Wrong code increments attempts; 5th failure returns `OTP_ATTEMPTS_EXCEEDED`.
- Expired code returns `OTP_INVALID`.
- Code is single-use (second verify fails).
- Resend before 60 seconds returns `RATE_LIMITED`.
- 6th request in an hour returns `RATE_LIMITED`.
- Owner phone returns `PHONE_NOT_ALLOWED`.
- Legacy `/customer/session` returns `OTP_REQUIRED` when production-like config
  disables it.
- Global daily cap returns `OTP_SEND_FAILED`.

## Open decisions for you

1. **Delivery channel:** SMS (Fast2SMS/MSG91) or WhatsApp authentication template?
2. **Monthly budget:** is ~₹200–400/month for SMS acceptable?
3. **DLT:** can you complete DLT registration for the shop? Without it, Indian
   SMS delivery will not work.
4. **Legacy login:** keep name+phone login in development only, or remove it
   completely after the frontend moves to OTP?
5. **Name:** require `name` on first verify (recommended), or ask later?
6. **OTP length:** 6 digits (recommended) or 4 digits?

Once 1–3 are decided, Phase 1 can be implemented without waiting for the
provider account.
