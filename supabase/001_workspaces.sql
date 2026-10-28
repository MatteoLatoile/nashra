-- Nashra V0.3 : un espace JSON par utilisateur. MVP individuel, pas de partage d'équipe.
-- À exécuter dans Supabase > SQL Editor (une fois).
create table if not exists public.workspaces (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{"announcements":[],"destinations":[],"campaigns":[],"activity":[]}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint workspace_object check (jsonb_typeof(data) = 'object'),
  constraint workspace_size check (octet_length(data::text) <= 1048576)
);

alter table public.workspaces enable row level security;
revoke all on public.workspaces from anon;
grant select, insert, update, delete on public.workspaces to authenticated;

create policy "Nashra: lire son espace" on public.workspaces
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Nashra: créer son espace" on public.workspaces
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Nashra: modifier son espace" on public.workspaces
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Nashra: supprimer son espace" on public.workspaces
  for delete to authenticated using ((select auth.uid()) = user_id);

-- updated_at maintenu côté serveur, non indispensable au fonctionnement de la V0.3
create or replace function public.set_workspace_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end; $$;
drop trigger if exists trg_workspace_updated_at on public.workspaces;
create trigger trg_workspace_updated_at before update on public.workspaces
  for each row execute function public.set_workspace_updated_at();
