import type { Metadata } from "next";

import { requireRole } from "@/lib/auth/get-current-org";
import { ImportWizard } from "./_components/import-wizard";

export const metadata: Metadata = { title: "Importieren — Buchhaltung" };

export default async function ImportPage() {
  await requireRole("admin");

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-semibold">CSV Import</h1>
        <p className="text-sm text-muted-foreground">
          Deals aus einer CSV-Datei in die Datenbank importieren
        </p>
      </div>

      <ImportWizard />
    </div>
  );
}
