-- Fix: subscription_payments had missing FORCE ROW LEVEL SECURITY
-- and an overly permissive policy (all org members could do everything).
-- Replace with the same role-scoped pattern used by installments / one_time_payments.

ALTER TABLE subscription_payments FORCE ROW LEVEL SECURITY;

-- Drop the old catch-all policy
DROP POLICY IF EXISTS "org members can manage subscription_payments" ON subscription_payments;

-- SELECT: admin sees all deals, closer sees own deals, sales_partner sees own deals
CREATE POLICY subscription_payments_select_via_deal
  ON subscription_payments FOR SELECT
  USING (
    organization_id = auth_org_id()
    AND EXISTS (
      SELECT 1 FROM deals d
      WHERE d.id = subscription_payments.deal_id
        AND (
          auth_is_admin()
          OR (auth_role() = 'closer'       AND d.closer_id       = auth_closer_id())
          OR (auth_role() = 'sales_partner' AND d.sales_partner_id = auth_partner_id())
        )
    )
  );

-- INSERT / UPDATE / DELETE: admin or the closer who owns the deal
CREATE POLICY subscription_payments_modify_admin_or_owner
  ON subscription_payments FOR ALL
  USING (
    organization_id = auth_org_id()
    AND EXISTS (
      SELECT 1 FROM deals d
      WHERE d.id = subscription_payments.deal_id
        AND (auth_is_admin() OR (auth_role() = 'closer' AND d.closer_id = auth_closer_id()))
    )
  )
  WITH CHECK (
    organization_id = auth_org_id()
    AND EXISTS (
      SELECT 1 FROM deals d
      WHERE d.id = subscription_payments.deal_id
        AND (auth_is_admin() OR (auth_role() = 'closer' AND d.closer_id = auth_closer_id()))
    )
  );

-- Trigger: ensure organization_id always mirrors the parent deal (prevents cross-org inserts)
CREATE OR REPLACE TRIGGER subscription_payments_mirror_org
  BEFORE INSERT OR UPDATE ON subscription_payments
  FOR EACH ROW EXECUTE FUNCTION child_mirror_deal_org();

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS subscription_payments_org_due_idx
  ON subscription_payments(organization_id, due_date);
CREATE INDEX IF NOT EXISTS subscription_payments_deal_paid_idx
  ON subscription_payments(deal_id, paid);
