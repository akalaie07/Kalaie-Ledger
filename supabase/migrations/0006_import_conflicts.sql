-- =============================================================================
-- Import Conflicts
--
-- Zeilen aus Zahlungsabgleich-Importen, die nicht automatisch zugeordnet
-- werden konnten, werden hier gespeichert und können in der App geklärt werden.
-- =============================================================================

-- import_batches: 'partial' Status + conflicts_count
alter table import_batches
  drop constraint if exists import_batches_status_check;

alter table import_batches
  add constraint import_batches_status_check
  check (status in ('pending', 'partial', 'completed', 'failed', 'rolled_back'));

alter table import_batches
  add column if not exists conflicts_count int not null default 0;

-- =============================================================================
-- import_conflicts
-- =============================================================================
create table import_conflicts (
  id               uuid         primary key default uuid_generate_v4(),
  organization_id  uuid         not null references organizations(id) on delete cascade,
  batch_id         uuid         not null references import_batches(id) on delete cascade,
  row_number       int,
  synthetic_key    text         not null,
  normalized       jsonb        not null,
  action           text         not null,
  reason           text,
  suggested_deals  jsonb        not null default '[]',
  status           text         not null default 'pending'
                                check (status in ('pending', 'resolved', 'skipped')),
  resolved_deal_id uuid         references deals(id) on delete set null,
  resolved_by      uuid         references profiles(id) on delete set null,
  resolved_at      timestamptz,
  created_at       timestamptz  not null default now()
);

create index import_conflicts_org_idx    on import_conflicts(organization_id, created_at desc);
create index import_conflicts_batch_idx  on import_conflicts(batch_id);
create index import_conflicts_status_idx on import_conflicts(organization_id, status)
  where status = 'pending';

-- =============================================================================
-- RLS
-- =============================================================================
alter table import_conflicts enable row level security;
alter table import_conflicts force row level security;

create policy import_conflicts_admin_only
  on import_conflicts for all
  using  (organization_id = auth_org_id() and auth_is_admin())
  with check (organization_id = auth_org_id() and auth_is_admin());
