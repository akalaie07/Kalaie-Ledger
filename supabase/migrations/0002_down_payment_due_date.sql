-- =============================================================================
-- Migration 0002: Anzahlung + Fälligkeitsdatum für Einmalzahlungen
-- =============================================================================

-- Anzahlung auf deals
alter table deals
  add column if not exists down_payment numeric(12,2);

-- Fälligkeitsdatum auf one_time_payments
alter table one_time_payments
  add column if not exists due_date date;

-- =============================================================================
-- deal_balance neu: berücksichtigt down_payment und one_time due_date
-- =============================================================================
create or replace view deal_balance with (security_invoker = on) as
select
  d.id            as deal_id,
  d.organization_id,
  -- paid_sum: Anzahlung ist immer bezahlt; dazu Raten oder Restbetrag
  coalesce(d.down_payment, 0) +
  case
    when d.payment_type = 'installments' then
      coalesce((select sum(amount) from installments where deal_id = d.id and paid), 0)
    when exists (select 1 from one_time_payments where deal_id = d.id and paid) then
      d.total_price - coalesce(d.down_payment, 0)
    else 0
  end as paid_sum,
  -- open_sum: noch offener Betrag
  case
    when d.payment_type = 'installments' then
      coalesce((select sum(amount) from installments where deal_id = d.id and not paid), 0)
    when exists (select 1 from one_time_payments where deal_id = d.id and paid) then 0
    else d.total_price - coalesce(d.down_payment, 0)
  end as open_sum,
  -- overdue_sum: überfälliger Betrag
  case
    when d.payment_type = 'installments' then
      coalesce((select sum(amount) from installments
                where deal_id = d.id and not paid and due_date < current_date), 0)
    when d.payment_type = 'one_time' then
      case when exists (
        select 1 from one_time_payments otp
        where otp.deal_id = d.id
          and not otp.paid
          and otp.due_date is not null
          and otp.due_date < current_date
      ) then d.total_price - coalesce(d.down_payment, 0)
      else 0 end
    else 0
  end as overdue_sum,
  -- has_overdue: boolean
  case
    when d.payment_type = 'installments' then
      exists (select 1 from installments
              where deal_id = d.id and not paid and due_date < current_date)
    when d.payment_type = 'one_time' then
      exists (
        select 1 from one_time_payments otp
        where otp.deal_id = d.id
          and not otp.paid
          and otp.due_date is not null
          and otp.due_date < current_date
      )
    else false
  end as has_overdue
from deals d;
