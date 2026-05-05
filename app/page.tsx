import { redirect } from "next/navigation";

import { getCurrentSession } from "@/lib/auth/get-current-org";

export default async function RootPage() {
  const session = await getCurrentSession();
  redirect(session ? "/deals" : "/login");
}
