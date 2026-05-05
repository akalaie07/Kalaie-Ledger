"use client";

import { useActionState } from "react";
import Link from "next/link";

import { signUpViaInvite, type AuthFormState } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface InviteFormProps {
  email: string;
  role: string;
  organizationId: string;
  organizationName: string;
}

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrator",
  closer: "Closer",
  sales_partner: "Vertriebspartner",
};

export function InviteForm({
  email,
  role,
  organizationId,
  organizationName,
}: InviteFormProps) {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(
    signUpViaInvite,
    null,
  );

  if (state?.message) {
    return (
      <div className="rounded-lg border border-border bg-card px-5 py-6 text-center space-y-2">
        <p className="text-sm font-medium text-foreground">{state.message}</p>
        <p className="text-xs text-muted-foreground">
          Nach der Bestätigung kannst du dich{" "}
          <Link href="/login" className="text-foreground underline-offset-4 hover:underline">
            anmelden
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="email" value={email} />
      <input type="hidden" name="invited_organization_id" value={organizationId} />

      <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm space-y-1">
        <p className="text-muted-foreground">
          Einladung von <span className="font-medium text-foreground">{organizationName}</span>
        </p>
        <p className="text-muted-foreground">
          Rolle: <span className="font-medium text-foreground">{ROLE_LABELS[role] ?? role}</span>
        </p>
      </div>

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
        <Label htmlFor="email_display">E-Mail</Label>
        <Input
          id="email_display"
          type="email"
          value={email}
          readOnly
          disabled
          className="cursor-not-allowed"
        />
        <p className="text-xs text-muted-foreground">
          Die E-Mail-Adresse ist durch die Einladung festgelegt.
        </p>
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

      <Button type="submit" className="w-full" size="lg" disabled={pending}>
        {pending ? "Konto erstellen…" : "Einladung annehmen"}
      </Button>
    </form>
  );
}
