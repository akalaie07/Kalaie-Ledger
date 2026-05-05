import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getCurrentSession } from "@/lib/auth/get-current-org";

export default async function RootPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const session = await getCurrentSession();
  if (!session) {
    // Auth session exists but no app profile found — sign out to clear the
    // stale cookie so the proxy no longer treats this request as authenticated,
    // breaking the otherwise infinite /login → / → /login redirect loop.
    await supabase.auth.signOut();
    redirect("/login");
  }

  redirect("/deals");
}
