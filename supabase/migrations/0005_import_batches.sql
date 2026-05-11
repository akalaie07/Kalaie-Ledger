-- =============================================================================
-- Import Batch Tracking
--
-- Jeder executeImport()-Aufruf erzeugt einen import_batches-Eintrag.
-- Jede verarbeitete PreviewItem-Zeile wird in import_rows festgehalten.
-- deals und installments erhalten import_batch_id, um den Ursprung zu kennen.
-- =============================================================================

-- =============================================================================
-- 1. import_batches
-- =============================================================================
create table import_batches (
  id               uuid         primary key default uuid_generate_v4(),
  organization_id  uuid         not null references organizations(id) on delete cascade,
  created_by       uuid         references profiles(id) on delete set null,
  source           text         not null,
  filename         text,
  row_count        int          not null default 0,
  created_count    int          not null default 0,
  paid_count       int          not null default 0,
  skipped_count    int          not null default 0,
  review_count     int          not null default 0,
  error_count      int          not null default 0,
  status           text         not null default 'pending'
                                check (status in ('pending', 'completed', 'failed', 'rolled_back')),
  created_at       timestamptz  not null default now()
);

create index import_batches_org_idx on import_batches(organization_id, created_at desc);

-- =============================================================================
-- 2. import_rows
-- =============================================================================
create table import_rows (
  id               uuid         primary key default uuid_generate_v4(),
  batch_id         uuid         not null references import_batches(id) on delete cascade,
  organization_id  uuid         not null references organizations(id) on delete cascade,
  row_number       int          not null,
  synthetic_key    text         not null,
  action           text         not null,
  classification   text         not null,
  deal_id          uuid         references deals(id) on delete set null,
  installment_id   uuid         references installments(id) on delete set null,
  raw_data         jsonb,
  created_at       timestamptz  not null default now()
);

create index import_rows_batch_idx on import_rows(batch_id);
create index import_rows_org_idx   on import_rows(organization_id, created_at desc);
create index import_rows_deal_idx  on import_rows(deal_id) where deal_id is not null;

-- =============================================================================
-- 3. import_batch_id auf deals und installments
-- =============================================================================
alter table deals
  add column if not exists import_batch_id uuid
  references import_batches(id) on delete set null;

create index deals_import_batch_idx
  on deals(import_batch_id)
  where import_batch_id is not null;

alter table installments
  add column if not exists import_batch_id uuid
  references import_batches(id) on delete set null;

create index installments_import_batch_idx
  on installments(import_batch_id)
  where import_batch_id is not null;

-- =============================================================================
-- 4. RLS
-- =============================================================================
alter table import_batches enable row level security;
alter table import_batches force row level security;

create policy import_batches_admin_only
  on import_batches for all
  using  (organization_id = auth_org_id() and auth_is_admin())
  with check (organization_id = auth_org_id() and auth_is_admin());

alter table import_rows enable row level security;
alter table import_rows force row level security;

create policy import_rows_admin_only
  on import_rows for all
  using  (organization_id = auth_org_id() and auth_is_admin())
  with check (organization_id = auth_org_id() and auth_is_admin());
