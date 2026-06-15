import { requireSession } from "@/lib/auth/get-current-org";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/layout/sidebar";
import { PresenceTracker } from "@/components/presence-tracker";
import { UpdateNotifier } from "@/components/update-notifier";
import { WhatsNewBanner } from "@/components/whats-new-banner";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession();
  const supabase = await createClient();

  // Begleitungen, die in ≤ 14 Tagen auslaufen oder schon abgelaufen sind
  const todayIso = new Date().toISOString().slice(0, 10);
  const coachingHorizon = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const [{ data: members }, coachingResult, formerResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, email, role, last_seen_at")
      .eq("organization_id", session.organizationId)
      .order("full_name"),
    supabase
      .from("deals")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", session.organizationId)
      .eq("coaching_done", false)
      .eq("storniert", false)
      .not("coaching_until", "is", null)
      .lte("coaching_until", coachingHorizon),
    supabase
      .from("deals")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", session.organizationId)
      .eq("storniert", false)
      .not("coaching_until", "is", null)
      .lt("coaching_until", todayIso),
  ]);

  // Resilient: falls die Migration noch nicht eingespielt ist → 0 statt Crash
  const coachingCount = coachingResult.error ? 0 : coachingResult.count ?? 0;
  const formerCount = formerResult.error ? 0 : formerResult.count ?? 0;

  return (
    <div className="flex h-screen overflow-hidden">
      <PresenceTracker userId={session.userId} />
      <UpdateNotifier />
      <Sidebar
        orgName={session.organizationName}
        fullName={session.fullName}
        email={session.email}
        role={session.role}
        currentUserId={session.userId}
        organizationId={session.organizationId}
        initialMembers={members ?? []}
        coachingCount={coachingCount}
        formerCount={formerCount}
      />
      <main className="flex-1 overflow-y-auto bg-background">
        <WhatsNewBanner />
        {children}
      </main>
    </div>
  );
}
