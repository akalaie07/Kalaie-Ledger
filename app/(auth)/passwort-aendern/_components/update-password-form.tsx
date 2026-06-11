"use client";

import { useActionState } from "react";
import Link from "next/link";

import { updatePassword, type AuthFormState } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function UpdatePasswordForm() {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(
    updatePassword,
    null,
  );

  return (
    <form action={action} className="space-y-4">
      {state?.error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <p>{state.error}</p>
          <p className="mt-1">
            <Link
              href="/passwort-vergessen"
              className="text-foreground underline underline-offset-4 hover:no-underline"
            >
              Neuen Link anfordern
            </Link>
          </p>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="password">Neues Passwort</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          aria-invalid={!!state?.fieldErrors?.password}
        />
        <p className="text-xs text-muted-foreground">
          Mind. 8 Zeichen, mit Buchstabe und Zahl.
        </p>
        {state?.fieldErrors?.password?.[0] && (
          <p className="text-xs text-destructive">{state.fieldErrors.password[0]}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password_confirm">Passwort wiederholen</Label>
        <Input
          id="password_confirm"
          name="password_confirm"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          aria-invalid={!!state?.fieldErrors?.password_confirm}
        />
        {state?.fieldErrors?.password_confirm?.[0] && (
          <p className="text-xs text-destructive">
            {state.fieldErrors.password_confirm[0]}
          </p>
        )}
      </div>

      <Button type="submit" className="w-full" size="lg" disabled={pending}>
        {pending ? "Speichere…" : "Passwort speichern"}
      </Button>
    </form>
  );
}
