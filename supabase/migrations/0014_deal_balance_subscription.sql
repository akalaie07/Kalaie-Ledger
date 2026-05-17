-- Fix deal_balance view: include subscription_payments for Abo deals
-- Previously only total_price (registration fee) was counted, ignoring recurring payments

create or replace view deal_balance with (security_invoker = on) as
select
  d.id            as deal_id,
  d.organization_id,
  case
    when d.payment_type = 'installments' then
      coalesce((select sum(amount) from installments where deal_id = d.id and paid), 0)
    when d.payment_type in ('subscription_monthly', 'subscription_yearly') then
      -- Anmeldegebühr (falls bezahlt) + alle bezahlten Abo-Zahlungen
      coalesce(
        case when exists (select 1 from one_time_payments where deal_id = d.id and paid)
          then d.total_price else 0 end, 0
      ) +
      coalesce((select sum(amount) from subscription_payments where deal_id = d.id and paid), 0)
    when exists (select 1 from one_time_payments where deal_id = d.id and paid) then d.total_price
    else 0
  end as paid_sum,
  case
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
    else d.total_price
  end as open_sum,
  case
    when d.payment_type = 'installments' then
      coalesce((select sum(amount) from installments where deal_id = d.id and not paid and due_date < current_date), 0)
    when d.payment_type in ('subscription_monthly', 'subscription_yearly') then
      coalesce((select sum(amount) from subscription_payments where deal_id = d.id and not paid and due_date < current_date), 0)
    else 0
  end as overdue_sum,
  case
    when d.payment_type = 'installments' then
      exists (select 1 from installments where deal_id = d.id and not paid and due_date < current_date)
    when d.payment_type in ('subscription_monthly', 'subscription_yearly') then
      exists (select 1 from subscription_payments where deal_id = d.id and not paid and due_date < current_date)
    else false
  end as has_overdue
from deals d;
