"use client";

import { useActionState } from "react";
import Link from "next/link";

import { signIn, type AuthFormState } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(
    signIn,
    null,
  );

  return (
    <form action={action} className="space-y-4">
      {next && <input type="hidden" name="next" value={next} />}

      {state?.error && (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
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

      <Button type="submit" className="w-full" size="lg" disabled={pending}>
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
