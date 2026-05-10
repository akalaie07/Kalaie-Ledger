import type { Metadata } from "next";

import { LoginForm } from "./_components/login-form";

export const metadata: Metadata = { title: "Anmelden — Buchhaltung" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-foreground">Willkommen zurück</h2>
        <p className="text-sm text-muted-foreground">Melde dich mit deinem Konto an</p>
      </div>

      {error === "auth_callback_failed" && (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Bestätigungslink ungültig oder abgelaufen. Bitte erneut anmelden.
        </p>
      )}

      {error === "setup_failed" && (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Dein Konto konnte nicht vollständig eingerichtet werden. Bitte registriere dich erneut oder wende dich an den Support.
        </p>
      )}

      <LoginForm next={next} />
    </div>
  );
}
