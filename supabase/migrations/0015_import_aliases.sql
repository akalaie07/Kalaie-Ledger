-- =============================================================================
-- Import Aliases — Stammdaten-Gedächtnis für den Smart Import
--
-- Merkt sich Zuordnungen von Rohwerten aus Plattform-Exporten (z. B. Produktname
-- "Die Maestro Sales Masterclass - Gold") zu internen Stammdaten (z. B. Produkt
-- "MSM Gold"). Einmal in der Import-Vorschau bestätigt, lösen künftige Importe
-- denselben Rohwert automatisch auf — ohne erneutes Nachfragen.
-- =============================================================================
create table import_aliases (
  id               uuid        primary key default uuid_generate_v4(),
  organization_id  uuid        not null references organizations(id) on delete cascade,
  entity_type      text        not null check (entity_type in ('product', 'platform', 'closer')),
  raw_value        text        not null,
  target_id        uuid        not null,
  created_by       uuid        references profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Ein Alias pro (Org, Typ, Rohwert)
create unique index import_aliases_uk
  on import_aliases (organization_id, entity_type, raw_value);
create index import_aliases_lookup_idx
  on import_aliases (organization_id, entity_type);

-- updated_at-Trigger (set_updated_at() existiert seit Migration 0012)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE trigger_name = 'import_aliases_set_updated_at'
      AND event_object_table = 'import_aliases'
  ) THEN
    CREATE TRIGGER import_aliases_set_updated_at
      BEFORE UPDATE ON import_aliases
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END;
$$;

-- =============================================================================
-- RLS — lesen alle Org-Mitglieder, ändern nur Admins (wie products/platforms)
-- =============================================================================
alter table import_aliases enable row level security;

create policy import_aliases_select_org
  on import_aliases for select
  using (organization_id = auth_org_id());

create policy import_aliases_modify_admin
  on import_aliases for all
  using  (organization_id = auth_org_id() and auth_is_admin())
  with check (organization_id = auth_org_id() and auth_is_admin());
