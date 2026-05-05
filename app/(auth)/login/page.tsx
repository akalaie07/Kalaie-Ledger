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
    <div className="space-y-4">
      <div className="space-y-1 text-center">
        <h2 className="text-xl font-semibold">Anmelden</h2>
      </div>

      {error === "auth_callback_failed" && (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Bestätigungslink ungültig oder abgelaufen. Bitte erneut anmelden.
        </p>
      )}

      <LoginForm next={next} />
    </div>
  );
}
