"use client";

import { useActionState, useRef, useState } from "react";
import Link from "next/link";
import HCaptcha from "@hcaptcha/react-hcaptcha";

import { signUp, type AuthFormState } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SignupForm() {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(
    signUp,
    null,
  );
  const [captchaToken, setCaptchaToken] = useState("");
  const captchaRef = useRef<HCaptcha>(null);

  if (state?.message) {
    return (
      <div className="rounded-lg border border-border bg-card px-5 py-6 text-center space-y-2">
        <p className="text-sm font-medium text-foreground">{state.message}</p>
        <p className="text-xs text-muted-foreground">
          Nach der Bestätigung kannst du dich direkt{" "}
          {/* Hard-reload statt client-side navigation — vermeidet Session-Cache-Bug */}
          <a href="/login" className="text-foreground underline-offset-4 hover:underline">
            anmelden
          </a>
          .
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4" onSubmit={() => captchaRef.current?.resetCaptcha()}>
      <input type="hidden" name="h-captcha-response" value={captchaToken} />
      {state?.error && (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="full_name">Vollständiger Name</Label>
        <Input
          id="full_name"
          name="full_name"
          type="text"
          autoComplete="name"
          required
          aria-invalid={!!state?.fieldErrors?.full_name}
        />
        {state?.fieldErrors?.full_name?.[0] && (
          <p className="text-xs text-destructive">
            {state.fieldErrors.full_name[0]}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="organization_name">Organisationsname</Label>
        <Input
          id="organization_name"
          name="organization_name"
          type="text"
          required
          aria-invalid={!!state?.fieldErrors?.organization_name}
        />
        {state?.fieldErrors?.organization_name?.[0] && (
          <p className="text-xs text-destructive">
            {state.fieldErrors.organization_name[0]}
          </p>
        )}
      </div>

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
          autoComplete="new-password"
          required
          aria-invalid={!!state?.fieldErrors?.password}
        />
        {state?.fieldErrors?.password && (
          <ul className="space-y-0.5">
            {state.fieldErrors.password.map((e) => (
              <li key={e} className="text-xs text-destructive">
                {e}
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">
          Min. 8 Zeichen, ein Buchstabe und eine Zahl.
        </p>
      </div>

      <HCaptcha
        ref={captchaRef}
        sitekey={process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY!}
        onVerify={setCaptchaToken}
        onExpire={() => setCaptchaToken("")}
        theme="dark"
      />

      <Button type="submit" className="w-full" size="lg" disabled={pending || !captchaToken}>
        {pending ? "Registrieren…" : "Organisation registrieren"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Bereits ein Konto?{" "}
        <Link href="/login" className="text-foreground underline-offset-4 hover:underline">
          Anmelden
        </Link>
      </p>
    </form>
  );
}
