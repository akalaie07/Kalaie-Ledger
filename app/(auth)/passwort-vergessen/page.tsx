import type { Metadata } from "next";

import { ForgotPasswordForm } from "./_components/forgot-password-form";

export const metadata: Metadata = { title: "Passwort vergessen — Kalaie Ledger" };

export default function ForgotPasswordPage() {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Passwort vergessen</h2>
        <p className="text-sm text-muted-foreground">
          Gib deine E-Mail-Adresse ein. Wir schicken dir einen Link, mit dem du
          ein neues Passwort festlegen kannst.
        </p>
      </div>
      <ForgotPasswordForm />
    </div>
  );
}
