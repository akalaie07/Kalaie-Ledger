"use client";

import { useActionState, useRef, useState } from "react";
import Link from "next/link";
import HCaptcha from "@hcaptcha/react-hcaptcha";

import { signIn, resendConfirmationEmail, type AuthFormState } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function ResendConfirmationForm({ email }: { email: string }) {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(
    resendConfirmationEmail,
    null,
  );

  if (state?.message) {
    return (
      <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400">
        {state.message}
      </div>
    );
  }

  return (
    <form action={action} className="mt-2">
      <input type="hidden" name="email" value={email} />
      {state?.error && (
        <p className="mb-2 text-xs text-destructive">{state.error}</p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="text-sm text-foreground underline underline-offset-4 hover:no-underline disabled:opacity-50"
      >
        {pending ? "Sende…" : "Bestätigungs-E-Mail erneut senden"}
      </button>
    </form>
  );
}

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(
    signIn,
    null,
  );
  const [captchaToken, setCaptchaToken] = useState("");
  const captchaRef = useRef<HCaptcha>(null);

  return (
    <form action={action} className="space-y-4" onSubmit={() => captchaRef.current?.resetCaptcha()}>
      {next && <input type="hidden" name="next" value={next} />}
      <input type="hidden" name="h-captcha-response" value={captchaToken} />

      {state?.error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <p>{state.error}</p>
          {state.needsEmailConfirmation && state.unconfirmedEmail && (
            <ResendConfirmationForm email={state.unconfirmedEmail} />
          )}
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="email">E-Mail</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          aria-invalid={!!state?.fieldErrors?.email}
        />
        {state?.fieldErrors?.email?.[0] && (
          <p className="text-xs text-destructive">
            {state.fieldErrors.email[0]}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password">Passwort</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={!!state?.fieldErrors?.password}
        />
        {state?.fieldErrors?.password?.[0] && (
          <p className="text-xs text-destructive">
            {state.fieldErrors.password[0]}
          </p>
        )}
      </div>

      <HCaptcha
        ref={captchaRef}
        sitekey={process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY ?? "9a52edde-fb70-4c8c-8a32-c2742e421cd0"}
        onVerify={setCaptchaToken}
        onExpire={() => setCaptchaToken("")}
        theme="dark"
      />

      <Button type="submit" className="w-full" size="lg" disabled={pending || !captchaToken}>
        {pending ? "Anmelden…" : "Anmelden"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Noch kein Konto?{" "}
        <Link href="/signup" className="text-foreground underline-offset-4 hover:underline">
          Organisation registrieren
        </Link>
      </p>
    </form>
  );
}
