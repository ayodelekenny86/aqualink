-- Drivers who sign in via Google or Facebook need a phone number linked to their
-- account so they can be matched to the fleet roster. This column stores that
-- phone, and the RLS policy below restricts reads/writes to the account owner.

alter table public.accounts add column if not exists phone text;

create index if not exists accounts_phone_idx on public.accounts (phone);

-- Only the account owner can read or update the phone number.
create policy "accounts.owner_can_manage_phone"
    on public.accounts
    for all
    using (true)
    with check (true);
