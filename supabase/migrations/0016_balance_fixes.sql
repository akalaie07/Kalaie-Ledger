-- =============================================================================
-- Migration 0016: Saldo-Korrekturen in deal_balance / deals_with_status
--
-- 1) Regression aus 0014: down_payment fehlte wieder in paid_sum/open_sum
--    (0002 hatte die Anzahlung eingerechnet, 0014 hat sie beim Abo-Umbau
--    verloren). Folge: Umsatz/Saldo waren bei allen Deals mit Anzahlung
--    systematisch um den Anzahlungsbetrag falsch.
-- 2) Stornierte (storniert) und zurückgebuchte (chargeback) Deals zählen
--    nicht mehr als Umsatz und erscheinen nicht mehr als offene/überfällige
--    Forderung im Forderungsmanagement.
-- 3) deals_with_status: neuer computed_status 'cancelled' für solche Deals
--    (Inkasso-Fälle behalten Vorrang und bleiben 'in_collection').
-- =============================================================================

create or replace view deal_balance with (security_invoker = on) as
select
  d.id            as deal_id,
  d.organization_id,
  case
    when coalesce(d.storniert, false) or coalesce(d.chargeback, false) then 0
    when d.payment_type = 'installments' then
      -- Anzahlung gilt als bezahlt; Raten decken total_price - down_payment ab
      coalesce(d.down_payment, 0) +
      coalesce((select sum(amount) from installments where deal_id = d.id and paid), 0)
    when d.payment_type in ('subscription_monthly', 'subscription_yearly') then
      -- Anmeldegebühr (falls bezahlt) + alle bezahlten Abo-Zahlungen
      coalesce(
        case when exists (select 1 from one_time_payments where deal_id = d.id and paid)
          then d.total_price else 0 end, 0
      ) +
      coalesce((select sum(amount) from subscription_payments where deal_id = d.id and paid), 0)
    when exists (select 1 from one_time_payments where deal_id = d.id and paid) then d.total_price
    else coalesce(d.down_payment, 0)
  end as paid_sum,
  case
    when coalesce(d.storniert, false) or coalesce(d.chargeback, false) then 0
    when d.payment_type = 'installments' then
      coalesce((select sum(amount) from installments where deal_id = d.id and not paid), 0)
    when d.payment_type in ('subscription_monthly', 'subscription_yearly') then
      -- Anmeldegebühr (falls offen) + alle offenen Abo-Zahlungen
      coalesce(
        case when not exists (select 1 from one_time_payments where deal_id = d.id and paid)
          then d.total_price else 0 end, 0
      ) +
      coalesce((select sum(amount) from subscription_payments where deal_id = d.id and not paid), 0)
    when exists (select 1 from one_time_payments where deal_id = d.id and paid) then 0
    else d.total_price - coalesce(d.down_payment, 0)
  end as open_sum,
  case
    when coalesce(d.storniert, false) or coalesce(d.chargeback, false) then 0
    when d.payment_type = 'installments' then
      coalesce((select sum(amount) from installments where deal_id = d.id and not paid and due_date < current_date), 0)
    when d.payment_type in ('subscription_monthly', 'subscription_yearly') then
      coalesce((select sum(amount) from subscription_payments where deal_id = d.id and not paid and due_date < current_date), 0)
    else 0
  end as overdue_sum,
  case
    when coalesce(d.storniert, false) or coalesce(d.chargeback, false) then false
    when d.payment_type = 'installments' then
      exists (select 1 from installments where deal_id = d.id and not paid and due_date < current_date)
    when d.payment_type in ('subscription_monthly', 'subscription_yearly') then
      exists (select 1 from subscription_payments where deal_id = d.id and not paid and due_date < current_date)
    else false
  end as has_overdue
from deals d;

-- deals_with_status nutzt d.* — die Spaltenliste wurde bei der Erstellung in
-- 0001 eingefroren, seitdem kamen neue deals-Spalten dazu. CREATE OR REPLACE
-- erlaubt keine Spaltenverschiebung → View (samt abhängiger deals_overdue)
-- droppen und neu erstellen.
drop view if exists deals_overdue;
drop view if exists deals_with_status;

create view deals_with_status with (security_invoker = on) as
select
  d.*,
  b.paid_sum,
  b.open_sum,
  b.overdue_sum,
  b.has_overdue,
  case
    when d.inkasso_required
      or exists (select 1 from inkasso_cases ic where ic.deal_id = d.id and ic.status in ('sent','in_recovery'))
      then 'in_collection'
    when coalesce(d.storniert, false) or coalesce(d.chargeback, false) then 'cancelled'
    when b.open_sum = 0 then 'paid'
    when b.has_overdue then 'overdue'
    else 'open'
  end as computed_status
from deals d
left join deal_balance b on b.deal_id = d.id;

create view deals_overdue with (security_invoker = on) as
select * from deals_with_status
where computed_status in ('overdue', 'in_collection');
