-- Supabase migration: AquaLink database schema
-- Replaces the Firestore collections from functions/index.js

-- Enable required extensions
create extension if not exists "uuid-ossp";

-- -------------------------------------------------------------------------
-- orders: one row per booking. pricing/split stored as JSONB so the
-- server-owned figure can't be contradicted by a modified client later.
create table public.orders (
  id                   text primary key,
  code                 text not null,
  email                text not null,
  phone                text not null,
  location             text not null,
  volume_litres        integer not null,
  currency             text not null default 'GHS',

  pricing              jsonb not null,
  split                jsonb not null,

  gross_minor          integer not null,
  charged_minor        integer not null,
  buyer_pays           integer not null,
  buyer_service_charge integer not null,
  seller_receives      integer not null,
  driver_receives      integer not null,
  platform_commission  integer not null,
  company_take         integer not null,
  discount_minor       integer not null,
  surge_minor          integer not null,

  status               text not null default 'Awaiting payment',
  paystack_reference   text,
  paystack_access_code text,
  paystack_channel     text,

  created_at           timestamptz not null default now(),
  paid_at              timestamptz
);

create index orders_email_idx on public.orders (email);
create index orders_paystack_ref_idx on public.orders (paystack_reference);

-- -------------------------------------------------------------------------
-- config: single-row table for pricing config, matching the Firestore
-- `config` collection's `pricing` document.
create table public.config (
  key          text primary key,
  pricing      jsonb not null default '{"listPrice":600,"discountPercent":50,"surgePercent":0,"surgeReason":""}',
  split        jsonb not null default '{"buyerServiceCharge":0,"seller":45,"driver":15,"platformCommission":40}',
  updated_at   timestamptz not null default now(),
  updated_by   text
);

-- Seed the pricing row on first migration.
insert into public.config (key, pricing, split) values ('pricing', default, default)
  on conflict (key) do nothing;

-- -------------------------------------------------------------------------
-- sellers: seller applications. id is a sha256 of the normalised phone,
-- matching the deterministic hashing in functions/index.js.
create table public.sellers (
  id          text primary key,
  phone       text not null,
  business    text not null,
  vehicle     text not null,
  capacity    text not null,
  status      text not null default 'pending' check (status in ('pending','approved','rejected')),
  applied_at  timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by text,
  review_note text
);

create index sellers_phone_idx on public.sellers (phone);

-- -------------------------------------------------------------------------
-- ops: operator accounts. password stored as PBKDF2/scrypt-style hash+salt.
create table public.ops (
  id            text primary key,
  email         text not null unique,
  role          text not null default 'ops',
  salt          text not null,
  password_hash text not null,
  created_at    timestamptz not null default now(),
  last_login_at timestamptz,
  bootstrapped  boolean not null default false
);

-- -------------------------------------------------------------------------
-- accounts: local user accounts (buyer/seller/institution roles).
-- Provider-backed accounts (google, facebook) store provider_subject
-- and omit password_hash/salt.
create table public.accounts (
  id               uuid primary key default uuid_generate_v4(),
  identifier       text not null unique,
  role             text not null check (role in ('buyer','seller','institution','ops')),
  display_name     text,
  provider         text not null default 'local' check (provider in ('local','google','facebook')),
  provider_subject text,
  password_hash    text,
  password_salt    text,
  created_at       timestamptz not null default now(),
  last_login_at    timestamptz
);

create index accounts_provider_subject_idx on public.accounts (provider, provider_subject);

-- -------------------------------------------------------------------------
-- receipts: locally-stored receipts for paid orders.
create table public.receipts (
  reference      text primary key,
  order_id       text not null,
  issued_at      timestamptz not null default now(),
  status         text not null default 'settled',
  paid_at        timestamptz,
  account_name   text,
  currency       text not null default 'GHS',
  order_value    text not null,
  service_charge text,
  total_charged  text not null,
  seller_share   text not null,
  driver_share   text not null,
  platform_share text not null,
  location       text,
  volume         text
);

-- -------------------------------------------------------------------------
-- fcm_tokens: store push tokens per user for order status notifications.
create table public.fcm_tokens (
  id         uuid primary key default uuid_generate_v4(),
  user_id    text not null,
  token      text not null,
  platform   text not null default 'web',
  created_at timestamptz not null default now(),
  unique (user_id, token)
);

create index fcm_tokens_user_idx on public.fcm_tokens (user_id);

-- Auth policies: only authenticated users can manage their own tokens
alter table public.fcm_tokens enable row level security;
create policy "users can manage their own tokens"
  on public.fcm_tokens
  for all using (auth.uid()::text = user_id)
  with check (auth.uid()::text = user_id);
