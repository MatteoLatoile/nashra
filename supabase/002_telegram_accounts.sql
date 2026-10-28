-- Nashra V0.4 — sessions personnelles Telegram. À exécuter une fois dans le SQL Editor.
-- Le stockage n'accepte que les sessions chiffrées par le backend AES-256-GCM.
create table if not exists public.telegram_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  session_ciphertext text,
  pending_ciphertext text,
  account_name text,
  account_username text,
  last_code_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.telegram_accounts enable row level security;
revoke all on public.telegram_accounts from anon;
grant select, insert, update, delete on public.telegram_accounts to authenticated;
-- Avoid duplicate-policy errors when rerunning this migration.
drop policy if exists "Nashra: compte Telegram individuel" on public.telegram_accounts;
create policy "Nashra: compte Telegram individuel" on public.telegram_accounts
for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
