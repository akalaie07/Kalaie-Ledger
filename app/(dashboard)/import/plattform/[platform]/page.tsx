import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { requireRole } from "@/lib/auth/get-current-org";
import { PlatformImportWizard } from "@/app/(dashboard)/import/_components/platform-import-wizard";
import type { SupportedPlatform } from "@/app/(dashboard)/import/_components/platform-import-wizard";

const PLATFORM_NAMES: Record<SupportedPlatform, string> = {
  copecart: "Copecart",
  digistore: "Digistore24",
  ablefy: "Ablefy",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ platform: string }>;
}): Promise<Metadata> {
  const { platform } = await params;
  const name = PLATFORM_NAMES[platform as SupportedPlatform] ?? platform;
  return { title: `${name}-Import — Kalaie Ledger` };
}

export default async function PlatformImportPage({
  params,
}: {
  params: Promise<{ platform: string }>;
}) {
  await requireRole("admin");
  const { platform } = await params;

  if (!["copecart", "digistore", "ablefy"].includes(platform)) {
    notFound();
  }

  const supportedPlatform = platform as SupportedPlatform;
  const name = PLATFORM_NAMES[supportedPlatform];

  return (
    <div className="mx-auto max-w-4xl px-6 py-8 space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/import/plattform"
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-xl font-semibold">{name}-Import</h1>
          <p className="text-sm text-muted-foreground">
            CSV hochladen → Vorschau prüfen → Importieren
          </p>
        </div>
      </div>

      <PlatformImportWizard platform={supportedPlatform} />
    </div>
  );
}
