import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Temporary debug endpoint — delete after login is fixed
export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  if (!url || !serviceKey) {
    return NextResponse.json({ error: "Missing env vars" }, { status: 500 });
  }

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1. Check trigger exists
  const { data: triggerData, error: triggerError } = await supabase
    .from("pg_trigger" as never)
    .select("*")
    .limit(1);

  // 2. Check users in auth
  const { data: users, error: usersError } = await supabase.auth.admin.listUsers();

  // 3. Check organizations
  const { data: orgs, error: orgsError } = await supabase
    .from("organizations")
    .select("id, name, created_at");

  // 4. Check profiles
  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, email, role, organization_id");

  // 5. Try to get trigger info via rpc-style query
  const triggerCheck = await fetch(
    `${url}/rest/v1/rpc/check_trigger_exists`,
    {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      method: "POST",
      body: JSON.stringify({}),
    },
  ).then((r) => r.json()).catch(() => null);

  return NextResponse.json({
    env: {
      hasUrl: !!url,
      hasServiceKey: !!serviceKey,
      url: url.replace(/https:\/\//, "").split(".")[0], // just the project ref
    },
    auth_users: {
      count: users?.users?.length ?? 0,
      users: users?.users?.map((u) => ({
        id: u.id,
        email: u.email,
        confirmed: !!u.email_confirmed_at,
        created: u.created_at,
        metadata: u.user_metadata,
      })) ?? [],
      error: usersError?.message ?? null,
    },
    organizations: {
      count: orgs?.length ?? 0,
      data: orgs ?? [],
      error: orgsError?.message ?? null,
    },
    profiles: {
      count: profiles?.length ?? 0,
      data: profiles ?? [],
      error: profilesError?.message ?? null,
    },
  });
}
