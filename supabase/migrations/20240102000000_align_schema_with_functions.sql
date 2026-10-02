-- Align the schema with what the Edge Functions actually read and write.
--
-- Every column below is one an edge function already uses. Each was added to the
-- function code without a matching migration, so the deployment and the database
-- disagreed and the affected endpoints failed at runtime.

-- -------------------------------------------------------------------------
-- orders: the Flutterwave leg.
--
-- `payments/index.ts` stores `flutterwave_reference` on initialise and looks
-- orders up by `paystack_reference.eq.X,flutterwave_reference.eq.X` on verify.
-- With no such column, PostgREST rejects the filter, so *every* payment
-- verification failed with `no_matching_order` — including Paystack, because the
-- `or()` spans both columns. Flutterwave could never settle at all.
alter table public.orders
  add column if not exists flutterwave_reference text;

-- The channel columns are per provider. Both functions previously wrote the same
-- value into both, which meant a Paystack charge recorded a Flutterwave channel
-- and vice versa.
alter table public.orders
  add column if not exists flutterwave_channel text;

create index if not exists orders_flutterwave_ref_idx on public.orders (flutterwave_reference);

-- A unique index on each reference column, so `single()` in the verify handler
-- cannot throw because two orders somehow share a reference. Not unique before:
-- `newReference` makes collision vanishingly unlikely, but "unlikely" is not a
-- constraint, and a duplicate would turn a successful payment into a 500.
create unique index if not exists orders_paystack_reference_uniq
  on public.orders (paystack_reference)
  where paystack_reference is not null;

create unique index if not exists orders_flutterwave_reference_uniq
  on public.orders (flutterwave_reference)
  where flutterwave_reference is not null;

-- -------------------------------------------------------------------------
-- ops: brute-force protection on the operator sign-in.
--
-- `ops/index.ts` hashes with scrypt, which is deliberately slow, but nothing
-- recorded failures. An attacker gets unlimited attempts against a password that
-- unlocks pricing and seller approval. The client-side registry has had a
-- lockout all along (`MAX_FAILED_ATTEMPTS` in src/lib/accounts.js); this brings
-- the server to the same standard.
alter table public.ops
  add column if not exists failed_attempts integer not null default 0,
  add column if not exists locked_until timestamptz;

-- Exactly one operator account, enforced by the database.
--
-- `ops/index.ts` bootstraps by reading for an existing account and then
-- inserting, which is a check-then-act race: two concurrent bootstrap requests
-- both observe zero rows and both insert. The primary key happens to collide on
-- the derived id, but that surfaced as a 500 rather than the 409 the handler
-- means, and the guarantee still rested on code rather than on the schema.
create unique index if not exists ops_single_role_uniq
  on public.ops (role)
  where role = 'ops';

-- -------------------------------------------------------------------------
-- fcm_tokens: the columns `fcm/index.ts` writes.
--
-- It upserts `active` and `updated_at`, neither of which existed, so the insert
-- failed with a Postgres error every time and push tokens were never stored.
alter table public.fcm_tokens
  add column if not exists active boolean not null default true,
  add column if not exists updated_at timestamptz not null default now();