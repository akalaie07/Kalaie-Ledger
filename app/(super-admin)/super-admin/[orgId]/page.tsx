import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { createServiceClient } from "@/lib/supabase/service";
import { getCurrentSession } from "@/lib/auth/get-current-org";
import { toggleOrgFeature } from "@/lib/actions/super-admin";
import { AVAILABLE_FEATURES } from "@/lib/features";
import { ResetDataButton } from "./_components/reset-data-button";

export const metadata: Metadata = { title: "Feature-Flags — Super-Admin" };

export default async function OrgFeaturesPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const session = await getCurrentSession();
  if (!session?.isSuperAdmin) notFound();

  const supabase = createServiceClient();
  const { data: org } = await supabase
    .from("organizations")
    .select("id, name, slug, settings")
    .eq("id", orgId)
    .single();

  if (!org) notFound();

  const settings = (org.settings as { features?: string[] }) ?? {};
  const activeFeatures: string[] = settings.features ?? [];

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Back */}
      <Link
        href="/super-admin"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Zurück zur Übersicht
      </Link>

      <div>
        <h1 className="text-xl font-semibold">{org.name}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Slug: {org.slug} · Feature-Flags verwalten
        </p>
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <div className="border-b border-border bg-muted/40 px-4 py-3">
          <p className="text-sm font-medium">Verfügbare Features</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Aktiviere oder deaktiviere Features für diese Organisation.
          </p>
        </div>

        <div className="divide-y divide-border">
          {AVAILABLE_FEATURES.map((feature) => {
            const isActive = activeFeatures.includes(feature.key);

            return (
              <div key={feature.key} className="flex items-center justify-between px-4 py-4">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">{feature.label}</p>
                  <p className="text-xs text-muted-foreground">{feature.description}</p>
                  <p className="text-xs text-muted-foreground/60 font-mono">{feature.key}</p>
                </div>

                <form
                  action={async () => {
                    "use server";
                    await toggleOrgFeature(orgId, feature.key, !isActive);
                  }}
                >
                  <button
                    type="submit"
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                      isActive ? "bg-emerald-500" : "bg-muted"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                        isActive ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                    <span className="sr-only">
                      {isActive ? "Deaktivieren" : "Aktivieren"}
                    </span>
                  </button>
                </form>
              </div>
            );
          })}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Änderungen werden sofort wirksam — betroffene User müssen die Seite neu laden.
      </p>

      {/* ── Gefahrenzone ── */}
      <div className="rounded-lg border border-red-900/40 overflow-hidden">
        <div className="border-b border-red-900/30 bg-red-900/10 px-4 py-3">
          <p className="text-sm font-medium text-red-400">Gefahrenzone</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Unwiderrufliche Aktionen für diese Organisation.
          </p>
        </div>
        <div className="px-4 py-4 flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <p className="text-sm font-medium">Alle Daten zurücksetzen</p>
            <p className="text-xs text-muted-foreground">
              Löscht alle Deals, Raten, Zahlungen und Import-Daten. Produkte, Plattformen und User bleiben erhalten.
            </p>
          </div>
          <ResetDataButton orgId={org.id} orgName={org.name} />
        </div>
      </div>
    </div>
  );
}
