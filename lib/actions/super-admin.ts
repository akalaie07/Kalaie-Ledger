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

// ---------------------------------------------------------------------------
// resetOrgData — Alle Geschäftsdaten einer Organisation löschen
// Löscht: deals (+ installments, one_time_payments, inkasso_cases via CASCADE)
//         import_batches (+ import_rows via CASCADE)
// Behält: organizations, profiles, platforms, products, closers, sales_partners
// ---------------------------------------------------------------------------

export async function resetOrgData(
  orgId: string,
): Promise<{ error?: string; deleted?: { deals: number; batches: number } }> {
  await requireSuperAdmin();
  const supabase = createServiceClient();

  // Deals zählen vor dem Löschen
  const { count: dealCount } = await supabase
    .from("deals")
    .select("*", { count: "exact", head: true })
    .eq("organization_id", orgId);

  const { count: batchCount } = await supabase
    .from("import_batches")
    .select("*", { count: "exact", head: true })
    .eq("organization_id", orgId);

  // Deals löschen (installments, one_time_payments, inkasso_cases cascaden)
  const { error: dealsErr } = await supabase
    .from("deals")
    .delete()
    .eq("organization_id", orgId);

  if (dealsErr) return { error: `Deals konnten nicht gelöscht werden: ${dealsErr.message}` };

  // Import-Batches löschen (import_rows cascaden)
  const { error: batchesErr } = await supabase
    .from("import_batches")
    .delete()
    .eq("organization_id", orgId);

  if (batchesErr) return { error: `Import-Daten konnten nicht gelöscht werden: ${batchesErr.message}` };

  revalidatePath("/super-admin");
  revalidatePath(`/super-admin/${orgId}`);

  return {
    deleted: {
      deals: dealCount ?? 0,
      batches: batchCount ?? 0,
    },
  };
}
