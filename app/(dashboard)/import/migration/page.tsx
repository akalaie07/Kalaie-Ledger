import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/get-current-org";
import { MigrationWizard } from "../_components/migration-wizard";
import { ImportNav } from "../_components/import-nav";

export const metadata: Metadata = { title: "Alte Buchhaltung importieren — Buchhaltung" };

export default async function MigrationPage() {
  await requireRole("admin");

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Alte Buchhaltung importieren</h1>
        <p className="text-sm text-muted-foreground">
          Einmalige Migration — Excel-Tabelle oder Standard-CSV hochladen
        </p>
      </div>
      <ImportNav active="migration" />
      <MigrationWizard />
    </div>
  );
}
