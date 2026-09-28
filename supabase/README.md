# AquaLink Supabase Backend

This directory contains the Supabase backend for AquaLink, including:
- Database migrations
- Edge Functions (API endpoints)
- Local development configuration

## Structure

```
supabase/
├── config.toml              # Supabase CLI configuration
├── .env.example             # Environment variables template
├── seed.sql                 # Seed data for local development
├── migrations/
│   └── 20240101000000_init.sql  # Initial schema
└── functions/
    ├── _lib/                # Shared utilities
    │   ├── utils.ts         # Common helpers (CORS, JSON, errors)
    │   ├── session.ts       # Auth tokens, Paystack verification
    │   └── pricing.ts       # Pricing logic (shared with frontend)
    ├── config/              # Pricing config management
    ├── orders/              # Order creation & payment verification
    ├── payments/            # Paystack integration (initialize, verify, webhook)
    ├── pricing/             # Public price quotes & admin updates
    ├── sellers/             # Seller applications & approvals
    └── ops/                 # Operator authentication & bootstrap
```

## Local Development

### Prerequisites

- [Supabase CLI](https://supabase.com/docs/guides/cli) installed
- Docker running (for local Postgres)

### Setup

```bash
# 1. Start local Supabase stack
supabase start

# 2. Apply migrations (runs automatically on start)
supabase db reset

# 3. Seed test data
supabase db seed

# 4. Serve Edge Functions locally
supabase functions serve
```

### Environment Variables

Copy `.env.example` to `.env` and fill in values:

```bash
cp supabase/.env.example supabase/.env
```

Required for full functionality:
- `PAYSTACK_SECRET_KEY` - From Paystack dashboard
- `OPS_SESSION_SECRET` - Generate with `openssl rand -hex 32`
- `OPS_BOOTSTRAP_TOKEN` - Secure random string for initial admin setup
- `OPS_ADMIN_EMAIL` / `OPS_ADMIN_PASSWORD` - First admin credentials
- `APP_ORIGIN` - Your frontend URL (e.g., `http://localhost:3000`)

### Frontend Integration

The frontend expects these endpoints (via Vite proxy or direct):

| Endpoint | Function | Auth |
|----------|----------|------|
| `GET /config/get` | config | Public |
| `POST /config/update` | config | Ops only |
| `GET /pricing/price?volume=500` | pricing | Public |
| `POST /pricing/update` | pricing | Ops only |
| `POST /orders/create` | orders | Public |
| `GET /orders/verify?reference=xxx` | orders | Public |
| `POST /payments/initialize` | payments | Public |
| `GET /payments/verify?reference=xxx` | payments | Public |
| `POST /payments/webhook` | payments | Paystack signature |
| `POST /sellers/apply` | sellers | Public |
| `GET /sellers/status?phone=xxx` | sellers | Public |
| `GET /sellers/applications` | sellers | Ops only |
| `POST /sellers/review` | sellers | Ops only |
| `POST /ops/login` | ops | Public |
| `POST /ops/bootstrap` | ops | Bootstrap token |

### Deploy to Supabase Cloud

```bash
# Link to your Supabase project
supabase link --project-ref YOUR_PROJECT_REF

# Push migrations
supabase db push

# Set secrets in Supabase Dashboard (Settings > Edge Functions)
# Required secrets:
# - SUPABASE_URL (auto-set)
# - SUPABASE_SERVICE_ROLE_KEY (auto-set)
# - PAYSTACK_SECRET_KEY
# - OPS_SESSION_SECRET
# - OPS_BOOTSTRAP_TOKEN
# - OPS_ADMIN_EMAIL
# - OPS_ADMIN_PASSWORD
# - APP_ORIGIN
# - ALLOWED_ORIGINS

# Deploy functions
supabase functions deploy config
supabase functions deploy orders
supabase functions deploy payments
supabase functions deploy pricing
supabase functions deploy sellers
supabase functions deploy ops

# Create first ops account
curl -X POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/ops/bootstrap \
  -H "X-Ops-Token: YOUR_BOOTSTRAP_TOKEN"
```

### Database Schema

Key tables:
- `orders` - Water delivery bookings with pricing breakdown
- `config` - Single-row pricing/split configuration
- `sellers` - Seller applications (pending/approved/rejected)
- `ops` - Operator accounts with hashed passwords
- `accounts` - User accounts (buyer/seller/institution/ops)
- `receipts` - Payment receipts for paid orders
- `fcm_tokens` - Push notification tokens (RLS protected)

### Testing Locally

```bash
# Test pricing endpoint
curl "http://localhost:54321/functions/v1/pricing/price?volume=500"

# Test seller application
curl -X POST http://localhost:54321/functions/v1/sellers/apply \
  -H "Content-Type: application/json" \
  -d '{"phone":"+233244123456","business":"Test Water Co","vehicle":"GT-1234-20","capacity":"5000L"}'

# Test order creation
curl -X POST http://localhost:54321/functions/v1/orders/create \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","phone":"+233244123456","location":"Accra, East Legon","volumeLitres":500}'
```

### Migration from Firebase Functions

This Supabase backend replaces the Firebase Functions in `functions/index.js`. Key differences:

| Firebase | Supabase |
|----------|----------|
| Firestore | PostgreSQL (with JSONB) |
| Functions v2 | Edge Functions (Deno) |
| Admin SDK | supabase-js with service role |
| Secrets via `defineSecret` | Dashboard secrets / `.env` |
| `FieldValue.serverTimestamp()` | `now()` / `new Date().toISOString()` |

The pricing logic in `_lib/pricing.ts` is identical to `functions/lib/pricing.js` and `src/lib/money.js` - changes must be applied in all three places.