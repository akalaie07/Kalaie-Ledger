"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { Check, Clock, Pencil, X, Trash2 } from "lucide-react";
import { markInstallmentPaid, updateInstallment, deleteInstallment } from "@/lib/actions/deals";

const fmt = (v: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(v);

type Installment = {
  id: string;
  sequence: number;
  due_date: string;
  amount: number;
  paid: boolean;
};

export function InstallmentsTracker({
  dealId,
  installments,
  isAdmin,
}: {
  dealId: string;
  installments: Installment[];
  isAdmin?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editAmount, setEditAmount] = useState(0);

  const paidCount = installments.filter((p) => p.paid).length;

  function handleToggle(p: Installment) {
    startTransition(async () => {
      const res = await markInstallmentPaid(p.id, dealId, !p.paid);
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }

  function startEdit(p: Installment) {
    setEditingId(p.id);
    setEditDate(p.due_date);
    setEditAmount(p.amount);
    setError(null);
  }

  function handleEdit() {
    if (!editingId || !editDate || editAmount <= 0) return;
    startTransition(async () => {
      const res = await updateInstallment(editingId, dealId, editDate, editAmount);
      if (res.error) setError(res.error);
      else { setEditingId(null); router.refresh(); }
    });
  }

  function handleDelete(id: string) {
    if (!window.confirm("Diese unbezahlte Rate löschen?")) return;
    startTransition(async () => {
      const res = await deleteInstallment(id, dealId);
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">
          Raten ({paidCount}/{installments.length} bezahlt)
        </h2>
      </div>
      <table className="w-full text-sm">
        <thead className="border-b border-border bg-muted/40">
          <tr>
            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">#</th>
            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Fällig</th>
            <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Betrag</th>
            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Status</th>
            <th className="px-4 py-2.5 w-16" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {installments.map((p) => (
            <React.Fragment key={p.id}>
              <tr className="hover:bg-muted/20">
                <td className="px-4 py-2.5 text-muted-foreground">{p.sequence}</td>
                <td className="px-4 py-2.5 tabular-nums">
                  {format(new Date(p.due_date), "dd.MM.yyyy", { locale: de })}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums font-medium">
                  {fmt(p.amount)}
                </td>
                <td className="px-4 py-2.5">
                  <button
                    onClick={() => handleToggle(p)}
                    disabled={pending}
                    title={p.paid ? "Klicken, um als offen zu markieren" : "Klicken, um als bezahlt zu markieren"}
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium transition-all cursor-pointer hover:ring-2 hover:ring-offset-1 disabled:opacity-50 ${
                      p.paid
                        ? "bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 hover:ring-emerald-500/40"
                        : "bg-muted text-muted-foreground hover:bg-muted/80 hover:ring-border"
                    }`}
                  >
                    {p.paid ? (
                      <><Check className="h-3 w-3" /> Bezahlt</>
                    ) : (
                      <><Clock className="h-3 w-3" /> Offen</>
                    )}
                  </button>
                </td>
                <td className="px-2 py-2.5">
                  <div className="flex items-center gap-0.5">
                    <button
                      onClick={() => editingId === p.id ? setEditingId(null) : startEdit(p)}
                      disabled={pending}
                      title="Bearbeiten"
                      className="rounded p-1 text-muted-foreground/40 hover:text-muted-foreground transition-colors disabled:opacity-50"
                    >
                      {editingId === p.id ? <X className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                    </button>
                    {isAdmin && !p.paid && (
                      <button
                        onClick={() => handleDelete(p.id)}
                        disabled={pending}
                        title="Löschen"
                        className="rounded p-1 text-muted-foreground/40 hover:text-rose-400 transition-colors disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
              {editingId === p.id && (
                <tr className="bg-muted/20">
                  <td colSpan={5} className="px-4 py-3">
                    <div className="flex items-end gap-3">
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">Fällig</label>
                        <input
                          type="date"
                          value={editDate}
                          onChange={(e) => setEditDate(e.target.value)}
                          className="flex h-8 rounded-md border border-input bg-transparent px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">Betrag (€)</label>
                        <input
                          type="number" min="0" step="0.01"
                          value={editAmount || ""}
                          onChange={(e) => setEditAmount(parseFloat(e.target.value) || 0)}
                          className="flex h-8 rounded-md border border-input bg-transparent px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        />
                      </div>
                      <button
                        onClick={handleEdit}
                        disabled={pending || !editDate || editAmount <= 0}
                        className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                      >
                        {pending ? "…" : "Speichern"}
                      </button>
                    </div>
                    {error && <p className="mt-1.5 text-xs text-destructive">{error}</p>}
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}
        </tbody>
      </table>
      {error && editingId === null && (
        <p className="px-4 py-2 text-xs text-destructive">{error}</p>
      )}
    </div>
  );
}
