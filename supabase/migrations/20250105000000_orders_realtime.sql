-- Publish `orders` for Realtime.
--
-- The second of two tables the client subscribes to that were never in the
-- `supabase_realtime` publication. `20250104000000_notifications_realtime.sql` fixed
-- `notifications`; this one fixes `orders`, which is the more consequential of the
-- two.
--
-- Confirmed against this project rather than inferred. The server accepts the join
-- and then refuses it:
--
--   topic: realtime:public:orders
--   -> phx_reply status ok
--   -> system error: "Unable to subscribe to changes with given parameters. Please
--      check Realtime is enabled for the given connect parameters: [event: *,
--      schema: public, table: orders]"
--
-- What that means in the app, because the subscription looks like it worked:
--
--   - A buyer's booking, or a driver's status change, never reaches another device.
--     The seller board, the driver board and the ops queue each show their own copy
--     of the order list and no changes to it from elsewhere. Every surface says
--     something definitive — "Awaiting payment", "En Route" — about an order whose
--     real state is on someone else's screen.
--   - `useBooking` clears its loading flag only on `SUBSCRIBED`, `CHANNEL_ERROR` or
--     `TIMED_OUT`. The refusal arrives *after* a successful join reply, so this
--     depends on the client library mapping a post-join rejection onto one of those
--     statuses. It does, but it is an accident of the library rather than something
--     the app guarantees, and a hang on the loading state is the alternative. The
--     hook now treats any non-`SUBSCRIBED` status as a failure and bounds the wait,
--     so a refused subscription cannot leave the app loading forever either way.
--
-- REPLICA IDENTITY FULL is for the same reason as on `notifications`: the client
-- builds a row from `payload.new || payload.old`, and a DELETE event without it
-- carries only the primary key.

do $$
begin
  -- Not idempotent on its own: a second run aborts with "table is already member of
  -- publication". Guarded so re-applying is harmless.
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'orders'
  ) then
    alter publication supabase_realtime add table public.orders;
  end if;
end $$;

alter table public.orders replica identity full;