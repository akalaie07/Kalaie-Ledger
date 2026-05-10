import { notFound } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/get-current-org";

export default async function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getCurrentSession();

  // Nur der Plattform-Gründer (is_super_admin = true) hat Zugriff
  if (!session?.isSuperAdmin) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Super-Admin Header */}
      <header className="border-b border-border bg-muted/20 px-6 py-3">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center rounded-full bg-amber-500/20 px-2.5 py-0.5 text-xs font-semibold text-amber-400">
            ⚡ Super-Admin
          </span>
          <span className="text-sm text-muted-foreground">Kalaie Ledger — Gründer-Panel</span>
        </div>
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}
