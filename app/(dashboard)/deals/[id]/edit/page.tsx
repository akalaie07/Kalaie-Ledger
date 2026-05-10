import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { requireRole } from "@/lib/auth/get-current-org";
import { createClient } from "@/lib/supabase/server";
import { DealEditForm } from "./_components/deal-edit-form";
import { DeleteDealButton } from "./_components/delete-deal-button";

export const metadata: Metadata = { title: "Deal bearbeiten — Buchhaltung" };

export default async function DealEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // Only admins can edit deals
  const session = await requireRole("admin");
  const supabase = await createClient();

  const [{ data: deal }, { data: platforms }, { data: products }, { data: closers }, { data: salesPartners }, { data: oneTime }] =
    await Promise.all([
      supabase
        .from("deals")
        .select("*")
        .eq("id", id)
        .eq("organization_id", session.organizationId)
        .single(),
      supabase
        .from("platforms")
        .select("id, name")
        .eq("organization_id", session.organizationId)
        .eq("active", true)
        .order("name"),
      supabase
        .from("products")
        .select("id, name, product_type")
        .eq("organization_id", session.organizationId)
        .eq("active", true)
        .order("name"),
      supabase
        .from("closers")
        .select("id, name")
        .eq("organization_id", session.organizationId)
        .eq("active", true)
        .order("name"),
      supabase
        .from("sales_partners")
        .select("id, name")
        .eq("organization_id", session.organizationId)
        .eq("active", true)
        .order("name"),
      supabase
        .from("one_time_payments")
        .select("due_date")
        .eq("deal_id", id)
        .maybeSingle(),
    ]);

  if (!deal) notFound();

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 space-y-6">
      <div>
        <Link
          href={`/deals/${id}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ChevronLeft className="h-4 w-4" />
          Zurück zum Deal
        </Link>
        <h1 className="text-xl font-semibold">Deal bearbeiten</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{deal.customer_name}</p>
      </div>

      <DealEditForm
        dealId={id}
        platforms={platforms ?? []}
        products={(products ?? []) as unknown as { id: string; name: string; product_type: string }[]}
        closers={closers ?? []}
        salesPartners={salesPartners ?? []}
        initial={{
          customer_name: deal.customer_name,
          order_id: deal.order_id,
          product_id: deal.product_id,
          platform_id: deal.platform_id,
          payment_method: deal.payment_method,
          total_price: deal.total_price,
          payment_type: deal.payment_type as "one_time" | "installments",
          close_date: deal.close_date,
          onboarding_done: deal.onboarding_done,
          update_call_done: deal.update_call_done,
          mahnung_required: deal.mahnung_required ?? false,
          inkasso_required: deal.inkasso_required,
          notes: deal.notes,
          closer_id: deal.closer_id,
          sales_partner_id: deal.sales_partner_id,
          down_payment: deal.down_payment ?? null,
          one_time_due_date: oneTime?.due_date ?? null,
        }}
      />

      <div className="pt-4 border-t border-border">
        <DeleteDealButton dealId={id} />
      </div>
    </div>
  );
}
