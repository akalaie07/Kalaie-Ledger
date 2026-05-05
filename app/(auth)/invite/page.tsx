import type { Metadata } from "next";

import { createAdminClient } from "@/lib/supabase/admin";

import { InviteForm } from "./_components/invite-form";

export const metadata: Metadata = { title: "Einladung annehmen — Buchhaltung" };

interface InviteRow {
  id: string;
  email: string;
  role: string;
  organization_id: string;
  organizations: { name: string } | { name: string }[] | null;
}

function resolveOrgName(row: InviteRow): string {
  const orgs = row.organizations;
  if (!orgs) return "";
  if (Array.isArray(orgs)) return orgs[0]?.name ?? "";
  return (orgs as { name: string }).name;
}

export default async function InvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token) {
    return <ErrorCard message="Kein Einladungstoken angegeben." />;
  }

  const supabase = createAdminClient();
  const { data: invite } = await supabase
    .from("organization_invites")
    .select("id, email, role, organization_id, organizations(name)")
    .eq("token", token)
    .is("accepted_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (!invite) {
    return <ErrorCard message="Einladung ungültig oder abgelaufen." />;
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1 text-center">
        <h2 className="text-xl font-semibold">Einladung annehmen</h2>
        <p className="text-sm text-muted-foreground">
          Erstelle dein Konto, um dem Team beizutreten.
        </p>
      </div>
      <InviteForm
        email={invite.email}
        role={invite.role}
        organizationId={invite.organization_id}
        organizationName={resolveOrgName(invite as InviteRow)}
      />
    </div>
  );
}

function ErrorCard({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-5 py-6 text-center">
      <p className="text-sm text-destructive">{message}</p>
    </div>
  );
}
