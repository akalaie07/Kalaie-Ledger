import type { EmailOtpType } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const OTP_TYPES = new Set<EmailOtpType>([
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
]);

function safeNextPath(next: string | null): string {
  return next?.startsWith("/") && !next.startsWith("//") && next !== "/"
    ? next
    : "/deals";
}

// Handles Supabase email-confirmation, recovery, and OAuth redirects.
// Session-Cookies werden direkt auf die Redirect-Response gesetzt — sonst
// gehen sie verloren (next/headers cookies() propagieren nicht auf eine
// neu erzeugte NextResponse.redirect()).
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const safeNext = safeNextPath(searchParams.get("next"));

  const successResponse = NextResponse.redirect(`${origin}${safeNext}`);
  const errorResponse = NextResponse.redirect(
    `${origin}/login?error=auth_callback_failed`,
  );

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value, options } of cookiesToSet) {
            request.cookies.set(name, value);
            successResponse.cookies.set(name, value, options);
            errorResponse.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return successResponse;
  }

  if (tokenHash && type && OTP_TYPES.has(type as EmailOtpType)) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as EmailOtpType,
    });
    if (!error) return successResponse;
  }

  return errorResponse;
}
