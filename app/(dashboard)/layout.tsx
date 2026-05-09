import { requireSession } from "@/lib/auth/get-current-org";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/layout/sidebar";
import { PresenceTracker } from "@/components/presence-tracker";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession();
  const supabase = await createClient();

  const { data: members } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, last_seen_at")
    .eq("organization_id", session.organizationId)
    .order("full_name");

  return (
    <div className="flex h-screen overflow-hidden">
      <PresenceTracker userId={session.userId} />
      <Sidebar
        orgName={session.organizationName}
        fullName={session.fullName}
        email={session.email}
        role={session.role}
        currentUserId={session.userId}
        organizationId={session.organizationId}
        initialMembers={members ?? []}
      />
      <main className="flex-1 overflow-y-auto bg-background">{children}</main>
    </div>
  );
}
