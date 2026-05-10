import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/get-current-org";
import { ZahlungsabgleichWizard } from "./_components/zahlungsabgleich-wizard";

export const metadata: Metadata = { title: "Zahlungsabgleich — Buchhaltung" };

export default async function ZahlungsabgleichPage() {
  await requireRole("admin");

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Zahlungsabgleich</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          CSV-Export von Copecart, Digistore oder Ablefy hochladen und Zahlungsstatus automatisch aktualisieren.
        </p>
      </div>
      <ZahlungsabgleichWizard />
    </div>
  );
}
