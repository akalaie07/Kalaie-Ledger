import type { Metadata } from "next";

import { requireRole } from "@/lib/auth/get-current-org";
import { createClient } from "@/lib/supabase/server";
import {
  createPlatform,
  updatePlatform,
  togglePlatform,
  createProduct,
  updateProduct,
  toggleProduct,
  createCloser,
  updateCloser,
  toggleCloser,
  createSalesPartner,
  updateSalesPartner,
  toggleSalesPartner,
} from "@/lib/actions/stammdaten";

import { PlatformsSection, type Platform } from "./_components/platforms-section";
import { ProductsSection, type Product } from "./_components/products-section";
import { StaffSection, type StaffItem, type ProfileOpt } from "./_components/staff-section";

export const metadata: Metadata = { title: "Stammdaten — Buchhaltung" };

export default async function StammdatenPage() {
  const session = await requireRole("admin");
  const orgId = session.organizationId;

  const supabase = await createClient();

  const [platforms, products, closers, salesPartners, profiles] =
    await Promise.all([
      supabase
        .from("platforms")
        .select("id, name, active")
        .eq("organization_id", orgId)
        .order("name"),
      supabase
        .from("products")
        .select("id, name, default_price, active, product_type")
        .eq("organization_id", orgId)
        .order("name"),
      supabase
        .from("closers")
        .select("id, name, commission_rate, active, profile_id")
        .eq("organization_id", orgId)
        .order("name"),
      supabase
        .from("sales_partners")
        .select("id, name, commission_rate, active, profile_id")
        .eq("organization_id", orgId)
        .order("name"),
      supabase
        .from("profiles")
        .select("id, full_name, email")
        .eq("organization_id", orgId)
        .order("full_name"),
    ]);

  return (
    <div className="mx-auto max-w-2xl space-y-10 px-4 py-8">
      <div>
        <h1 className="text-xl font-semibold">Stammdaten</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Lookup-Werte für deine Organisation verwalten.
        </p>
      </div>

      <PlatformsSection
        items={(platforms.data ?? []) as Platform[]}
        createAction={createPlatform}
        updateAction={updatePlatform}
        toggleAction={togglePlatform}
      />

      <ProductsSection
        items={(products.data ?? []) as Product[]}
        createAction={createProduct}
        updateAction={updateProduct}
        toggleAction={toggleProduct}
      />

      <StaffSection
        title="Closer"
        items={(closers.data ?? []) as StaffItem[]}
        profiles={(profiles.data ?? []) as ProfileOpt[]}
        createAction={createCloser}
        updateAction={updateCloser}
        toggleAction={toggleCloser}
      />

      <StaffSection
        title="Vertriebspartner"
        items={(salesPartners.data ?? []) as StaffItem[]}
        profiles={(profiles.data ?? []) as ProfileOpt[]}
        createAction={createSalesPartner}
        updateAction={updateSalesPartner}
        toggleAction={toggleSalesPartner}
      />
    </div>
  );
}
