import type { Metadata } from "next";

import { UpdatePasswordForm } from "./_components/update-password-form";

export const metadata: Metadata = { title: "Neues Passwort — Kalaie Ledger" };

export default function UpdatePasswordPage() {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Neues Passwort festlegen</h2>
        <p className="text-sm text-muted-foreground">
          Wähle ein neues Passwort für dein Konto.
        </p>
      </div>
      <UpdatePasswordForm />
    </div>
  );
}
