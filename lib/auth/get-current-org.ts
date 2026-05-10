import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export type Role = "admin" | "closer" | "sales_partner";

export type CurrentSession = {
  userId: string;
  email: string;
  organizationId: string;
  organizationName: string;
  role: Role;
  fullName: string | null;
  features: string[];
  isSuperAdmin: boolean;
};

export const getCurrentSession = cache(async (): Promise<CurrentSession | null> => {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await (supabase as any)
    .from("profiles")
    .select("id, email, full_name, role, organization_id, is_super_admin, organizations(name, settings)")
    .eq("id", user.id)
    .maybeSingle() as { data: {
      id: string;
      email: string;
      full_name: string | null;
      role: string;
      organization_id: string;
      is_super_admin: boolean;
      organizations: { name: string; settings: { features?: string[] } } | { name: string; settings: { features?: string[] } }[] | null;
    } | null };

  if (!profile?.organization_id) return null;

  const orgData = Array.isArray(profile.organizations)
    ? profile.organizations[0]
    : profile.organizations;

  const orgName = orgData?.name ?? "";
  const features: string[] = orgData?.settings?.features ?? [];

  return {
    userId: user.id,
    email: profile.email,
    organizationId: profile.organization_id,
    organizationName: orgName,
    role: profile.role as Role,
    fullName: profile.full_name ?? null,
    features,
    isSuperAdmin: profile.is_super_admin ?? false,
  };
});

export async function requireSession(): Promise<CurrentSession> {
  const session = await getCurrentSession();
  if (!session) {
    // If the user has a valid Supabase auth token but no profile row (e.g.
    // the handle_new_user trigger failed on signup), staying on /login would
    // cause an infinite redirect: middleware sends authenticated users back to
    // /deals, which calls requireSession() again.  Sign them out first so
    // the middleware lets them through to /login cleanly.
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.auth.signOut();
      redirect("/login?error=setup_failed");
    }
    redirect("/login");
  }
  return session;
}

export async function requireRole(...allowed: Role[]): Promise<CurrentSession> {
  const session = await requireSession();
  if (!allowed.includes(session.role)) redirect("/");
  return session;
}
