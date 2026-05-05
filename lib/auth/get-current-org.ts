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
};

export const getCurrentSession = cache(async (): Promise<CurrentSession | null> => {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, organization_id, organizations(name)")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.organization_id) return null;

  const orgName =
    Array.isArray(profile.organizations)
      ? profile.organizations[0]?.name
      : (profile.organizations as { name: string } | null)?.name;

  return {
    userId: user.id,
    email: profile.email as string,
    organizationId: profile.organization_id as string,
    organizationName: (orgName as string) ?? "",
    role: profile.role as Role,
    fullName: (profile.full_name as string | null) ?? null,
  };
});

export async function requireSession(): Promise<CurrentSession> {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  return session;
}

export async function requireRole(...allowed: Role[]): Promise<CurrentSession> {
  const session = await requireSession();
  if (!allowed.includes(session.role)) redirect("/");
  return session;
}
