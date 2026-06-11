"use client";

import { useActionState, useRef, useState } from "react";
import Link from "next/link";
import HCaptcha from "@hcaptcha/react-hcaptcha";

import { requestPasswordReset, type AuthFormState } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(
    requestPasswordReset,
    null,
  );
  const [captchaToken, setCaptchaToken] = useState("");
  const captchaRef = useRef<HCaptcha>(null);

  if (state?.message) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400">
          {state.message}
        </div>
        <p className="text-center text-sm text-muted-foreground">
          <Link href="/login" className="text-foreground underline-offset-4 hover:underline">
            Zurück zur Anmeldung
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4" onSubmit={() => captchaRef.current?.resetCaptcha()}>
      <input type="hidden" name="h-captcha-response" value={captchaToken} />

      {state?.error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
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
          <p className="text-xs text-destructive">{state.fieldErrors.email[0]}</p>
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
        {pending ? "Sende…" : "Link zum Zurücksetzen senden"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        <Link href="/login" className="text-foreground underline-offset-4 hover:underline">
          Zurück zur Anmeldung
        </Link>
      </p>
    </form>
  );
}
