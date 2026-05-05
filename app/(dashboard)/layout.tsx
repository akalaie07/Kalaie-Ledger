import { requireSession } from "@/lib/auth/get-current-org";

// All routes inside (dashboard) require an authenticated session.
// requireSession() calls redirect('/login') when the session is missing,
// so unauthenticated requests are always sent to the login page.
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireSession();
  return <>{children}</>;
}
