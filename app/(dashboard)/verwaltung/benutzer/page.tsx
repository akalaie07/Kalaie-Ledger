import type { Metadata } from "next";
import { format } from "date-fns";
import { de } from "date-fns/locale";

import { requireRole } from "@/lib/auth/get-current-org";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { InviteForm } from "@/app/(dashboard)/einstellungen/benutzer/_components/invite-form";
import { InviteRowActions } from "@/app/(dashboard)/einstellungen/benutzer/_components/invite-row-actions";

export const metadata: Metadata = { title: "Benutzerverwaltung — Kalaie Ledger" };

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  closer: "Closer",
  sales_partner: "Vertriebspartner",
};

const ROLE_CLASS: Record<string, string> = {
  admin: "bg-blue-500/15 text-blue-400",
  closer: "bg-purple-500/15 text-purple-400",
  sales_partner: "bg-amber-500/15 text-amber-400",
};

function isOnline(last_seen_at: string | null) {
  if (!last_seen_at) return false;
  return Date.now() - new Date(last_seen_at).getTime() < 2 * 60 * 1000;
}

export default async function BenutzerPage() {
  const session = await requireRole("admin");
  const supabase = await createClient();

  const [{ data: profiles }, { data: invites }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, email, full_name, role, created_at, last_seen_at")
      .eq("organization_id", session.organizationId)
      .order("created_at"),
    supabase
      .from("organization_invites")
      .select("id, email, role, token, expires_at, accepted_at")
      .eq("organization_id", session.organizationId)
      .is("accepted_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false }),
  ]);

  const users = profiles ?? [];
  const pendingInvites = invites ?? [];

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Benutzerverwaltung</h1>
        <p className="text-sm text-muted-foreground">
          {users.length} {users.length === 1 ? "Benutzer" : "Benutzer"} in deiner Organisation
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Mitglieder</h2>
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Name / E-Mail</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Rolle</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Beigetreten</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users.map((u) => {
                const online = isOnline(u.last_seen_at ?? null);
                return (
                  <tr key={u.id} className={cn("hover:bg-muted/20", u.id === session.userId && "bg-muted/10")}>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "inline-block h-2 w-2 rounded-full shrink-0",
                            online ? "bg-emerald-400" : "bg-muted-foreground/30",
                          )}
                          title={online ? "Online" : "Offline"}
                        />
                        <div>
                          <p className="font-medium">{u.full_name ?? u.email}</p>
                          {u.full_name && <p className="text-xs text-muted-foreground">{u.email}</p>}
                          {u.id === session.userId && (
                            <span className="text-[10px] text-muted-foreground">(Du)</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                        ROLE_CLASS[u.role] ?? "bg-muted text-muted-foreground",
                      )}>
                        {ROLE_LABEL[u.role] ?? u.role}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground tabular-nums">
                      {format(new Date(u.created_at), "dd.MM.yyyy", { locale: de })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {pendingInvites.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Offene Einladungen</h2>
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/40">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">E-Mail</th>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Rolle</th>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Läuft ab</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {pendingInvites.map((inv) => (
                  <tr key={inv.id} className="hover:bg-muted/20">
                    <td className="px-4 py-2.5">{inv.email}</td>
                    <td className="px-4 py-2.5">
                      <span className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                        ROLE_CLASS[inv.role] ?? "bg-muted text-muted-foreground",
                      )}>
                        {ROLE_LABEL[inv.role] ?? inv.role}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground tabular-nums">
                      {format(new Date(inv.expires_at), "dd.MM.yyyy", { locale: de })}
                    </td>
                    <td className="px-3 py-2.5">
                      <InviteRowActions token={inv.token} email={inv.email} role={inv.role} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Neuen Benutzer einladen</h2>
        <InviteForm />
      </section>
    </div>
  );
}
