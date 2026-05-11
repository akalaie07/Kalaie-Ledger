import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/get-current-org";
import { loadPendingConflicts } from "@/lib/actions/import-conflicts";
import { ZahlungsabgleichWizard } from "../_components/zahlungsabgleich-wizard";
import { ImportNav } from "../_components/import-nav";

export const metadata: Metadata = { title: "Zahlungsabgleich — Buchhaltung" };

export default async function ZahlungsabgleichPage() {
  await requireRole("admin");

  // Offene Konflikte aus vergangenen Importen vorladen
  const pendingConflicts = await loadPendingConflicts();

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Zahlungsabgleich</h1>
          <p className="text-sm text-muted-foreground">
            Plattform-Export hochladen und Zahlungen gegen bestehende Deals abgleichen
          </p>
        </div>
        {pendingConflicts.length > 0 && (
          <span className="inline-flex items-center rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-medium text-amber-400">
            {pendingConflicts.length} offen
          </span>
        )}
      </div>
      <ImportNav active="zahlungsabgleich" />
      <ZahlungsabgleichWizard initialConflicts={pendingConflicts} />
    </div>
  );
}
