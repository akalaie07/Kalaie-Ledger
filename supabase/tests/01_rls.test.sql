-- =============================================================================
-- RLS Test Suite — supabase/tests/01_rls.test.sql
--
-- Run with: supabase test db
--
-- Coverage:
--   • Organization isolation (no cross-org reads)
--   • Profile visibility and write restrictions
--   • Platform / product admin-only writes
--   • Deal visibility by role (admin / closer / sales_partner)
--   • Deal write restrictions per role
--   • Cross-org FK rejection via BEFORE triggers
--   • Inkasso admin-only access
--   • Audit log admin-only access
--   • Invite admin-only management
--   • Role-escalation protection
--   • handle_new_user invite validation
-- =============================================================================

begin;

select plan(33);

-- =============================================================================
-- Fixtures (postgres superuser — bypasses RLS and FK constraints)
-- =============================================================================

set session_replication_role = replica;

-- Organizations
insert into public.organizations (id, name, slug, settings) values
  ('0a0a0a0a-0000-0000-0000-000000000000', 'Org A', 'org-a', '{}'),
  ('0b0b0b0b-0000-0000-0000-000000000000', 'Org B', 'org-b', '{}');

-- Profiles (profiles.id → auth.users(id) FK disabled in replica mode)
insert into public.profiles (id, organization_id, email, full_name, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '0a0a0a0a-0000-0000-0000-000000000000', 'admin_a@test',   'Admin A',   'admin'),
  ('aaaaaaaa-0000-0000-0000-000000000002', '0a0a0a0a-0000-0000-0000-000000000000', 'closer_a@test',  'Closer A',  'closer'),
  ('aaaaaaaa-0000-0000-0000-000000000003', '0a0a0a0a-0000-0000-0000-000000000000', 'partner_a@test', 'Partner A', 'sales_partner'),
  ('bbbbbbbb-0000-0000-0000-000000000001', '0b0b0b0b-0000-0000-0000-000000000000', 'admin_b@test',   'Admin B',   'admin'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '0b0b0b0b-0000-0000-0000-000000000000', 'closer_b@test',  'Closer B',  'closer');

-- Platforms
insert into public.platforms (id, organization_id, name) values
  ('a0000001-0000-0000-0000-000000000000', '0a0a0a0a-0000-0000-0000-000000000000', 'Plattform-A'),
  ('b0000001-0000-0000-0000-000000000000', '0b0b0b0b-0000-0000-0000-000000000000', 'Plattform-B');

-- Products
insert into public.products (id, organization_id, name, default_price) values
  ('a0000002-0000-0000-0000-000000000000', '0a0a0a0a-0000-0000-0000-000000000000', 'Produkt A', 997.00),
  ('b0000002-0000-0000-0000-000000000000', '0b0b0b0b-0000-0000-0000-000000000000', 'Produkt B', 1497.00);

-- Closer records
insert into public.closers (id, organization_id, profile_id, name, commission_rate) values
  ('a0000003-0000-0000-0000-000000000000', '0a0a0a0a-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000002', 'Closer A', 0.10),
  ('b0000003-0000-0000-0000-000000000000', '0b0b0b0b-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000002', 'Closer B', 0.10);

-- Sales partner record
insert into public.sales_partners (id, organization_id, profile_id, name, commission_rate) values
  ('a0000004-0000-0000-0000-000000000000', '0a0a0a0a-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000003', 'Partner A', 0.05);

-- Deals
--   deal_a1: org A, closer_a, partner_a
--   deal_a2: org A, closer_a, no partner
--   deal_a3: org A, no closer (admin deal)
--   deal_b1: org B, closer_b
insert into public.deals (id, organization_id, customer_name, platform_id, product_id,
                          closer_id, sales_partner_id, total_price, payment_type, close_date) values
  ('a1000001-0000-0000-0000-000000000000', '0a0a0a0a-0000-0000-0000-000000000000',
   'Kunde 1', 'a0000001-0000-0000-0000-000000000000', 'a0000002-0000-0000-0000-000000000000',
   'a0000003-0000-0000-0000-000000000000', 'a0000004-0000-0000-0000-000000000000',
   997.00, 'one_time', '2025-01-01'),
  ('a1000002-0000-0000-0000-000000000000', '0a0a0a0a-0000-0000-0000-000000000000',
   'Kunde 2', 'a0000001-0000-0000-0000-000000000000', 'a0000002-0000-0000-0000-000000000000',
   'a0000003-0000-0000-0000-000000000000', null,
   997.00, 'one_time', '2025-01-02'),
  ('a1000003-0000-0000-0000-000000000000', '0a0a0a0a-0000-0000-0000-000000000000',
   'Kunde 3', null, null, null, null,
   500.00, 'one_time', '2025-01-03'),
  ('b1000001-0000-0000-0000-000000000000', '0b0b0b0b-0000-0000-0000-000000000000',
   'Kunde B', 'b0000001-0000-0000-0000-000000000000', 'b0000002-0000-0000-0000-000000000000',
   'b0000003-0000-0000-0000-000000000000', null,
   1497.00, 'one_time', '2025-01-01');

-- Inkasso case (for deal_a1)
insert into public.inkasso_cases (id, organization_id, deal_id, status) values
  ('a2000001-0000-0000-0000-000000000000', '0a0a0a0a-0000-0000-0000-000000000000',
   'a1000001-0000-0000-0000-000000000000', 'sent');

-- Open invite (for invite-validation tests)
insert into public.organization_invites (id, organization_id, email, role, token, expires_at) values
  ('a3000001-0000-0000-0000-000000000000', '0a0a0a0a-0000-0000-0000-000000000000',
   'newuser@test', 'closer', 'validtoken123', now() + interval '7 days');

set session_replication_role = default;

-- =============================================================================
-- Helpers
-- =============================================================================

-- set_auth: set JWT claims + authenticated role for a test block
create or replace function tests.as_user(user_id uuid) returns void
language plpgsql as $$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', user_id::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
end;
$$;

create or replace function tests.as_service() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  reset role;
end;
$$;

-- =============================================================================
-- 1. Organization isolation
-- =============================================================================

select tests.as_user('aaaaaaaa-0000-0000-0000-000000000001'); -- admin_a

select is(
  (select count(*)::int from public.organizations),
  1,
  '1. admin_a sieht genau 1 Organisation'
);

select is(
  (select id from public.organizations),
  '0a0a0a0a-0000-0000-0000-000000000000'::uuid,
  '2. admin_a sieht nur Org A, nicht Org B'
);

select tests.as_service();

select tests.as_user('bbbbbbbb-0000-0000-0000-000000000001'); -- admin_b

select is(
  (select id from public.organizations),
  '0b0b0b0b-0000-0000-0000-000000000000'::uuid,
  '3. admin_b sieht nur Org B'
);

select tests.as_service();

-- =============================================================================
-- 2. Profiles
-- =============================================================================

select tests.as_user('aaaaaaaa-0000-0000-0000-000000000001'); -- admin_a

select is(
  (select count(*)::int from public.profiles),
  3,
  '4. admin_a sieht 3 Profile (nur Org A)'
);

select is(
  (select count(*)::int from public.profiles
   where id = 'bbbbbbbb-0000-0000-0000-000000000001'),
  0,
  '5. admin_a kann admin_b-Profil nicht sehen'
);

select tests.as_service();

select tests.as_user('aaaaaaaa-0000-0000-0000-000000000002'); -- closer_a

select lives_ok(
  $$ update public.profiles
     set full_name = 'Closer A Updated'
     where id = 'aaaaaaaa-0000-0000-0000-000000000002' $$,
  '6. closer_a kann eigenen full_name aktualisieren'
);

-- =============================================================================
-- 3. Role-escalation guard
-- =============================================================================

select throws_like(
  $$ update public.profiles
     set role = 'admin'
     where id = 'aaaaaaaa-0000-0000-0000-000000000002' $$,
  '%permission_denied%',
  '7. closer_a kann eigene Rolle nicht auf admin hochsetzen'
);

select tests.as_service();

-- Admin kann Rolle eines anderen Users ändern
select tests.as_user('aaaaaaaa-0000-0000-0000-000000000001'); -- admin_a

select lives_ok(
  $$ update public.profiles
     set role = 'admin'
     where id = 'aaaaaaaa-0000-0000-0000-000000000002' $$,
  '8. admin_a kann Rolle anderer User ändern'
);

-- Reset closer_a back to closer
update public.profiles set role = 'closer'
where id = 'aaaaaaaa-0000-0000-0000-000000000002';

select tests.as_service();

-- =============================================================================
-- 4. Platforms
-- =============================================================================

select tests.as_user('aaaaaaaa-0000-0000-0000-000000000001'); -- admin_a

select is(
  (select count(*)::int from public.platforms),
  1,
  '9. admin_a sieht nur Plattformen von Org A'
);

select lives_ok(
  $$ insert into public.platforms (organization_id, name)
     values ('0a0a0a0a-0000-0000-0000-000000000000', 'Neue Plattform') $$,
  '10. admin_a kann Plattform anlegen'
);

select tests.as_service();

select tests.as_user('aaaaaaaa-0000-0000-0000-000000000002'); -- closer_a

select is(
  (select count(*)::int from public.platforms),
  2, -- Plattform-A + Neue Plattform
  '11. closer_a sieht Plattformen der eigenen Org'
);

select throws_like(
  $$ insert into public.platforms (organization_id, name)
     values ('0a0a0a0a-0000-0000-0000-000000000000', 'Hack') $$,
  '%',
  '12. closer_a kann keine Plattform anlegen'
);

select tests.as_service();

-- =============================================================================
-- 5. Deals — Sichtbarkeit nach Rolle
-- =============================================================================

select tests.as_user('aaaaaaaa-0000-0000-0000-000000000001'); -- admin_a

select is(
  (select count(*)::int from public.deals),
  3,
  '13. admin_a sieht alle 3 Deals von Org A'
);

select tests.as_service();

select tests.as_user('aaaaaaaa-0000-0000-0000-000000000002'); -- closer_a

select is(
  (select count(*)::int from public.deals),
  2,
  '14. closer_a sieht nur eigene 2 Deals'
);

select tests.as_service();

select tests.as_user('aaaaaaaa-0000-0000-0000-000000000003'); -- partner_a

select is(
  (select count(*)::int from public.deals),
  1,
  '15. partner_a sieht nur Deals, bei denen er Partner ist (1)'
);

select tests.as_service();

select tests.as_user('bbbbbbbb-0000-0000-0000-000000000001'); -- admin_b

select is(
  (select count(*)::int from public.deals),
  1,
  '16. admin_b sieht nur den 1 Deal von Org B'
);

select is(
  (select count(*)::int from public.deals
   where organization_id = '0a0a0a0a-0000-0000-0000-000000000000'),
  0,
  '17. admin_b kann keine Org-A-Deals sehen'
);

select tests.as_service();

-- =============================================================================
-- 6. Deals — Schreibrechte
-- =============================================================================

select tests.as_user('aaaaaaaa-0000-0000-0000-000000000002'); -- closer_a

select lives_ok(
  $$ insert into public.deals
       (organization_id, customer_name, total_price, payment_type, close_date, closer_id)
     values
       ('0a0a0a0a-0000-0000-0000-000000000000', 'Neukunde',
        100, 'one_time', '2025-02-01', 'a0000003-0000-0000-0000-000000000000') $$,
  '18. closer_a kann Deal mit eigenem closer_id anlegen'
);

select throws_like(
  $$ insert into public.deals
       (organization_id, customer_name, total_price, payment_type, close_date, closer_id)
     values
       ('0a0a0a0a-0000-0000-0000-000000000000', 'Hack',
        100, 'one_time', '2025-02-01', 'b0000003-0000-0000-0000-000000000000') $$,
  '%',
  '19. closer_a kann keinen Deal mit fremdem closer_id anlegen'
);

-- closer_a versucht einen Deal zu löschen — wird still blockiert (keine DELETE-Policy)
delete from public.deals where id = 'a1000001-0000-0000-0000-000000000000';

select is(
  (select count(*)::int from public.deals
   where id = 'a1000001-0000-0000-0000-000000000000'),
  1,
  '20. closer_a kann keinen Deal löschen (Deal existiert noch)'
);

select tests.as_service();

select tests.as_user('aaaaaaaa-0000-0000-0000-000000000001'); -- admin_a

select lives_ok(
  $$ delete from public.deals where id = 'a1000003-0000-0000-0000-000000000000' $$,
  '21. admin_a kann Deal löschen'
);

select tests.as_service();

-- =============================================================================
-- 7. Cross-org trigger protection
-- =============================================================================

select tests.as_user('aaaaaaaa-0000-0000-0000-000000000001'); -- admin_a

select throws_like(
  $$ insert into public.deals
       (organization_id, customer_name, total_price, payment_type, close_date, platform_id)
     values
       ('0a0a0a0a-0000-0000-0000-000000000000', 'Testfall',
        100, 'one_time', '2025-02-01', 'b0000001-0000-0000-0000-000000000000') $$,
  '%cross_org_reference%',
  '22. Deal mit Plattform aus fremder Org wird durch Trigger abgelehnt'
);

select tests.as_service();

-- =============================================================================
-- 8. Inkasso — nur Admin
-- =============================================================================

select tests.as_user('aaaaaaaa-0000-0000-0000-000000000002'); -- closer_a

select is(
  (select count(*)::int from public.inkasso_cases),
  0,
  '23. closer_a sieht 0 Inkasso-Fälle (nur Admin sichtbar)'
);

select throws_like(
  $$ insert into public.inkasso_cases (organization_id, deal_id, status)
     values ('0a0a0a0a-0000-0000-0000-000000000000',
             'a1000002-0000-0000-0000-000000000000', 'sent') $$,
  '%',
  '24. closer_a kann keinen Inkasso-Fall anlegen'
);

select tests.as_service();

select tests.as_user('aaaaaaaa-0000-0000-0000-000000000001'); -- admin_a

select is(
  (select count(*)::int from public.inkasso_cases),
  1,
  '25. admin_a sieht den Inkasso-Fall'
);

select tests.as_service();

-- =============================================================================
-- 9. Audit log — nur Admin lesen, niemand direkt schreiben
-- =============================================================================

select tests.as_user('aaaaaaaa-0000-0000-0000-000000000001'); -- admin_a

select ok(
  (select count(*)::int from public.audit_log) >= 0,
  '26. admin_a kann audit_log abfragen (kein Berechtigungsfehler)'
);

select tests.as_service();

select tests.as_user('aaaaaaaa-0000-0000-0000-000000000002'); -- closer_a

select is(
  (select count(*)::int from public.audit_log),
  0,
  '27. closer_a sieht 0 Audit-Log-Einträge'
);

select throws_like(
  $$ insert into public.audit_log (organization_id, table_name, row_id, action)
     values ('0a0a0a0a-0000-0000-0000-000000000000',
             'deals', 'a1000001-0000-0000-0000-000000000000', 'insert') $$,
  '%',
  '28. closer_a kann nicht direkt in audit_log schreiben'
);

select tests.as_service();

-- =============================================================================
-- 10. Organization invites — nur Admin
-- =============================================================================

select tests.as_user('aaaaaaaa-0000-0000-0000-000000000002'); -- closer_a

select is(
  (select count(*)::int from public.organization_invites),
  0,
  '29. closer_a sieht keine Einladungen'
);

select throws_like(
  $$ insert into public.organization_invites (organization_id, email, role, token)
     values ('0a0a0a0a-0000-0000-0000-000000000000',
             'hack@test', 'admin', 'hacktoken') $$,
  '%',
  '30. closer_a kann keine Einladung erstellen'
);

select tests.as_service();

select tests.as_user('aaaaaaaa-0000-0000-0000-000000000001'); -- admin_a

select is(
  (select count(*)::int from public.organization_invites),
  1,
  '31. admin_a sieht die offene Einladung'
);

select tests.as_service();

-- =============================================================================
-- 11. handle_new_user invite validation
--
-- These tests insert into auth.users which fires the on_auth_user_created trigger.
-- session_replication_role is set back to default so triggers are active.
-- =============================================================================

-- Test 32: valid invite → profile created with role from invite record
do $$
begin
  insert into auth.users (
    id, instance_id, aud, role, email,
    encrypted_password, raw_user_meta_data, raw_app_meta_data,
    created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new
  ) values (
    'cc000001-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'newuser@test',
    '', '{"invited_organization_id":"0a0a0a0a-0000-0000-0000-000000000000"}'::jsonb, '{}',
    now(), now(),
    '', '', '', ''
  );
end$$;

select is(
  (select role::text from public.profiles
   where id = 'cc000001-0000-0000-0000-000000000000'),
  'closer',
  '32. gültiger Invite: neuer User erhält Rolle aus Invite-Datensatz (closer)'
);

-- Test 33: invalid invite (email not in invites) → exception
select throws_like(
  $$ insert into auth.users (
       id, instance_id, aud, role, email,
       encrypted_password, raw_user_meta_data, raw_app_meta_data,
       created_at, updated_at,
       confirmation_token, recovery_token, email_change, email_change_token_new
     ) values (
       'dd000001-0000-0000-0000-000000000000',
       '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', 'noinvite@test',
       '', '{"invited_organization_id":"0a0a0a0a-0000-0000-0000-000000000000"}'::jsonb, '{}',
       now(), now(),
       '', '', '', ''
     ) $$,
  '%invalid_invite%',
  '33. Signup ohne gültigen Invite wird abgelehnt'
);

-- =============================================================================
-- Finish
-- =============================================================================

select * from finish();
rollback;
