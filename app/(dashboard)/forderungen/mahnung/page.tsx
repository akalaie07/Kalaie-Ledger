import type { Metadata } from "next";
import Link from "next/link";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { Bell } from "lucide-react";

import { requireRole } from "@/lib/auth/get-current-org";
import { createClient } from "@/lib/supabase/server";
import { ForderungsNav } from "../_components/forderungs-nav";
import { MahnungNoteEditor } from "@/app/(dashboard)/forderungsmanagement/_components/mahnung-note-editor";
import { MahnungEscalateButton } from "@/app/(dashboard)/forderungsmanagement/_components/mahnung-escalate-button";

export const metadata: Metadata = { title: "Mahnungen — Kalaie Ledger" };

function fmt(v: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(v);
}

export default async function MahnungPage() {
  const session = await requireRole("admin");
  const supabase = await createClient();

  const { data } = await supabase
    .from("deals")
    .select("id, customer_name, total_price, close_date, order_id, notes, products(name), closers(name)")
    .eq("organization_id", session.organizationId)
    .eq("mahnung_required", true)
    .eq("inkasso_required", false)
    .order("close_date", { ascending: false });

  const rows = data ?? [];

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Bell className="h-5 w-5 text-amber-400" />
            Forderungen
          </h1>
          <p className="text-sm text-muted-foreground">
            {rows.length} {rows.length === 1 ? "Eintrag" : "Einträge"} in Mahnung
          </p>
        </div>
        {rows.length > 0 && (
          <p className="text-sm text-muted-foreground tabular-nums">
            Gesamt:{" "}
            <span className="text-amber-400 font-semibold">
              {fmt(rows.reduce((s, r) => s + (r.total_price as number), 0))}
            </span>
          </p>
        )}
      </div>

      <ForderungsNav active="mahnung" />

      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/40">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Kunde</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Produkt</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Closer</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Notiz</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">Gesamtpreis</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Abschluss</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.id} className="group hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3">
                  <Link href={`/deals/${r.id}`} className="font-medium hover:underline underline-offset-4">
                    {r.customer_name}
                  </Link>
                  {r.order_id && (
                    <span className="ml-2 text-xs text-muted-foreground">#{r.order_id}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{r.products?.name ?? "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.closers?.name ?? "—"}</td>
                <td className="px-4 py-3">
                  <MahnungNoteEditor dealId={r.id} notes={r.notes} />
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-medium">
                  {fmt(r.total_price as number)}
                </td>
                <td className="px-4 py-3 text-muted-foreground tabular-nums">
                  {format(new Date(r.close_date), "dd.MM.yyyy", { locale: de })}
                </td>
                <td className="px-3 py-3">
                  <MahnungEscalateButton dealId={r.id} />
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                  <p className="text-sm">Keine Fälle in Mahnung.</p>
                  <p className="text-xs mt-1 text-emerald-400">Alles im grünen Bereich! ✓</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
