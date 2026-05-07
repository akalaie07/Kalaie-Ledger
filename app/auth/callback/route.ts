import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

// Handles Supabase email-confirmation and OAuth redirects.
// Supabase sends the user here with a ?code= query parameter after they
// click the confirmation link.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Validate the redirect target to prevent open redirects.
      // Default "/" would hit app/page.tsx which just re-redirects to /deals
      // anyway — go straight there to avoid the extra round-trip.
      const safeNext =
        next.startsWith("/") && !next.startsWith("//") && next !== "/"
          ? next
          : "/deals";
      return NextResponse.redirect(`${origin}${safeNext}`);
    }
  }

  return NextResponse.redirect(
    `${origin}/login?error=auth_callback_failed`,
  );
}
