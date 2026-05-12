import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth/get-current-org";
import { ArrowRight } from "lucide-react";

export const metadata: Metadata = { title: "Zahlungsabgleich — Buchhaltung" };

const PLATFORMS = [
  {
    key: "copecart",
    name: "Copecart",
    color: "bg-purple-500/15",
    iconColor: "text-purple-400",
    borderColor: "hover:border-purple-500/40",
    description: "Transaktionsexport aus dem Copecart-Dashboard importieren und gegen bestehende Deals abgleichen.",
    hint: "CSV-Export unter: Transaktionen → Export",
  },
  {
    key: "digistore",
    name: "Digistore",
    color: "bg-amber-500/15",
    iconColor: "text-amber-400",
    borderColor: "hover:border-amber-500/40",
    description: "Bestell- und Zahlungsexport aus Digistore importieren.",
    hint: "CSV-Export unter: Bestellungen → CSV exportieren. Achtung: Digistore liefert oft Snapshot-Exporte.",
  },
  {
    key: "ablefy",
    name: "Ablefy",
    color: "bg-cyan-500/15",
    iconColor: "text-cyan-400",
    borderColor: "hover:border-cyan-500/40",
    description: "Zahlungsexport aus dem Ablefy-Dashboard importieren.",
    hint: "CSV-Export unter: Zahlungen → Exportieren",
  },
] as const;

export default async function ZahlungsabgleichLandingPage() {
  await requireRole("admin");

  return (
    <div className="mx-auto max-w-4xl px-6 py-8 space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Zahlungsabgleich</h1>
        <p className="text-sm text-muted-foreground">
          Plattform wählen und Zahlungen gegen bestehende Deals abgleichen.
        </p>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        {PLATFORMS.map((p) => (
          <Link
            key={p.key}
            href={`/import/zahlungsabgleich/${p.key}`}
            className={`group rounded-xl border border-border bg-card p-5 space-y-3 transition-colors ${p.borderColor} hover:bg-muted/20`}
          >
            <div className="flex items-center justify-between">
              <div className={`rounded-lg ${p.color} px-3 py-1.5`}>
                <span className={`text-sm font-semibold ${p.iconColor}`}>{p.name}</span>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{p.description}</p>
            </div>
            <p className="text-xs text-muted-foreground/60">{p.hint}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
