import type { EmailOtpType } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Verifiziert den Passwort-Reset-Link und setzt die (temporäre) Recovery-Session.
//
// Bevorzugt den token_hash-Flow (verifyOtp): stateless, funktioniert auch
// geräteübergreifend (E-Mail auf dem Handy geöffnet, Reset am PC angefordert).
// Der PKCE-code-Flow bleibt als Fallback erhalten, falls das E-Mail-Template
// noch {{ .ConfirmationURL }} nutzt.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = (searchParams.get("type") ?? "recovery") as EmailOtpType;
  const code = searchParams.get("code");

  const successResponse = NextResponse.redirect(`${origin}/passwort-aendern`);
  const errorResponse = NextResponse.redirect(`${origin}/login?error=link_abgelaufen`);

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

  if (tokenHash) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });
    return error ? errorResponse : successResponse;
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    return error ? errorResponse : successResponse;
  }

  return errorResponse;
}
