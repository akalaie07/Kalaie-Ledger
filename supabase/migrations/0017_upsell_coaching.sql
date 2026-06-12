-- Upsell-Markierung + Begleitungs-Ablaufdatum
-- ---------------------------------------------------------------------------
-- is_upsell        : Deal hat einen Upsell (Folgekauf)
-- upsell_order_id  : Bestell-ID des Upsells (nur Referenz, kein eigener Deal)
-- coaching_until   : Datum, bis zu dem die Begleitung läuft
-- coaching_done    : Begleitung wurde bearbeitet/abgeschlossen → raus aus dem Ordner

alter table deals add column if not exists is_upsell boolean not null default false;
alter table deals add column if not exists upsell_order_id text;
alter table deals add column if not exists coaching_until date;
alter table deals add column if not exists coaching_done boolean not null default false;

-- Schneller Zugriff für den "Begleitung läuft aus"-Ordner
create index if not exists idx_deals_coaching
  on deals (organization_id, coaching_until)
  where coaching_until is not null and coaching_done = false;
