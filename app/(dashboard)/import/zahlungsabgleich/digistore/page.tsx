import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth/get-current-org";
import { ChevronLeft } from "lucide-react";
import { PlatformImportWizard } from "../../_components/platform-import-wizard";
import { ImportNav } from "../../_components/import-nav";

export const metadata: Metadata = { title: "Digistore-Import — Buchhaltung" };

export default async function DigistoreImportPage() {
  await requireRole("admin");

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 space-y-6">
      <div className="space-y-1">
        <Link
          href="/import/zahlungsabgleich"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="h-3 w-3" />
          Zahlungsabgleich
        </Link>
        <h1 className="text-xl font-semibold">Digistore-Import</h1>
        <p className="text-sm text-muted-foreground">
          Bestell- und Zahlungsexport aus Digistore hochladen und abgleichen
        </p>
      </div>
      <ImportNav active="zahlungsabgleich" />
      <PlatformImportWizard platform="digistore" />
    </div>
  );
}
