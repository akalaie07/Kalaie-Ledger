import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { requireSession } from "@/lib/auth/get-current-org";
import { createClient } from "@/lib/supabase/server";
import { DealForm } from "./_components/deal-form";

export const metadata: Metadata = { title: "Neuer Deal — Buchhaltung" };

export default async function NewDealPage() {
  const session = await requireSession();
  const supabase = await createClient();
  const orgId = session.organizationId;

  const [platforms, products, closers, salesPartners] = await Promise.all([
    supabase
      .from("platforms")
      .select("id, name")
      .eq("organization_id", orgId)
      .eq("active", true)
      .order("name"),
    supabase
      .from("products")
      .select("id, name, product_type")
      .eq("organization_id", orgId)
      .eq("active", true)
      .order("name"),
    supabase
      .from("closers")
      .select("id, name")
      .eq("organization_id", orgId)
      .eq("active", true)
      .order("name"),
    supabase
      .from("sales_partners")
      .select("id, name")
      .eq("organization_id", orgId)
      .eq("active", true)
      .order("name"),
  ]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 space-y-6">
      <div>
        <Link
          href="/deals"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ChevronLeft className="h-4 w-4" />
          Zurück zu Deals
        </Link>
        <h1 className="text-xl font-semibold">Neuer Deal</h1>
      </div>

      <DealForm
        platforms={(platforms.data ?? []) as { id: string; name: string }[]}
        products={(products.data ?? []) as unknown as { id: string; name: string; product_type: string }[]}
        closers={(closers.data ?? []) as { id: string; name: string }[]}
        salesPartners={
          (salesPartners.data ?? []) as { id: string; name: string }[]
        }
      />
    </div>
  );
}
