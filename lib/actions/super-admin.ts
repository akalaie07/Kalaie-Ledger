"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import { getCurrentSession } from "@/lib/auth/get-current-org";

async function requireSuperAdmin() {
  const session = await getCurrentSession();
  if (!session?.isSuperAdmin) throw new Error("Kein Zugriff.");
  return session;
}

// Alle Organisationen mit User-Anzahl laden (Service-Role bypassed RLS)
export async function getAllOrganizations() {
  await requireSuperAdmin();
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("organizations")
    .select("id, name, slug, settings, created_at, profiles(count)")
    .order("name");

  if (error) throw new Error(error.message);
  return data ?? [];
}

// Feature für eine Org aktivieren/deaktivieren
export async function toggleOrgFeature(
  orgId: string,
  flag: string,
  enabled: boolean,
): Promise<{ error?: string }> {
  await requireSuperAdmin();
  const supabase = createServiceClient();

  // Aktuelle Settings laden
  const { data: org, error: fetchErr } = await supabase
    .from("organizations")
    .select("settings")
    .eq("id", orgId)
    .single();

  if (fetchErr || !org) return { error: "Organisation nicht gefunden." };

  const settings = (org.settings as { features?: string[] }) ?? {};
  const currentFeatures: string[] = settings.features ?? [];

  const newFeatures = enabled
    ? [...new Set([...currentFeatures, flag])]
    : currentFeatures.filter((f) => f !== flag);

  const { error: updateErr } = await supabase
    .from("organizations")
    .update({ settings: { ...settings, features: newFeatures } })
    .eq("id", orgId);

  if (updateErr) return { error: updateErr.message };

  revalidatePath("/super-admin");
  return {};
}
