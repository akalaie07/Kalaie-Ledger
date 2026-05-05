import "server-only";

import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/types/database";

// Service-role client — bypasses RLS. Only used server-side for admin tasks
// (invite lookups, seeding). Never expose the service role key to the client.
export function createAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
