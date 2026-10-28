-- Nashra: one-at-a-time manual publishing, serialized with the scheduled worker.
-- Requires 004, 005, 007, 008. Adds no table and sends no Telegram messages.
-- Execute once in Supabase SQL Editor before using "Publier maintenant".
create or replace function public.nashra_manual_claim(
  p_user_id uuid, p_request_id uuid, p_announcement_id text, p_destination_id text
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare out_id uuid;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Only service_role may claim a manual delivery';
  end if;
  -- The scheduled worker uses the same lock; a personal account never starts
  -- two claims simultaneously through Nashra.
  perform pg_advisory_xact_lock(7294, 24);
  if exists (
    select 1 from public.delivery_queue q
    where q.user_id = p_user_id
      and q.attempted_at > now() - interval '10 minutes'
  ) then
    raise exception 'NASHRA_MANUAL_COOLDOWN_ACCOUNT';
  end if;
  if exists (
    select 1 from public.delivery_queue q
    where q.user_id = p_user_id and q.destination_id = p_destination_id
      and q.attempted_at > now() - interval '60 minutes'
  ) then
    raise exception 'NASHRA_MANUAL_COOLDOWN_DESTINATION';
  end if;
  insert into public.delivery_queue (
    user_id,job_key,campaign_id,announcement_id,destination_id,
    scheduled_at,method,status,attempted_at
  ) values (
    p_user_id,'manual:' || p_request_id::text,'manual',
    p_announcement_id,p_destination_id,now(),'repost','processing',now()
  ) returning id into out_id;
  return out_id;
end;
$$;
revoke all on function public.nashra_manual_claim(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.nashra_manual_claim(uuid,uuid,text,text) to service_role;
