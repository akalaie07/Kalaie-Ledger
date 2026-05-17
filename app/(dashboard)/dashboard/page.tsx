import type { Metadata } from "next";
import Link from "next/link";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import {
  FileText,
  Bell,
  AlertTriangle,
  Upload,
  AlertCircle,
  ArrowRight,
  TrendingUp,
} from "lucide-react";

import { requireSession } from "@/lib/auth/get-current-org";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Dashboard — Kalaie Ledger" };

function fmt(v: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(v);
}

export default async function DashboardPage() {
  const session = await requireSession();
  const supabase = await createClient();

  const orgId = session.organizationId;
  const isAdmin = session.role === "admin";

  // ─── Daten parallel laden ────────────────────────────────────────────────
  const [
    { count: totalDeals },
    { data: balanceData },
    { count: mahnungCount },
    { count: inkassoCount },
    { count: conflictsCount },
    { data: recentDeals },
  ] = await Promise.all([
    supabase
      .from("deals")
      .select("id", { count: "exact", head: false })
      .eq("organization_id", orgId)
      .limit(1),
    isAdmin
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? (supabase as any)
          .from("deal_balance")
          .select("open_sum, overdue_sum, paid_sum")
          .eq("organization_id", orgId)
      : Promise.resolve({ data: null }),
    isAdmin
      ? supabase
          .from("deals")
          .select("id", { count: "exact", head: false })
          .eq("organization_id", orgId)
          .eq("mahnung_required", true)
          .eq("inkasso_required", false)
          .limit(1)
      : Promise.resolve({ data: null, count: 0 }),
    isAdmin
      ? supabase
          .from("deals_with_status")
          .select("id", { count: "exact", head: false })
          .eq("organization_id", orgId)
          .eq("computed_status", "in_collection")
          .limit(1)
      : Promise.resolve({ data: null, count: 0 }),
    isAdmin
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? (supabase as any)
          .from("import_conflicts")
          .select("id", { count: "exact", head: false })
          .eq("organization_id", orgId)
          .eq("status", "pending")
          .limit(1)
      : Promise.resolve({ data: null, count: 0 }),
    supabase
      .from("deals")
      .select("id, customer_name, total_price, close_date, products(name)")
      .eq("organization_id", orgId)
      .order("close_date", { ascending: false })
      .limit(5),
  ]);

  // Finanzielle Gesamt-KPIs
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const totalOffen = (balanceData ?? []).reduce((s: number, b: any) => s + (Number(b.open_sum) || 0), 0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const totalOverdue = (balanceData ?? []).reduce((s: number, b: any) => s + (Number(b.overdue_sum) || 0), 0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const totalPaid = (balanceData ?? []).reduce((s: number, b: any) => s + (Number(b.paid_sum) || 0), 0);

  const deals = recentDeals ?? [];

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 space-y-8">

      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold">
          Hallo{session.fullName ? `, ${session.fullName.split(" ")[0]}` : ""} 👋
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {format(new Date(), "EEEE, dd. MMMM yyyy", { locale: de })} · {session.organizationName}
        </p>
      </div>

      {/* KPI-Karten */}
      <div className={`grid gap-4 ${isAdmin ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-1 sm:grid-cols-2"}`}>

        {/* Gesamt Deals */}
        <Link href="/deals" className="group rounded-lg border border-border bg-card p-5 space-y-1 hover:border-foreground/30 hover:bg-muted/10 transition-colors">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Deals gesamt</p>
            <FileText className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
          </div>
          <p className="text-2xl font-semibold tabular-nums">{totalDeals ?? 0}</p>
          <p className="text-xs text-muted-foreground">In dieser Organisation</p>
        </Link>


        {/* Ist-Umsatz */}
        {isAdmin && (
          <Link href="/analyse/berichte" className="group rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-5 space-y-1 hover:bg-emerald-500/10 transition-colors">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Eingenommen</p>
              <TrendingUp className="h-4 w-4 text-emerald-400" />
            </div>
            <p className="text-2xl font-semibold tabular-nums text-emerald-400">{fmt(totalPaid)}</p>
            <p className="text-xs text-muted-foreground">Bezahlt gesamt</p>
          </Link>
        )}

        {/* Offene Forderungen */}
        {isAdmin && (
          <Link
            href={totalOverdue > 0 ? "/forderungen/ueberfaellig" : "/forderungen/mahnung"}
            className={[
              "group rounded-lg border p-5 space-y-1 transition-colors",
              totalOverdue > 0
                ? "border-rose-500/30 bg-rose-500/5 hover:bg-rose-500/10"
                : "border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10",
            ].join(" ")}
          >
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Überfällig</p>
              <AlertTriangle className={`h-4 w-4 ${totalOverdue > 0 ? "text-rose-400" : "text-amber-400"}`} />
            </div>
            <p className={`text-2xl font-semibold tabular-nums ${totalOverdue > 0 ? "text-rose-400" : "text-amber-400"}`}>
              {fmt(totalOverdue)}
            </p>
            <p className="text-xs text-muted-foreground">Offen: {fmt(totalOffen)}</p>
          </Link>
        )}

        {/* Mahnung / Inkasso */}
        {isAdmin && (
          <Link href="/forderungen/mahnung" className="group rounded-lg border border-border bg-card p-5 space-y-1 hover:border-foreground/30 hover:bg-muted/10 transition-colors">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Forderungen</p>
              <Bell className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
            </div>
            <p className="text-2xl font-semibold tabular-nums">
              <span className="text-amber-400">{mahnungCount ?? 0}</span>
              <span className="text-muted-foreground text-base"> / </span>
              <span className="text-rose-400">{inkassoCount ?? 0}</span>
            </p>
            <p className="text-xs text-muted-foreground">Mahnung / Inkasso</p>
          </Link>
        )}
      </div>

      {/* Offene Konflikte — nur wenn vorhanden */}
      {isAdmin && (conflictsCount ?? 0) > 0 && (
        <Link
          href="/import/konflikte"
          className="flex items-center justify-between rounded-lg border border-amber-500/30 bg-amber-500/5 px-5 py-3.5 hover:bg-amber-500/10 transition-colors"
        >
          <div className="flex items-center gap-3">
            <AlertCircle className="h-4 w-4 text-amber-400 shrink-0" />
            <div>
              <p className="text-sm font-medium">
                {conflictsCount} offene Import-{conflictsCount === 1 ? "Konflikt" : "Konflikte"}
              </p>
              <p className="text-xs text-muted-foreground">Import-Zentrale → Offene Prüfungen</p>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-amber-400 shrink-0" />
        </Link>
      )}

      {/* Schnellzugriff */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Schnellzugriff</h2>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/deals/new"
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium hover:border-foreground/30 hover:bg-muted/20 transition-colors"
          >
            <FileText className="h-4 w-4" />
            Neuer Deal
          </Link>
          {isAdmin && (
            <Link
              href="/import/plattform"
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium hover:border-foreground/30 hover:bg-muted/20 transition-colors"
            >
              <Upload className="h-4 w-4" />
              Plattform importieren
            </Link>
          )}
          {isAdmin && (
            <Link
              href="/analyse/berichte"
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium hover:border-foreground/30 hover:bg-muted/20 transition-colors"
            >
              <TrendingUp className="h-4 w-4" />
              Berichte
            </Link>
          )}
        </div>
      </section>

      {/* Letzte Deals */}
      {deals.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Zuletzt abgeschlossen</h2>
            <Link href="/deals" className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-4 transition-colors">
              Alle Deals →
            </Link>
          </div>
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-border">
                {deals.map((d) => (
                  <tr key={d.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3">
                      <Link href={`/deals/${d.id}`} className="font-medium hover:underline underline-offset-4">
                        {d.customer_name}
                      </Link>
                      {d.products?.name && (
                        <p className="text-xs text-muted-foreground">{d.products.name}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium">
                      {fmt(Number(d.total_price) || 0)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground text-xs">
                      {format(new Date(d.close_date), "dd.MM.yyyy", { locale: de })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
