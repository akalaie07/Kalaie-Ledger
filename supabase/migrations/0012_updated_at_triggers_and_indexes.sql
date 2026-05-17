-- ============================================================
-- subscription_payments: updated_at trigger
-- ============================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE trigger_name = 'subscription_payments_set_updated_at'
      AND event_object_table = 'subscription_payments'
  ) THEN
    CREATE TRIGGER subscription_payments_set_updated_at
      BEFORE UPDATE ON subscription_payments
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END;
$$;

-- ============================================================
-- messages: performance indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS messages_org_created_idx
  ON messages (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS messages_sender_idx
  ON messages (sender_id);
