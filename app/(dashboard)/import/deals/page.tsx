import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/get-current-org";
import { ImportWizard } from "../_components/import-wizard";
import { ImportNav } from "../_components/import-nav";

export const metadata: Metadata = { title: "Deals importieren — Buchhaltung" };

export default async function ImportDealsPage() {
  await requireRole("admin");

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Importieren</h1>
        <p className="text-sm text-muted-foreground">
          Deals und Zahlungen in die Datenbank importieren
        </p>
      </div>
      <ImportNav active="deals" />
      <ImportWizard />
    </div>
  );
}
