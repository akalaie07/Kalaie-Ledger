"use server";

import { requireRole } from "@/lib/auth/get-current-org";
import { createClient } from "@/lib/supabase/server";

export type ImportFormOptions = {
  platforms: { id: string; name: string }[];
  products: { id: string; name: string; product_type: "standard" | "subscription_monthly" | "subscription_yearly" }[];
  closers: { id: string; name: string }[];
};

export async function getImportFormOptions(): Promise<ImportFormOptions> {
  const session = await requireRole("admin");
  const supabase = await createClient();

  const [{ data: platforms }, { data: products }, { data: closers }] =
    await Promise.all([
      supabase.from("platforms").select("id, name").eq("organization_id", session.organizationId).eq("active", true).order("name"),
      supabase.from("products").select("id, name, product_type").eq("organization_id", session.organizationId).eq("active", true).order("name"),
      supabase.from("closers").select("id, name").eq("organization_id", session.organizationId).eq("active", true).order("name"),
    ]);

  return {
    platforms: platforms ?? [],
    products: (products ?? []) as ImportFormOptions["products"],
    closers: closers ?? [],
  };
}
