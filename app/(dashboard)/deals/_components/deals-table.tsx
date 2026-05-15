"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { format } from "date-fns";
import { de } from "date-fns/locale";
import { HandshakeIcon, PhoneCall, TriangleAlert, Gavel, Trash2, Undo2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { bulkDeleteDeals, toggleDealFlag, setDealEscalation } from "@/lib/actions/deals";
import { DealRowActions } from "./deal-row-actions";
import { NotePopup } from "./note-popup";

export type DealRowData = {
  id: string;
  customer_name: string;
  order_id: string | null;
  product_name: string | null;
  product_type: string | null;
  platform_name: string | null;
  closer_name: string | null;
  total_price: number;
  payment_type: "one_time" | "installments" | "subscription_monthly" | "subscription_yearly";
  close_date: string;
  down_payment: number | null;
  recurring_amount: number | null;
  notes: string | null;
  mahnung_required: boolean;
  inkasso_required: boolean;
  chargeback: boolean;
  onboarding_done: boolean;
  update_call_done: boolean;
  otp_paid: boolean | null;
  inst_total: number;
  inst_paid: number;
  inst_open_amount: number;
};

// =============================================================================
// Status-Icons — klickbar, Mahnung/Inkasso nur wenn aktiv sichtbar
// =============================================================================

function DealStatusIcons({
  dealId,
  onboardingDone,
  updateCallDone,
  mahnungRequired,
  inkassoRequired,
}: {
  dealId: string;
  onboardingDone: boolean;
  updateCallDone: boolean;
  mahnungRequired: boolean;
  inkassoRequired: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function toggle(flag: "onboarding_done" | "update_call_done", current: boolean) {
    startTransition(async () => {
      await toggleDealFlag(dealId, flag, !current);
      router.refresh();
    });
  }

  function deactivateMahnung() {
    startTransition(async () => {
      await setDealEscalation(dealId, false, false);
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-1.5">
      <button
        title={onboardingDone ? "Onboarding rückgängig" : "Onboarding als erledigt markieren"}
        onClick={(e) => { e.preventDefault(); toggle("onboarding_done", onboardingDone); }}
        disabled={pending}
        className={cn(
          "rounded p-0.5 transition-colors disabled:opacity-50",
          onboardingDone
            ? "text-emerald-400 hover:text-emerald-300"
            : "text-muted-foreground/25 hover:text-muted-foreground/60",
        )}
      >
        <HandshakeIcon className="h-3.5 w-3.5" />
      </button>

      <button
        title={updateCallDone ? "Update-Call rückgängig" : "Update-Call als erledigt markieren"}
        onClick={(e) => { e.preventDefault(); toggle("update_call_done", updateCallDone); }}
        disabled={pending}
        className={cn(
          "rounded p-0.5 transition-colors disabled:opacity-50",
          updateCallDone
            ? "text-blue-400 hover:text-blue-300"
            : "text-muted-foreground/25 hover:text-muted-foreground/60",
        )}
      >
        <PhoneCall className="h-3.5 w-3.5" />
      </button>

      {/* Mahnung — nur sichtbar wenn aktiv, klicken = deaktivieren */}
      {mahnungRequired && (
        <button
          title="Mahnung aufheben"
          onClick={(e) => { e.preventDefault(); deactivateMahnung(); }}
          disabled={pending}
          className="rounded p-0.5 text-amber-400 hover:text-amber-300 transition-colors disabled:opacity-50"
        >
          <TriangleAlert className="h-3.5 w-3.5" />
        </button>
      )}

      {/* Inkasso — nur sichtbar wenn aktiv, zeigt Status (nicht klickbar) */}
      {inkassoRequired && (
        <span title="Inkasso" className="rounded p-0.5 text-rose-400">
          <Gavel className="h-3.5 w-3.5" />
        </span>
      )}
    </div>
  );
}

function fmt(v: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(v);
}

function getPaymentLabel(paymentType: string, productType?: string | null): string {
  if (paymentType === "one_time") return "Einmalzahlung";
  if (paymentType === "subscription_monthly" || productType === "subscription_monthly") return "Abo · monatlich";
  if (paymentType === "subscription_yearly" || productType === "subscription_yearly") return "Abo · jährlich";
  return "Ratenzahlung";
}

export function DealsTable({
  rows,
  isAdmin,
  filter,
}: {
  rows: DealRowData[];
  isAdmin: boolean;
  filter: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const allSelected = rows.length > 0 && rows.every((r) => selectedIds.has(r.id));
  const someSelected = selectedIds.size > 0;

  function toggleAll() {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(rows.map((r) => r.id)));
    }
  }

  function toggleRow(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleBulkDelete() {
    const count = selectedIds.size;
    if (!window.confirm(`${count} ${count === 1 ? "Deal" : "Deals"} unwiderruflich löschen?`)) return;
    const ids = Array.from(selectedIds);
    startTransition(async () => {
      const result = await bulkDeleteDeals(ids);
      if (result.error) {
        alert(`Fehler: ${result.error}`);
        return;
      }
      setSelectedIds(new Set());
      router.refresh();
    });
  }

  const colSpan = isAdmin ? 12 : 10;

  return (
    <div className="relative">
      {/* Floating bulk action bar */}
      {isAdmin && someSelected && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-2.5 shadow-lg">
          <span className="text-sm text-muted-foreground">
            {selectedIds.size} ausgewählt
          </span>
          <button
            onClick={toggleAll}
            className="text-sm text-foreground hover:underline underline-offset-4"
          >
            {allSelected ? "Auswahl aufheben" : "Alle auswählen"}
          </button>
          <div className="h-4 w-px bg-border" />
          <button
            onClick={handleBulkDelete}
            disabled={isPending}
            className="flex items-center gap-1.5 rounded-md bg-rose-500/10 px-3 py-1 text-sm font-medium text-rose-400 hover:bg-rose-500/20 disabled:opacity-50 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Auswahl löschen
          </button>
        </div>
      )}

      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/40">
            <tr>
              {isAdmin && (
                <th className="w-10 px-3 py-3">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    className="h-3.5 w-3.5 rounded accent-primary cursor-pointer"
                    aria-label="Alle auswählen"
                  />
                </th>
              )}
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Kunde</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Bestell-ID</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Produkt</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Plattform</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Closer</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">Preis</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Zahlung</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Bezahlt</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Datum</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
              {isAdmin && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((deal) => {
              const isSelected = selectedIds.has(deal.id);
              const label = getPaymentLabel(deal.payment_type, deal.product_type);
              const isAbo = label.startsWith("Abo");

              return (
                <tr
                  key={deal.id}
                  className={cn(
                    "group hover:bg-muted/30 transition-colors",
                    isSelected && "bg-muted/20",
                  )}
                >
                  {isAdmin && (
                    <td className="w-10 px-3 py-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleRow(deal.id)}
                        className="h-3.5 w-3.5 rounded accent-primary cursor-pointer"
                        aria-label={`${deal.customer_name} auswählen`}
                      />
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <Link
                        href={`/deals/${deal.id}`}
                        className="font-medium hover:underline underline-offset-4"
                      >
                        {deal.customer_name}
                      </Link>
                      <NotePopup dealId={deal.id} notes={deal.notes} />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground tabular-nums text-xs">
                    {deal.order_id ? `#${deal.order_id}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{deal.product_name ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{deal.platform_name ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{deal.closer_name ?? "—"}</td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums">
                    {isAbo && deal.recurring_amount ? (
                      <div className="space-y-0.5">
                        {deal.total_price > 0 && (
                          <p className="text-xs text-muted-foreground">{fmt(deal.total_price)} einmalig</p>
                        )}
                        <p className="text-violet-400">
                          {fmt(deal.recurring_amount)}/
                          {deal.payment_type === "subscription_monthly" ? "Mo." : "Jahr"}
                        </p>
                      </div>
                    ) : (
                      fmt(deal.total_price)
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                        deal.payment_type === "one_time"
                          ? "bg-blue-500/15 text-blue-400"
                          : isAbo
                          ? "bg-violet-500/15 text-violet-400"
                          : "bg-purple-500/15 text-purple-400",
                      )}
                    >
                      {label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/deals/${deal.id}`} className="block space-y-0.5">
                      {deal.payment_type === "one_time" ? (
                        (() => {
                          const isPaid = deal.otp_paid ?? false;
                          const openAmt = isPaid ? 0 : deal.total_price - (deal.down_payment ?? 0);
                          return (
                            <>
                              <span
                                className={cn(
                                  "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                                  isPaid
                                    ? "bg-emerald-500/15 text-emerald-400"
                                    : "bg-rose-500/15 text-rose-400",
                                )}
                              >
                                {isPaid ? `Bezahlt · ${fmt(deal.total_price)}` : "Offen"}
                              </span>
                              {deal.chargeback && (
                                <p className="text-xs font-medium text-red-800">
                                  Rückbuchung
                                </p>
                              )}
                              {!deal.chargeback && (deal.down_payment || (!isPaid && openAmt > 0)) && (
                                <p className="text-xs text-muted-foreground">
                                  {deal.down_payment ? `AZ ${fmt(deal.down_payment)}` : ""}
                                  {deal.down_payment && !isPaid && openAmt > 0 ? " · " : ""}
                                  {!isPaid && openAmt > 0 ? (
                                    <span className="text-rose-400/80">{fmt(openAmt)} offen</span>
                                  ) : null}
                                </p>
                              )}
                            </>
                          );
                        })()
                      ) : (
                        (() => {
                          const { inst_total: total, inst_paid: paid, inst_open_amount: openAmount } = deal;
                          if (total === 0)
                            return <span className="text-muted-foreground/40 text-xs">—</span>;
                          const done = paid === total;
                          return (
                            <>
                              <span
                                className={cn(
                                  "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                                  done
                                    ? "bg-emerald-500/15 text-emerald-400"
                                    : paid > 0
                                    ? "bg-amber-500/15 text-amber-400"
                                    : "bg-rose-500/15 text-rose-400",
                                )}
                              >
                                {paid}/{total} Raten
                              </span>
                              {deal.chargeback && (
                                <p className="text-xs font-medium text-red-800">
                                  Rückbuchung
                                </p>
                              )}
                              {!deal.chargeback && (deal.down_payment || (!done && openAmount > 0)) && (
                                <p className="text-xs text-muted-foreground">
                                  {deal.down_payment ? `AZ ${fmt(deal.down_payment)}` : ""}
                                  {deal.down_payment && !done && openAmount > 0 ? " · " : ""}
                                  {!done && openAmount > 0 ? (
                                    <span className="text-rose-400/80">{fmt(openAmount)} offen</span>
                                  ) : null}
                                </p>
                              )}
                            </>
                          );
                        })()
                      )}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground tabular-nums">
                    {format(new Date(deal.close_date), "dd.MM.yyyy", { locale: de })}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <DealStatusIcons
                        dealId={deal.id}
                        onboardingDone={deal.onboarding_done}
                        updateCallDone={deal.update_call_done}
                        mahnungRequired={deal.mahnung_required}
                        inkassoRequired={deal.inkasso_required}
                      />
                      {deal.chargeback && (
                        <span title="Rückbuchung" className="rounded p-0.5 text-red-800">
                          <Undo2 className="h-3.5 w-3.5" />
                        </span>
                      )}
                    </div>
                  </td>
                  {isAdmin && (
                    <td className="px-3 py-3">
                      <DealRowActions
                        dealId={deal.id}
                        mahnungRequired={deal.mahnung_required}
                        inkassoRequired={deal.inkasso_required}
                      />
                    </td>
                  )}
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={colSpan} className="px-4 py-10 text-center text-muted-foreground">
                  {filter !== "alle" ? (
                    `Keine ${filter.toUpperCase()}-Deals vorhanden.`
                  ) : (
                    <>
                      Noch keine Deals vorhanden.{" "}
                      <Link
                        href="/deals/new"
                        className="text-foreground underline-offset-4 hover:underline"
                      >
                        Ersten Deal anlegen
                      </Link>
                    </>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
