-- NASHRA V2.5–2.7: subscription state (Stripe TEST only), read own record.
-- Apply AFTER 004 and 005. This SQL never enables Telegram publication or payment processing.
create table if not exists public.nashra_subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  price_id text,
  status text not null default 'free',
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  last_event_created bigint not null default 0,
  updated_at timestamptz not null default now(),
  constraint nashra_sub_status_check check (status in (
    'free','incomplete','incomplete_expired','trialing','active','past_due','canceled','unpaid','paused'
  ))
);
alter table public.nashra_subscriptions enable row level security;
revoke all on public.nashra_subscriptions from public, anon, authenticated;
grant select on public.nashra_subscriptions to authenticated;
drop policy if exists nashra_subscriptions_owner_read on public.nashra_subscriptions;
create policy nashra_subscriptions_owner_read on public.nashra_subscriptions
  for select to authenticated using (auth.uid() = user_id);
-- No INSERT / UPDATE / DELETE for authenticated: only service role writes after webhook verification.
-- Subscription plan status is not yet enforced as a quota for publishing or campaigns.
