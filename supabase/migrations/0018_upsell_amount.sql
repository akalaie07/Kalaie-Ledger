-- =============================================================================
-- Migration 0018: Upsell-Betrag in den Umsatz einrechnen
--
-- Ein Deal kann zusätzlich zum Hauptprodukt einen Upsell tragen (bisheriges
-- Produkt + bereits/künftig bezahlter Betrag). Dieser Betrag soll in den
-- Gesamtumsatz (Soll) und – falls bezahlt – in den Ist-Umsatz einfließen.
--
-- Neue Spalten (zusätzlich zu is_upsell/upsell_order_id aus 0017):
--   upsell_product_id : zusätzliches/bisheriges Produkt (Referenz)
--   upsell_amount     : Betrag des Upsells
--   upsell_paid       : true = bereits bezahlt → Ist-Umsatz, false = offen
-- =============================================================================

alter table deals add column if not exists upsell_product_id uuid references products(id) on delete set null;
alter table deals add column if not exists upsell_amount numeric(12,2);
alter table deals add column if not exists upsell_paid boolean not null default false;

-- deal_balance neu: Upsell-Betrag wird zu paid_sum (bezahlt) bzw. open_sum
-- (offen) addiert. Stornierte/zurückgebuchte Deals bleiben bei 0.
create or replace view deal_balance with (security_invoker = on) as
select
  d.id            as deal_id,
  d.organization_id,
  case
    when coalesce(d.storniert, false) or coalesce(d.chargeback, false) then 0
    else
      (case
        when d.payment_type = 'installments' then
          coalesce(d.down_payment, 0) +
          coalesce((select sum(amount) from installments where deal_id = d.id and paid), 0)
        when d.payment_type in ('subscription_monthly', 'subscription_yearly') then
          coalesce(
            case when exists (select 1 from one_time_payments where deal_id = d.id and paid)
              then d.total_price else 0 end, 0
          ) +
          coalesce((select sum(amount) from subscription_payments where deal_id = d.id and paid), 0)
        when exists (select 1 from one_time_payments where deal_id = d.id and paid) then d.total_price
        else coalesce(d.down_payment, 0)
      end)
      + case when coalesce(d.is_upsell, false) and coalesce(d.upsell_paid, false)
          then coalesce(d.upsell_amount, 0) else 0 end
  end as paid_sum,
  case
    when coalesce(d.storniert, false) or coalesce(d.chargeback, false) then 0
    else
      (case
        when d.payment_type = 'installments' then
          coalesce((select sum(amount) from installments where deal_id = d.id and not paid), 0)
        when d.payment_type in ('subscription_monthly', 'subscription_yearly') then
          coalesce(
            case when not exists (select 1 from one_time_payments where deal_id = d.id and paid)
              then d.total_price else 0 end, 0
          ) +
          coalesce((select sum(amount) from subscription_payments where deal_id = d.id and not paid), 0)
        when exists (select 1 from one_time_payments where deal_id = d.id and paid) then 0
        else d.total_price - coalesce(d.down_payment, 0)
      end)
      + case when coalesce(d.is_upsell, false) and not coalesce(d.upsell_paid, false)
          then coalesce(d.upsell_amount, 0) else 0 end
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
