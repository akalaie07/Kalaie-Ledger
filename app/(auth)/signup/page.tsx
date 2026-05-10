import type { Metadata } from "next";

import { SignupForm } from "./_components/signup-form";

export const metadata: Metadata = {
  title: "Organisation registrieren — Buchhaltung",
};

export default function SignupPage() {
  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-foreground">Organisation erstellen</h2>
        <p className="text-sm text-muted-foreground">
          Erstelle dein Team-Konto. Du wirst automatisch Admin.
        </p>
      </div>
      <SignupForm />
    </div>
  );
}
