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
    // Auth session exists but no app profile found yet (e.g. trigger still
    // running, or new signup flow). Do NOT sign out here — signing out would
    // clear the valid Supabase session and force the user back to login,
    // creating an endless /login → / → /login loop. Just redirect to login
    // so the user can choose what to do.
    redirect("/login");
  }

  redirect("/deals");
}
