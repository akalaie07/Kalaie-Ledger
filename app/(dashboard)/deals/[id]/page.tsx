import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, FileDown, Pencil } from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";

import { requireSession } from "@/lib/auth/get-current-org";
import { createClient } from "@/lib/supabase/server";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { InstallmentToggle, OneTimeToggle } from "./_components/payment-toggle";

export const metadata: Metadata = { title: "Deal — Buchhaltung" };

const PAYMENT_LABEL: Record<string, string> = {
  one_time: "Einmalzahlung",
  installments: "Ratenzahlung",
};

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2.5 border-b border-border/60 last:border-0">
      <span className="text-sm text-muted-foreground shrink-0">{label}</span>
      <span className="text-sm text-right">{value ?? "—"}</span>
    </div>
  );
}

function StatusBadge({ active, label }: { active: boolean; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        active
          ? "bg-emerald-500/15 text-emerald-400"
          : "bg-muted text-muted-foreground",
      )}
    >
      {label}
    </span>
  );
}

export default async function DealDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireSession();
  const supabase = await createClient();

  const { data: deal } = await supabase
    .from("deals")
    .select(
      "*, platforms(name), products(name), closers(name), sales_partners(name)",
    )
    .eq("id", id)
    .eq("organization_id", session.organizationId)
    .single();

  if (!deal) notFound();

  const { data: installments } = await supabase
    .from("installments")
    .select("id, sequence, due_date, amount, paid")
    .eq("deal_id", id)
    .order("sequence");

  const { data: oneTime } = await supabase
    .from("one_time_payments")
    .select("paid, paid_at, due_date")
    .eq("deal_id", id)
    .maybeSingle();

  const d = deal;
  type InstallmentRow = { id: string; sequence: number; due_date: string; amount: number; paid: boolean };

  const isAdmin = session.role === "admin";

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            href="/deals"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
          >
            <ChevronLeft className="h-4 w-4" />
            Zurück zu Deals
          </Link>
          <h1 className="text-xl font-semibold">{d.customer_name}</h1>
          {d.order_id && (
            <p className="text-sm text-muted-foreground mt-0.5">
              #{d.order_id}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`/deals/${id}/pdf`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <FileDown className="mr-1.5 h-3.5 w-3.5" />
            PDF
          </a>
          {isAdmin && (
            <Link
              href={`/deals/${id}/edit`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <Pencil className="mr-1.5 h-3.5 w-3.5" />
              Bearbeiten
            </Link>
          )}
        </div>
      </div>

      {/* Deal details */}
      <div className="rounded-lg border border-border p-4 space-y-0">
        <Row label="Produkt" value={d.products?.name} />
        <Row label="Plattform" value={d.platforms?.name} />
        <Row label="Zahlart" value={d.payment_method} />
        <Row label="Closer" value={d.closers?.name} />
        <Row label="Vertriebspartner" value={d.sales_partners?.name} />
        <Row
          label="Gesamtpreis"
          value={
            <span className="font-medium tabular-nums">
              {new Intl.NumberFormat("de-DE", {
                style: "currency",
                currency: "EUR",
              }).format(d.total_price)}
            </span>
          }
        />
        {d.down_payment != null && (
          <Row
            label="Anzahlung"
            value={
              <span className="tabular-nums text-emerald-400">
                {new Intl.NumberFormat("de-DE", {
                  style: "currency",
                  currency: "EUR",
                }).format(d.down_payment)}
              </span>
            }
          />
        )}
        <Row label="Zahlungsart" value={PAYMENT_LABEL[d.payment_type]} />
        <Row
          label="Abschluss"
          value={format(new Date(d.close_date), "dd. MMMM yyyy", {
            locale: de,
          })}
        />
        <Row
          label="Onboarding"
          value={<StatusBadge active={d.onboarding_done} label={d.onboarding_done ? "Erledigt" : "Ausstehend"} />}
        />
        <Row
          label="Update-Call"
          value={<StatusBadge active={d.update_call_done} label={d.update_call_done ? "Erledigt" : "Ausstehend"} />}
        />
        {d.notes && <Row label="Notizen" value={d.notes} />}
      </div>

      {/* One-time payment status */}
      {d.payment_type === "one_time" && oneTime && (
        <div className="rounded-lg border border-border p-4 space-y-3">
          <h2 className="text-sm font-semibold">Zahlung</h2>
          {oneTime.due_date && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Fällig am</span>
              <span className="text-sm tabular-nums">
                {format(new Date(oneTime.due_date), "dd. MMMM yyyy", { locale: de })}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Status</span>
            <OneTimeToggle dealId={id} paid={oneTime.paid} />
          </div>
        </div>
      )}

      {/* Installments table */}
      {d.payment_type === "installments" && installments && installments.length > 0 && (
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">
              Raten ({installments.filter((r) => r.paid).length}/
              {installments.length} bezahlt)
            </h2>
          </div>
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">#</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Fällig</th>
                <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Betrag</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(installments as InstallmentRow[]).map((r) => (
                <tr key={r.id} className="hover:bg-muted/20">
                  <td className="px-4 py-2.5 text-muted-foreground">{r.sequence}</td>
                  <td className="px-4 py-2.5 tabular-nums">
                    {format(new Date(r.due_date), "dd.MM.yyyy", { locale: de })}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-medium">
                    {new Intl.NumberFormat("de-DE", {
                      style: "currency",
                      currency: "EUR",
                    }).format(r.amount)}
                  </td>
                  <td className="px-4 py-2.5">
                    <InstallmentToggle
                      installmentId={r.id}
                      dealId={id}
                      paid={r.paid}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
