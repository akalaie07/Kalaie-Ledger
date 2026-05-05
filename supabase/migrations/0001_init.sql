-- =============================================================================
-- Multi-Tenant Buchhaltungs- & Vertriebs-Tracking — Initial Migration
--
-- Grundregel: Jede fachliche Tabelle hat organization_id. RLS + Trigger
-- erzwingen, dass kein User Daten einer fremden Organisation sehen oder
-- ändern kann. Frontend-Filter sind KEIN Schutz; die Sicherheit liegt in
-- der Datenbank.
-- =============================================================================

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- =============================================================================
-- 1. Enums
-- =============================================================================
create type role_enum as enum ('admin', 'closer', 'sales_partner');
create type payment_type_enum as enum ('one_time', 'installments');
create type inkasso_status_enum as enum ('sent', 'in_recovery', 'recovered', 'written_off');

-- =============================================================================
-- 2. Tabellen
-- =============================================================================

create table organizations (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  slug text unique not null,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete restrict,
  email text not null,
  full_name text,
  role role_enum not null default 'closer',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_org_idx on profiles(organization_id);

create table organization_invites (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references organizations(id) on delete cascade,
  email text not null,
  role role_enum not null default 'closer',
  token text unique not null default encode(gen_random_bytes(32), 'hex'),
  expires_at timestamptz not null default (now() + interval '14 days'),
  accepted_at timestamptz,
  invited_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(organization_id, email)
);
create index organization_invites_org_idx on organization_invites(organization_id);
create index organization_invites_email_idx on organization_invites(email);

create table platforms (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id, name)
);
create index platforms_org_idx on platforms(organization_id);

create table products (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  default_price numeric(12,2),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id, name)
);
create index products_org_idx on products(organization_id);

create table closers (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references organizations(id) on delete cascade,
  profile_id uuid references profiles(id) on delete set null,
  name text not null,
  commission_rate numeric(5,4) not null default 0 check (commission_rate >= 0 and commission_rate <= 1),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id, name)
);
create index closers_org_idx on closers(organization_id);
create index closers_profile_idx on closers(profile_id);

create table sales_partners (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references organizations(id) on delete cascade,
  profile_id uuid references profiles(id) on delete set null,
  name text not null,
  commission_rate numeric(5,4) not null default 0 check (commission_rate >= 0 and commission_rate <= 1),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id, name)
);
create index sales_partners_org_idx on sales_partners(organization_id);
create index sales_partners_profile_idx on sales_partners(profile_id);

create table deals (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references organizations(id) on delete cascade,
  customer_name text not null,
  platform_id uuid references platforms(id) on delete restrict,
  payment_method text,
  product_id uuid references products(id) on delete restrict,
  order_id text,
  sales_partner_id uuid references sales_partners(id) on delete set null,
  closer_id uuid references closers(id) on delete set null,
  total_price numeric(12,2) not null check (total_price >= 0),
  payment_type payment_type_enum not null default 'one_time',
  close_date date not null,
  inkasso_required boolean not null default false,
  onboarding_done boolean not null default false,
  update_call_done boolean not null default false,
  notes text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index deals_order_per_org_uk on deals(organization_id, order_id) where order_id is not null;
create index deals_org_close_idx on deals(organization_id, close_date);
create index deals_org_closer_idx on deals(organization_id, closer_id);
create index deals_org_partner_idx on deals(organization_id, sales_partner_id);
create index deals_customer_idx on deals(organization_id, customer_name);

create table installments (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references organizations(id) on delete cascade,
  deal_id uuid not null references deals(id) on delete cascade,
  sequence int not null check (sequence > 0),
  due_date date not null,
  amount numeric(12,2) not null check (amount >= 0),
  paid boolean not null default false,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(deal_id, sequence)
);
create index installments_org_due_idx on installments(organization_id, due_date);
create index installments_deal_paid_idx on installments(deal_id, paid);

create table one_time_payments (
  deal_id uuid primary key references deals(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  paid boolean not null default false,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index one_time_payments_org_idx on one_time_payments(organization_id);

create table inkasso_cases (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references organizations(id) on delete cascade,
  deal_id uuid not null references deals(id) on delete cascade,
  sent_to_inkasso_at timestamptz not null default now(),
  agency text,
  status inkasso_status_enum not null default 'sent',
  recovered_amount numeric(12,2),
  closed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index inkasso_cases_org_idx on inkasso_cases(organization_id);
create index inkasso_cases_deal_idx on inkasso_cases(deal_id);

create table audit_log (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references organizations(id) on delete cascade,
  table_name text not null,
  row_id uuid not null,
  action text not null,
  changed_by uuid,
  changed_at timestamptz not null default now(),
  diff jsonb
);
create index audit_log_org_idx on audit_log(organization_id, changed_at desc);

-- =============================================================================
-- 3. updated_at-Trigger
-- =============================================================================
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

do $$
declare t text;
begin
  for t in select unnest(array[
    'organizations','profiles','platforms','products','closers','sales_partners',
    'deals','installments','one_time_payments','inkasso_cases'
  ]) loop
    execute format(
      'create trigger %I_set_updated_at before update on %I for each row execute function set_updated_at()',
      t || '_uat', t
    );
  end loop;
end$$;

-- =============================================================================
-- 4. Cross-Tenant-Defense — Trigger spiegeln und prüfen organization_id
-- =============================================================================

-- Bei deals: alle FKs müssen zur selben organization_id gehören
create or replace function deals_check_org() returns trigger as $$
declare ref_org uuid;
begin
  if new.platform_id is not null then
    select organization_id into ref_org from platforms where id = new.platform_id;
    if ref_org is null or ref_org <> new.organization_id then
      raise exception 'cross_org_reference: platform_id %', new.platform_id;
    end if;
  end if;
  if new.product_id is not null then
    select organization_id into ref_org from products where id = new.product_id;
    if ref_org is null or ref_org <> new.organization_id then
      raise exception 'cross_org_reference: product_id %', new.product_id;
    end if;
  end if;
  if new.closer_id is not null then
    select organization_id into ref_org from closers where id = new.closer_id;
    if ref_org is null or ref_org <> new.organization_id then
      raise exception 'cross_org_reference: closer_id %', new.closer_id;
    end if;
  end if;
  if new.sales_partner_id is not null then
    select organization_id into ref_org from sales_partners where id = new.sales_partner_id;
    if ref_org is null or ref_org <> new.organization_id then
      raise exception 'cross_org_reference: sales_partner_id %', new.sales_partner_id;
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger deals_org_guard
  before insert or update on deals
  for each row execute function deals_check_org();

-- Bei installments / one_time_payments / inkasso_cases:
-- organization_id muss zur deal.organization_id passen.
create or replace function child_mirror_deal_org() returns trigger as $$
declare deal_org uuid;
begin
  select organization_id into deal_org from deals where id = new.deal_id;
  if deal_org is null then
    raise exception 'deal % not found', new.deal_id;
  end if;
  if new.organization_id is null then
    new.organization_id := deal_org;
  elsif new.organization_id <> deal_org then
    raise exception 'cross_org_reference: organization_id mismatch (deal=%, payload=%)', deal_org, new.organization_id;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger installments_org_guard
  before insert or update on installments
  for each row execute function child_mirror_deal_org();

create trigger one_time_payments_org_guard
  before insert or update on one_time_payments
  for each row execute function child_mirror_deal_org();

create trigger inkasso_cases_org_guard
  before insert or update on inkasso_cases
  for each row execute function child_mirror_deal_org();

-- closers/sales_partners: profile_id darf nur auf Profile derselben Org zeigen
create or replace function staff_check_profile_org() returns trigger as $$
declare prof_org uuid;
begin
  if new.profile_id is not null then
    select organization_id into prof_org from profiles where id = new.profile_id;
    if prof_org is null or prof_org <> new.organization_id then
      raise exception 'cross_org_reference: profile_id %', new.profile_id;
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger closers_profile_guard
  before insert or update on closers
  for each row execute function staff_check_profile_org();

create trigger sales_partners_profile_guard
  before insert or update on sales_partners
  for each row execute function staff_check_profile_org();

-- =============================================================================
-- 5. Auth-Helpers — werden von ALLEN RLS-Policies verwendet
-- =============================================================================
create or replace function public.auth_org_id() returns uuid
language sql stable security definer set search_path = public
as $$ select organization_id from public.profiles where id = auth.uid() $$;

create or replace function public.auth_role() returns text
language sql stable security definer set search_path = public
as $$ select role::text from public.profiles where id = auth.uid() $$;

create or replace function public.auth_is_admin() returns boolean
language sql stable security definer set search_path = public
as $$ select (select role from public.profiles where id = auth.uid()) = 'admin' $$;

create or replace function public.auth_closer_id() returns uuid
language sql stable security definer set search_path = public
as $$ select id from public.closers where profile_id = auth.uid() limit 1 $$;

create or replace function public.auth_partner_id() returns uuid
language sql stable security definer set search_path = public
as $$ select id from public.sales_partners where profile_id = auth.uid() limit 1 $$;

-- =============================================================================
-- 6. Profile-Auto-Insert beim Sign-Up
--
-- Liest user_metadata. Drei Modi:
--   - invited_organization_id gesetzt: User joint bestehender Org — Einladung
--     wird gegen organization_invites validiert (kein offener Join per Org-UUID).
--   - organization_name gesetzt: neue Org wird angelegt, User wird Admin.
--   - keines: Sign-up scheitert (sicher gegen "verloren gehende" User).
--
-- Wichtig: Die Rolle kommt IMMER aus dem Invite-Datensatz, nie aus den
-- user_metadata, damit der User seine eigene Rolle nicht selbst setzen kann.
-- =============================================================================
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  invited_org    uuid;
  org_id         uuid;
  org_name       text;
  user_full_name text;
  invite_rec     record;
begin
  invited_org    := nullif(new.raw_user_meta_data->>'invited_organization_id', '')::uuid;
  org_name       := nullif(new.raw_user_meta_data->>'organization_name', '');
  user_full_name := nullif(new.raw_user_meta_data->>'full_name', '');

  if invited_org is not null then
    -- Validate: non-expired, non-accepted invite for this exact email + org.
    -- Role comes from the invite record — never from user-supplied metadata.
    select * into invite_rec
    from public.organization_invites
    where organization_id = invited_org
      and lower(email) = lower(new.email)
      and accepted_at is null
      and expires_at > now()
    limit 1;

    if not found then
      raise exception 'invalid_invite: no valid invite for % in org %', new.email, invited_org;
    end if;

    insert into public.profiles (id, organization_id, email, full_name, role)
    values (new.id, invited_org, new.email, user_full_name, invite_rec.role);

    update public.organization_invites
    set accepted_at = now()
    where id = invite_rec.id;

  elsif org_name is not null then
    insert into public.organizations (name, slug)
    values (
      org_name,
      regexp_replace(lower(org_name), '[^a-z0-9]+', '-', 'g') || '-' || substr(replace(new.id::text, '-', ''), 1, 8)
    )
    returning id into org_id;
    insert into public.profiles (id, organization_id, email, full_name, role)
    values (new.id, org_id, new.email, user_full_name, 'admin');
  else
    raise exception 'signup_metadata_missing: either organization_name or invited_organization_id required';
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =============================================================================
-- 7. RLS aktivieren (force = auch für Owner)
-- =============================================================================
alter table organizations         enable row level security;
alter table organizations         force row level security;
alter table profiles              enable row level security;
alter table profiles              force row level security;
alter table organization_invites  enable row level security;
alter table organization_invites  force row level security;
alter table platforms             enable row level security;
alter table platforms             force row level security;
alter table products              enable row level security;
alter table products              force row level security;
alter table closers               enable row level security;
alter table closers               force row level security;
alter table sales_partners        enable row level security;
alter table sales_partners        force row level security;
alter table deals                 enable row level security;
alter table deals                 force row level security;
alter table installments          enable row level security;
alter table installments          force row level security;
alter table one_time_payments     enable row level security;
alter table one_time_payments     force row level security;
alter table inkasso_cases         enable row level security;
alter table inkasso_cases         force row level security;
alter table audit_log             enable row level security;
alter table audit_log             force row level security;

-- =============================================================================
-- 8. RLS-Policies
-- =============================================================================

-- organizations: User darf nur die eigene Org sehen; nur admin darf updaten.
create policy organizations_select_own
  on organizations for select
  using (id = auth_org_id());
create policy organizations_update_admin
  on organizations for update
  using (id = auth_org_id() and auth_is_admin())
  with check (id = auth_org_id() and auth_is_admin());
-- INSERT von Org passiert per Trigger handle_new_user mit security definer,
-- daher braucht es keine policy für anon → auth flow.

-- profiles: jeder darf das eigene Profil + andere derselben Org sehen.
-- Update/Delete nur Admin oder der User selbst (nur eigene Felder via app-logic).
create policy profiles_select_own_org
  on profiles for select
  using (organization_id = auth_org_id());
create policy profiles_update_admin_or_self
  on profiles for update
  using (
    organization_id = auth_org_id()
    and (auth_is_admin() or id = auth.uid())
  )
  with check (organization_id = auth_org_id());
create policy profiles_delete_admin
  on profiles for delete
  using (organization_id = auth_org_id() and auth_is_admin());

-- organization_invites: nur admin der eigenen Org darf alles
create policy invites_admin_only
  on organization_invites for all
  using (organization_id = auth_org_id() and auth_is_admin())
  with check (organization_id = auth_org_id() and auth_is_admin());

-- Lookup-Tabellen (platforms, products): SELECT für alle, INSERT/UPDATE/DELETE nur admin
create policy platforms_select_org
  on platforms for select
  using (organization_id = auth_org_id());
create policy platforms_modify_admin
  on platforms for all
  using (organization_id = auth_org_id() and auth_is_admin())
  with check (organization_id = auth_org_id() and auth_is_admin());

create policy products_select_org
  on products for select
  using (organization_id = auth_org_id());
create policy products_modify_admin
  on products for all
  using (organization_id = auth_org_id() and auth_is_admin())
  with check (organization_id = auth_org_id() and auth_is_admin());

-- closers / sales_partners: SELECT für alle (für Provisions-Berichte), INSERT/UPDATE/DELETE nur admin
create policy closers_select_org
  on closers for select
  using (organization_id = auth_org_id());
create policy closers_modify_admin
  on closers for all
  using (organization_id = auth_org_id() and auth_is_admin())
  with check (organization_id = auth_org_id() and auth_is_admin());

create policy sales_partners_select_org
  on sales_partners for select
  using (organization_id = auth_org_id());
create policy sales_partners_modify_admin
  on sales_partners for all
  using (organization_id = auth_org_id() and auth_is_admin())
  with check (organization_id = auth_org_id() and auth_is_admin());

-- deals: SELECT mit Rollen-Verfeinerung, INSERT/UPDATE/DELETE: admin überall, closer nur eigene
create policy deals_select_role_scoped
  on deals for select
  using (
    organization_id = auth_org_id()
    and (
      auth_is_admin()
      or (auth_role() = 'closer' and closer_id = auth_closer_id())
      or (auth_role() = 'sales_partner' and sales_partner_id = auth_partner_id())
    )
  );
create policy deals_insert_admin_or_closer
  on deals for insert
  with check (
    organization_id = auth_org_id()
    and (
      auth_is_admin()
      or (auth_role() = 'closer' and closer_id = auth_closer_id())
    )
  );
create policy deals_update_admin_or_owner
  on deals for update
  using (
    organization_id = auth_org_id()
    and (
      auth_is_admin()
      or (auth_role() = 'closer' and closer_id = auth_closer_id())
    )
  )
  with check (
    organization_id = auth_org_id()
    and (
      auth_is_admin()
      or (auth_role() = 'closer' and closer_id = auth_closer_id())
    )
  );
create policy deals_delete_admin
  on deals for delete
  using (organization_id = auth_org_id() and auth_is_admin());

-- installments: über deals_select_role_scoped via deal_id verfeinert
create policy installments_select_via_deal
  on installments for select
  using (
    organization_id = auth_org_id()
    and exists (
      select 1 from deals d
      where d.id = installments.deal_id
        and (
          auth_is_admin()
          or (auth_role() = 'closer' and d.closer_id = auth_closer_id())
          or (auth_role() = 'sales_partner' and d.sales_partner_id = auth_partner_id())
        )
    )
  );
create policy installments_modify_admin_or_owner
  on installments for all
  using (
    organization_id = auth_org_id()
    and exists (
      select 1 from deals d
      where d.id = installments.deal_id
        and (auth_is_admin() or (auth_role() = 'closer' and d.closer_id = auth_closer_id()))
    )
  )
  with check (
    organization_id = auth_org_id()
    and exists (
      select 1 from deals d
      where d.id = installments.deal_id
        and (auth_is_admin() or (auth_role() = 'closer' and d.closer_id = auth_closer_id()))
    )
  );

-- one_time_payments: dieselbe Logik wie installments
create policy one_time_payments_select_via_deal
  on one_time_payments for select
  using (
    organization_id = auth_org_id()
    and exists (
      select 1 from deals d
      where d.id = one_time_payments.deal_id
        and (
          auth_is_admin()
          or (auth_role() = 'closer' and d.closer_id = auth_closer_id())
          or (auth_role() = 'sales_partner' and d.sales_partner_id = auth_partner_id())
        )
    )
  );
create policy one_time_payments_modify_admin_or_owner
  on one_time_payments for all
  using (
    organization_id = auth_org_id()
    and exists (
      select 1 from deals d
      where d.id = one_time_payments.deal_id
        and (auth_is_admin() or (auth_role() = 'closer' and d.closer_id = auth_closer_id()))
    )
  )
  with check (
    organization_id = auth_org_id()
    and exists (
      select 1 from deals d
      where d.id = one_time_payments.deal_id
        and (auth_is_admin() or (auth_role() = 'closer' and d.closer_id = auth_closer_id()))
    )
  );

-- inkasso_cases: nur Admin (Inkasso ist Admin-Aufgabe)
create policy inkasso_cases_admin_only
  on inkasso_cases for all
  using (organization_id = auth_org_id() and auth_is_admin())
  with check (organization_id = auth_org_id() and auth_is_admin());

-- audit_log: nur lesen, nur Admin
create policy audit_log_select_admin
  on audit_log for select
  using (organization_id = auth_org_id() and auth_is_admin());

-- =============================================================================
-- 8b. Role-Escalation Guard
--
-- Verhindert, dass ein nicht-Admin seine eigene Rolle (oder die eines anderen)
-- auf eine privilegiertere Rolle hochsetzt. Superuser / service_role (bei denen
-- auth.uid() null ist) sind ausgenommen, damit Migrations-Skripte weiterhin
-- funktionieren.
-- =============================================================================
create or replace function public.profiles_guard_role_change() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.role = old.role then
    return new;
  end if;
  -- Superuser / service_role context: auth.uid() is null → allow
  if auth.uid() is null then
    return new;
  end if;
  if not (select role = 'admin' from public.profiles where id = auth.uid()) then
    raise exception 'permission_denied: only admin can change role assignment';
  end if;
  return new;
end;
$$;

create trigger profiles_role_escalation_guard
  before update on profiles
  for each row execute function public.profiles_guard_role_change();

-- =============================================================================
-- 9. Audit-Trigger (schreibt in audit_log)
-- =============================================================================
create or replace function audit_changes() returns trigger as $$
declare org uuid;
begin
  if tg_op = 'DELETE' then
    org := old.organization_id;
    insert into audit_log(organization_id, table_name, row_id, action, changed_by, diff)
    values (org, tg_table_name, old.id, 'delete', auth.uid(), to_jsonb(old));
    return old;
  end if;
  org := new.organization_id;
  if tg_op = 'INSERT' then
    insert into audit_log(organization_id, table_name, row_id, action, changed_by, diff)
    values (org, tg_table_name, new.id, 'insert', auth.uid(), to_jsonb(new));
  elsif tg_op = 'UPDATE' then
    insert into audit_log(organization_id, table_name, row_id, action, changed_by, diff)
    values (org, tg_table_name, new.id, 'update', auth.uid(),
            jsonb_build_object('before', to_jsonb(old), 'after', to_jsonb(new)));
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger deals_audit
  after insert or update or delete on deals
  for each row execute function audit_changes();
create trigger installments_audit
  after insert or update or delete on installments
  for each row execute function audit_changes();
create trigger inkasso_cases_audit
  after insert or update or delete on inkasso_cases
  for each row execute function audit_changes();

-- =============================================================================
-- 10. Views (security_invoker damit RLS der Basistabellen greift)
-- =============================================================================
create or replace view deal_balance with (security_invoker = on) as
select
  d.id            as deal_id,
  d.organization_id,
  case
    when d.payment_type = 'installments' then
      coalesce((select sum(amount) from installments where deal_id = d.id and paid), 0)
    when exists (select 1 from one_time_payments where deal_id = d.id and paid) then d.total_price
    else 0
  end as paid_sum,
  case
    when d.payment_type = 'installments' then
      coalesce((select sum(amount) from installments where deal_id = d.id and not paid), 0)
    when exists (select 1 from one_time_payments where deal_id = d.id and paid) then 0
    else d.total_price
  end as open_sum,
  case
    when d.payment_type = 'installments' then
      coalesce((select sum(amount) from installments where deal_id = d.id and not paid and due_date < current_date), 0)
    else 0
  end as overdue_sum,
  case
    when d.payment_type = 'installments' then
      exists (select 1 from installments where deal_id = d.id and not paid and due_date < current_date)
    else false
  end as has_overdue
from deals d;

create or replace view deals_with_status with (security_invoker = on) as
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
    when b.open_sum = 0 then 'paid'
    when b.has_overdue then 'overdue'
    else 'open'
  end as computed_status
from deals d
left join deal_balance b on b.deal_id = d.id;

create or replace view deals_overdue with (security_invoker = on) as
select * from deals_with_status
where computed_status in ('overdue', 'in_collection');

-- =============================================================================
-- 11. Default-Lookups für neue Organisationen
-- =============================================================================
create or replace function seed_org_defaults() returns trigger as $$
begin
  insert into platforms (organization_id, name) values
    (new.id, 'Copecart'),
    (new.id, 'Digistore'),
    (new.id, 'Ablefy');
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger organizations_seed_defaults
  after insert on organizations
  for each row execute function seed_org_defaults();
