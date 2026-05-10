-- Produktart: Standard (Einmalkauf) oder Abo (monatlich/jährlich)
alter table products
  add column if not exists product_type text not null default 'standard'
  check (product_type in ('standard', 'subscription_monthly', 'subscription_yearly'));
