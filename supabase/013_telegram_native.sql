-- Telegram-native scheduled messages. Execute after migration 012.
-- The new status is never claimed by the old Nashra Cron worker.
-- Server service role only writes new state/IDs. Users retain read-only access.
ALTER TABLE public.delivery_queue
  ADD COLUMN IF NOT EXISTS telegram_scheduled_ids bigint[] NOT NULL DEFAULT '{}'::bigint[];
ALTER TABLE public.delivery_queue DROP CONSTRAINT IF EXISTS delivery_queue_status_check;
ALTER TABLE public.delivery_queue ADD CONSTRAINT delivery_queue_status_check
  CHECK (status IN ('held','approved','processing','sent','needs_review','blocked','cancelled','telegram_scheduled'));
CREATE INDEX IF NOT EXISTS nashra_native_scheduled_idx
  ON public.delivery_queue(user_id,scheduled_at)
  WHERE status = 'telegram_scheduled';
-- No worker or Cron automatically resubmits these entries.
