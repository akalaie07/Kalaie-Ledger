-- =============================================================================
-- Super-Admin: is_super_admin Flag für den Plattform-Gründer
-- =============================================================================

alter table profiles
  add column if not exists is_super_admin boolean not null default false;

-- RLS: Super-Admins können alle Organisationen lesen (für das Panel)
create policy "super_admin_read_all_orgs"
  on organizations for select
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.is_super_admin = true
    )
  );

-- RLS: Super-Admins können organizations.settings updaten (Feature-Flags)
create policy "super_admin_update_org_settings"
  on organizations for update
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.is_super_admin = true
    )
  )
  with check (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.is_super_admin = true
    )
  );

-- Super-Admins können alle Profile lesen (für die Org-Übersicht mit User-Anzahl)
create policy "super_admin_read_all_profiles"
  on profiles for select
  using (
    auth.uid() = id
    or exists (
      select 1 from profiles p2
      where p2.id = auth.uid()
        and p2.is_super_admin = true
    )
  );
