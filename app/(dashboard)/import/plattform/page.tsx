import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ArrowLeft } from "lucide-react";
import { requireRole } from "@/lib/auth/get-current-org";

export const metadata: Metadata = { title: "Plattform-Import — Kalaie Ledger" };

const PLATFORMS = [
  {
    slug: "copecart",
    name: "Copecart",
    color: "bg-purple-500/15 text-purple-400",
    border: "hover:border-purple-500/40",
    description:
      "CSV-Transaktionsexport von Copecart importieren. Zahlungen, Erstattungen und Rückbuchungen werden automatisch erkannt und bestehenden Deals zugeordnet.",
    hint: "Exportiere im Copecart-Dashboard unter Transaktionen → CSV-Export.",
  },
  {
    slug: "digistore",
    name: "Digistore24",
    color: "bg-amber-500/15 text-amber-400",
    border: "hover:border-amber-500/40",
    description:
      "Bestell- oder Zahlungsexport von Digistore24 importieren. Snapshot-Exporte werden automatisch als solche erkannt.",
    hint: "Exporte unter Statistiken → Bestellungen → CSV-Export.",
  },
  {
    slug: "ablefy",
    name: "Ablefy",
    color: "bg-cyan-500/15 text-cyan-400",
    border: "hover:border-cyan-500/40",
    description:
      "Zahlungsexport von Ablefy importieren. Raten, Erstattungen und fehlgeschlagene Zahlungen werden einzeln erfasst.",
    hint: "Exportiere im Ablefy-Dashboard unter Zahlungen → Export.",
  },
];

export default async function PlattformAuswahlPage() {
  await requireRole("admin");

  return (
    <div className="mx-auto max-w-4xl px-6 py-8 space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/import"
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-xl font-semibold">Plattform wählen</h1>
          <p className="text-sm text-muted-foreground">
            Welche Plattform möchtest du heute importieren?
          </p>
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        {PLATFORMS.map((p) => (
          <Link
            key={p.slug}
            href={`/import/plattform/${p.slug}`}
            className={`group rounded-xl border border-border bg-card p-5 space-y-3 transition-colors hover:bg-muted/20 ${p.border}`}
          >
            <div className="flex items-center justify-between">
              <span className={`inline-flex items-center rounded-lg px-3 py-1 text-sm font-semibold ${p.color}`}>
                {p.name}
              </span>
              <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
            </div>
            <p className="text-sm text-muted-foreground">{p.description}</p>
            <p className="text-xs text-muted-foreground/60 italic">{p.hint}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
