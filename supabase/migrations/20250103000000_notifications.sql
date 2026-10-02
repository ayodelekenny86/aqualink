-- Notifications table for cross-device notification sync.
--
-- Notifications are persisted in the `notifications` table so a delivery update
-- seen on the seller's phone appears instantly on the buyer's desktop. The
-- client subscribes via Supabase Realtime; localStorage is the offline cache.

create table if not exists public.notifications (
  id          uuid primary key default uuid_generate_v4(),
  role        text not null,
  user_id     text,
  title       text not null,
  body        text,
  order_id    text references public.orders(id),
  kind        text not null default 'info',
  read        boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists notifications_user_id_idx on public.notifications (user_id);
create index if not exists notifications_role_idx on public.notifications (role);
create index if not exists notifications_read_idx on public.notifications (read);
create index if not exists notifications_order_id_idx on public.notifications (order_id);

-- Only the recipient (or ops for system notices) can read or mutate notifications.
alter table public.notifications enable row level security;

create policy "users can manage their own notifications"
  on public.notifications for all
  using (user_id is null or user_id = auth.uid()::text)
  with check (user_id is null or user_id = auth.uid()::text);
