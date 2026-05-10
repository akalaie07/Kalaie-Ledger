import type { Metadata } from "next";
import Link from "next/link";
import { Building2, Users, Settings2 } from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";

import { getAllOrganizations } from "@/lib/actions/super-admin";
import { AVAILABLE_FEATURES } from "@/lib/features";

export const metadata: Metadata = { title: "Super-Admin — Kalaie Ledger" };

export default async function SuperAdminPage() {
  const orgs = await getAllOrganizations();

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-xl font-semibold">Organisationen</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {orgs.length} {orgs.length === 1 ? "Organisation" : "Organisationen"} auf der Plattform
        </p>
      </div>

      <div className="grid gap-4">
        {orgs.map((org) => {
          const settings = (org.settings as { features?: string[] }) ?? {};
          const activeFeatures: string[] = settings.features ?? [];
          const userCount = Array.isArray(org.profiles)
            ? (org.profiles[0] as unknown as { count: number })?.count ?? 0
            : 0;

          return (
            <div
              key={org.id}
              className="rounded-lg border border-border bg-muted/10 p-5 space-y-4"
            >
              {/* Org Header */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-muted p-2">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="font-semibold">{org.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Slug: {org.slug} · Erstellt: {format(new Date(org.created_at), "dd.MM.yyyy", { locale: de })}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Users className="h-3.5 w-3.5" />
                  {userCount} {userCount === 1 ? "User" : "User"}
                </div>
              </div>

              {/* Feature Flags Übersicht */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                    <Settings2 className="h-3 w-3" />
                    Features
                  </p>
                  <Link
                    href={`/super-admin/${org.id}`}
                    className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
                  >
                    Bearbeiten →
                  </Link>
                </div>
                <div className="flex flex-wrap gap-2">
                  {AVAILABLE_FEATURES.map((f) => {
                    const active = activeFeatures.includes(f.key);
                    return (
                      <span
                        key={f.key}
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          active
                            ? "bg-emerald-500/15 text-emerald-400"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {active ? "✓" : "○"} {f.label}
                      </span>
                    );
                  })}
                  {AVAILABLE_FEATURES.length === 0 && (
                    <span className="text-xs text-muted-foreground italic">Keine Features definiert</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
