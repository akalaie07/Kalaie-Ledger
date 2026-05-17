import type { Metadata } from "next";

import { requireRole } from "@/lib/auth/get-current-org";
import { createClient } from "@/lib/supabase/server";
import {
  createPlatform,
  updatePlatform,
  togglePlatform,
  deletePlatform,
  createProduct,
  updateProduct,
  toggleProduct,
  deleteProduct,
  createCloser,
  updateCloser,
  toggleCloser,
  deleteCloser,
  createSalesPartner,
  updateSalesPartner,
  toggleSalesPartner,
  deleteSalesPartner,
} from "@/lib/actions/stammdaten";

import {
  PlatformsSection,
  type Platform,
} from "@/app/(dashboard)/einstellungen/stammdaten/_components/platforms-section";
import {
  ProductsSection,
  type Product,
} from "@/app/(dashboard)/einstellungen/stammdaten/_components/products-section";
import {
  StaffSection,
  type StaffItem,
  type ProfileOpt,
} from "@/app/(dashboard)/einstellungen/stammdaten/_components/staff-section";

export const metadata: Metadata = { title: "Stammdaten — Kalaie Ledger" };

export default async function StammdatenPage() {
  const session = await requireRole("admin");
  const orgId = session.organizationId;
  const supabase = await createClient();

  const [platforms, products, closers, salesPartners, profiles] = await Promise.all([
    supabase.from("platforms").select("id, name, active").eq("organization_id", orgId).order("name"),
    supabase.from("products").select("id, name, default_price, active, product_type, registration_fee_options, default_recurring_price").eq("organization_id", orgId).order("name"),
    supabase.from("closers").select("id, name, commission_rate, active, profile_id").eq("organization_id", orgId).order("name"),
    supabase.from("sales_partners").select("id, name, commission_rate, active, profile_id").eq("organization_id", orgId).order("name"),
    supabase.from("profiles").select("id, full_name, email").eq("organization_id", orgId).order("full_name"),
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
        deleteAction={deletePlatform}
      />

      <ProductsSection
        items={(products.data ?? []) as Product[]}
        createAction={createProduct}
        updateAction={updateProduct}
        toggleAction={toggleProduct}
        deleteAction={deleteProduct}
      />

      <StaffSection
        title="Closer"
        items={(closers.data ?? []) as StaffItem[]}
        profiles={(profiles.data ?? []) as ProfileOpt[]}
        createAction={createCloser}
        updateAction={updateCloser}
        toggleAction={toggleCloser}
        deleteAction={deleteCloser}
      />

      <StaffSection
        title="Sales-Partner"
        items={(salesPartners.data ?? []) as StaffItem[]}
        profiles={(profiles.data ?? []) as ProfileOpt[]}
        createAction={createSalesPartner}
        updateAction={updateSalesPartner}
        toggleAction={toggleSalesPartner}
        deleteAction={deleteSalesPartner}
      />
    </div>
  );
}
