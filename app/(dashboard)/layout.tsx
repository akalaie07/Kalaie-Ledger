import { requireSession } from "@/lib/auth/get-current-org";
import { Sidebar } from "@/components/layout/sidebar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession();

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        orgName={session.organizationName}
        fullName={session.fullName}
        email={session.email}
        role={session.role}
      />
      <main className="flex-1 overflow-y-auto bg-background">{children}</main>
    </div>
  );
}
