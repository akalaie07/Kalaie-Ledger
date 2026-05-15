-- Migration: Rückbuchung (chargeback) Flag für Deals
-- Markiert Deals bei denen der Kunde das Geld zurückgebucht / storniert hat.

alter table deals
  add column if not exists chargeback boolean not null default false;

comment on column deals.chargeback is
  'Rückbuchung: Kunde hat bezahlt, Zahlung wurde jedoch zurückgebucht oder storniert.';
