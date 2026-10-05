-- Publish `notifications` for Realtime, and make delete events carry their row.
--
-- Why this migration exists:
--
-- `src/hooks/useNotifications.js` subscribes to `postgres_changes` on this table,
-- and the migration that created it promised that "a delivery update seen on the
-- seller's phone appears instantly on the buyer's desktop". Postgres changes are
-- only delivered for tables that are members of the `supabase_realtime`
-- publication, and nothing added this one.
--
-- The failure is invisible from the app. The channel is accepted and then refused by
-- the server with "Unable to subscribe to changes with given parameters. Please
-- check Realtime is enabled", the app has no server-side fallback — the only fallback
-- re-reads localStorage on the same device — and the notification panel shows an
-- empty feed. An empty feed is indistinguishable from "nothing has happened", so a
-- feature that was never wired up looked like a quiet day.
--
-- This was confirmed against the server rather than inferred:
--
--   topic: realtime:public:notifications
--   -> status ok, then a system error: "Unable to subscribe to changes with given
--      parameters. Please check Realtime is enabled for the given connect
--      parameters: [event: *, schema: public, table: notifications]"
--
-- REPLICA IDENTITY FULL is set because the client reads `payload.new || payload.old`
-- and builds a row from whichever it gets. With the default replica identity a DELETE
-- event carries only the primary key, so a removed notification would arrive as
-- `{ id }` with an undefined title and timestamp rather than as the row that went.

do $$
begin
  -- `alter publication ... add table` is not idempotent: running it twice aborts
  -- with "table is already member of publication". Guarded so re-applying this
  -- migration is harmless.
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

alter table public.notifications replica identity full;

-- The policy comment in 20250103000000_notifications.sql claimed "only the recipient
-- (or ops for system notices) can read or mutate notifications". That was never true:
-- the client never writes `user_id`, so every row has it null, and `user_id is null`
-- matches every row. Notifications are a role broadcast, not per-user mail — a status
-- change is written by whichever device made it and read by any device acting in that
-- role. That is the design this app actually has, so the access model is left alone
-- and the misleading comment is the thing corrected.
--
-- It is worth being explicit that this is not a privacy boundary. It is the same
-- posture as `orders`, which every signed-in client can read. Anyone reaching this
-- file expecting per-recipient isolation will not find it.
comment on policy "users can manage their own notifications" on public.notifications is
  'Role broadcast, not per-user mail. Permits any signed-in client to read and write any notification, because the client never sets user_id and the user_id is null branch matches every row. This is not a privacy boundary; it matches the access model of public.orders. Set user_id to make a row private to one account.';

comment on table public.notifications is
  'Role-scoped notification broadcast. Cross-device delivery requires this table to be in the supabase_realtime publication, which 20250104000000_notifications_realtime.sql does.';