import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";

import { requireSession } from "@/lib/auth/get-current-org";
import { createClient } from "@/lib/supabase/server";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Deals — Buchhaltung" };

const PAYMENT_LABEL: Record<string, string> = {
  one_time: "Einmalzahlung",
  installments: "Ratenzahlung",
};

export default async function DealsPage() {
  const session = await requireSession();
  const supabase = await createClient();

  const { data: deals } = await supabase
    .from("deals")
    .select(
      "id, customer_name, total_price, payment_type, close_date, inkasso_required, onboarding_done, order_id, platforms(name), products(name), closers(name), sales_partners(name)",
    )
    .eq("organization_id", session.organizationId)
    .order("close_date", { ascending: false });

  const rows = (deals ?? []) as Array<{
    id: string;
    customer_name: string;
    total_price: number;
    payment_type: "one_time" | "installments";
    close_date: string;
    inkasso_required: boolean;
    onboarding_done: boolean;
    order_id: string | null;
    platforms: { name: string } | null;
    products: { name: string } | null;
    closers: { name: string } | null;
    sales_partners: { name: string } | null;
  }>;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Deals</h1>
          <p className="text-sm text-muted-foreground">
            {rows.length} {rows.length === 1 ? "Eintrag" : "Einträge"}
          </p>
        </div>
        <Link href="/deals/new" className={buttonVariants({ size: "sm" })}>
          <Plus className="mr-1.5 h-4 w-4" />
          Neuer Deal
        </Link>
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/40">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                Kunde
              </th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                Produkt
              </th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                Plattform
              </th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                Closer
              </th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                Preis
              </th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                Zahlung
              </th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                Abschluss
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((deal) => (
              <tr
                key={deal.id}
                className="hover:bg-muted/30 transition-colors"
              >
                <td className="px-4 py-3">
                  <Link
                    href={`/deals/${deal.id}`}
                    className="font-medium hover:underline underline-offset-4"
                  >
                    {deal.customer_name}
                  </Link>
                  {deal.order_id && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      #{deal.order_id}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {deal.products?.name ?? "—"}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {deal.platforms?.name ?? "—"}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {deal.closers?.name ?? "—"}
                </td>
                <td className="px-4 py-3 text-right font-medium tabular-nums">
                  {new Intl.NumberFormat("de-DE", {
                    style: "currency",
                    currency: "EUR",
                  }).format(deal.total_price)}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                      deal.payment_type === "one_time"
                        ? "bg-blue-500/15 text-blue-400"
                        : "bg-purple-500/15 text-purple-400",
                    )}
                  >
                    {PAYMENT_LABEL[deal.payment_type]}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground tabular-nums">
                  {format(new Date(deal.close_date), "dd.MM.yyyy", {
                    locale: de,
                  })}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-10 text-center text-muted-foreground"
                >
                  Noch keine Deals vorhanden.{" "}
                  <Link
                    href="/deals/new"
                    className="text-foreground underline-offset-4 hover:underline"
                  >
                    Ersten Deal anlegen
                  </Link>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
