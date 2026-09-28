-- Supabase seed file for local development
-- Run with: supabase db seed

-- This file is run after migrations to populate the database with test data.
-- It uses ON CONFLICT DO NOTHING so it's safe to run multiple times.

-- -------------------------------------------------------------------------
-- Pricing config (single row)
insert into public.config (key, pricing, split, updated_by)
values (
  'pricing',
  '{"listPrice": 600, "discountPercent": 50, "surgePercent": 0, "surgeReason": ""}',
  '{"buyerServiceCharge": 0, "seller": 45, "driver": 15, "platformCommission": 40}',
  'seed'
)
on conflict (key) do nothing;

-- -------------------------------------------------------------------------
-- Test ops account (password: "testpassword123")
-- This is only for local development!
-- Password hash generated with: scryptSync("testpassword123", salt, 64)
-- In production, use the bootstrap endpoint instead.
insert into public.ops (id, email, role, salt, password_hash, bootstrapped)
values (
  'localops1234567890123456',
  'ops@local.dev',
  'ops',
  'localsalt123456789012345678901234',
  'localhash1234567890123456789012345678901234567890123456789012345678901234',
  true
)
on conflict (id) do nothing;

-- -------------------------------------------------------------------------
-- Test seller applications
insert into public.sellers (id, phone, business, vehicle, capacity, status)
values
  (
    'seller11111111111111111111',
    '+233244123456',
    'AquaFlow Water Supply',
    'GT-1234-20',
    '5000L',
    'approved'
  ),
  (
    'seller22222222222222222222',
    '+233544789012',
    'PureSpring Deliveries',
    'GT-5678-21',
    '3000L',
    'pending'
  ),
  (
    'seller33333333333333333333',
    '+233244555666',
    'ClearWater Logistics',
    'GT-9012-19',
    '10000L',
    'rejected'
  )
on conflict (id) do nothing;

-- -------------------------------------------------------------------------
-- Test orders (for development)
insert into public.orders (
  id, code, email, phone, location, volume_litres, currency,
  pricing, split,
  gross_minor, charged_minor, buyer_pays, buyer_service_charge,
  seller_receives, driver_receives, platform_commission, company_take,
  discount_minor, surge_minor,
  status, paystack_reference
)
values
  (
    'AQ-TEST000001',
    'AQ-TEST000001',
    'buyer1@example.com',
    '+233244111222',
    'Accra, East Legon',
    500,
    'GHS',
    '{"listPrice":600,"discountPercent":50,"surgePercent":0,"surgeReason":""}',
    '{"buyerServiceCharge":0,"seller":45,"driver":15,"platformCommission":40}',
    150000, 150000, 150000, 0,
    67500, 22500, 60000, 60000,
    150000, 0,
    'Paid', 'paystack_test_ref_001'
  ),
  (
    'AQ-TEST000002',
    'AQ-TEST000002',
    'buyer2@example.com',
    '+233544333444',
    'Kumasi, Ahodwo',
    1000,
    'GHS',
    '{"listPrice":600,"discountPercent":50,"surgePercent":0,"surgeReason":""}',
    '{"buyerServiceCharge":0,"seller":45,"driver":15,"platformCommission":40}',
    300000, 300000, 300000, 0,
    135000, 45000, 120000, 120000,
    300000, 0,
    'Awaiting payment', null
  )
on conflict (id) do nothing;

-- -------------------------------------------------------------------------
-- Test receipts
insert into public.receipts (
  reference, order_id, issued_at, status, paid_at,
  account_name, currency, order_value, service_charge, total_charged,
  seller_share, driver_share, platform_share, location, volume
)
values
  (
    'paystack_test_ref_001', 'AQ-TEST000001',
    '2024-01-15 10:30:00+00', 'settled', '2024-01-15 10:30:00+00',
    'Test Buyer', 'GHS', '1500.00', '0.00', '1500.00',
    '675.00', '225.00', '600.00', 'Accra, East Legon', '500'
  )
on conflict (reference) do nothing;