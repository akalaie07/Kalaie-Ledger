"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { Plus, Check, Clock } from "lucide-react";
import { addSubscriptionPayment, toggleSubscriptionPayment } from "@/lib/actions/deals";

const fmt = (v: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(v);

type Payment = {
  id: string;
  sequence: number;
  due_date: string;
  amount: number;
  paid: boolean;
};

export function SubscriptionTracker({
  dealId,
  payments,
  defaultAmount,
  interval,
}: {
  dealId: string;
  payments: Payment[];
  defaultAmount: number;
  interval: "monthly" | "yearly";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showAdd, setShowAdd] = useState(false);
  const [newDate, setNewDate] = useState<string>(() => {
    // Nächsten Monat / Jahr nach letzter Zahlung vorschlagen
    if (payments.length === 0) return new Date().toISOString().slice(0, 10);
    const last = new Date(payments[payments.length - 1].due_date);
    if (interval === "monthly") last.setMonth(last.getMonth() + 1);
    else last.setFullYear(last.getFullYear() + 1);
    return last.toISOString().slice(0, 10);
  });
  const [newAmount, setNewAmount] = useState<number>(defaultAmount);
  const [error, setError] = useState<string | null>(null);

  const paidCount = payments.filter((p) => p.paid).length;

  function handleToggle(payment: Payment) {
    startTransition(async () => {
      const res = await toggleSubscriptionPayment(payment.id, dealId, !payment.paid);
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }

  function handleAdd() {
    if (!newDate || newAmount <= 0) return;
    startTransition(async () => {
      const res = await addSubscriptionPayment(dealId, newDate, newAmount);
      if (res.error) {
        setError(res.error);
      } else {
        setShowAdd(false);
        router.refresh();
      }
    });
  }

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <div className="border-b border-border px-4 py-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">
          Abo-Zahlungen ({paidCount}/{payments.length} bezahlt)
        </h2>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          {interval === "monthly" ? "Monat" : "Jahr"} hinzufügen
        </button>
      </div>

      {/* Formular: neuen Monat / Jahr hinzufügen */}
      {showAdd && (
        <div className="border-b border-border bg-muted/20 px-4 py-3 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Datum</label>
              <input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className="flex h-8 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Betrag (€)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={newAmount || ""}
                onChange={(e) => setNewAmount(parseFloat(e.target.value) || 0)}
                className="flex h-8 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              disabled={pending || !newDate || newAmount <= 0}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {pending ? "Wird hinzugefügt…" : "Hinzufügen"}
            </button>
            <button
              onClick={() => setShowAdd(false)}
              className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted transition-colors"
            >
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {payments.length === 0 ? (
        <p className="px-4 py-4 text-sm text-muted-foreground">
          Noch keine Zahlungen eingetragen. Füge den ersten {interval === "monthly" ? "Monat" : "Jahreszeitraum"} hinzu.
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/40">
            <tr>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">#</th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Datum</th>
              <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Betrag</th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {payments.map((p) => (
              <tr key={p.id} className="hover:bg-muted/20">
                <td className="px-4 py-2.5 text-muted-foreground">{p.sequence}</td>
                <td className="px-4 py-2.5 tabular-nums">
                  {format(new Date(p.due_date), interval === "monthly" ? "MMMM yyyy" : "yyyy", { locale: de })}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums font-medium">
                  {fmt(p.amount)}
                </td>
                <td className="px-4 py-2.5">
                  <button
                    onClick={() => handleToggle(p)}
                    disabled={pending}
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors disabled:opacity-50 ${
                      p.paid
                        ? "bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    }`}
                  >
                    {p.paid ? (
                      <><Check className="h-3 w-3" /> Bezahlt</>
                    ) : (
                      <><Clock className="h-3 w-3" /> Offen</>
                    )}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
