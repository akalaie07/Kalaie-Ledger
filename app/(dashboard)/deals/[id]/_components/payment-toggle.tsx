"use client";

import { useState, useTransition } from "react";
import { Check, X } from "lucide-react";

import { markInstallmentPaid, markOneTimePaid } from "@/lib/actions/deals";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Installment row toggle
// ---------------------------------------------------------------------------

interface InstallmentToggleProps {
  installmentId: string;
  dealId: string;
  paid: boolean;
}

export function InstallmentToggle({ installmentId, dealId, paid }: InstallmentToggleProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleToggle() {
    setError(null);
    startTransition(async () => {
      const res = await markInstallmentPaid(installmentId, dealId, !paid);
      if (res?.error) setError(res.error);
    });
  }

  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <button
        onClick={handleToggle}
        disabled={pending}
        title={paid ? "Als offen markieren" : "Als bezahlt markieren"}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-all",
          "disabled:opacity-50 cursor-pointer hover:ring-2 hover:ring-offset-1",
          paid
            ? "bg-emerald-500/15 text-emerald-400 hover:ring-emerald-500/40"
            : "bg-muted text-muted-foreground hover:ring-border",
        )}
      >
        {pending ? (
          <span className="inline-block h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
        ) : paid ? (
          <Check className="h-3 w-3" />
        ) : (
          <X className="h-3 w-3" />
        )}
        {paid ? "Bezahlt" : "Offen"}
      </button>
      {error && <span className="text-xs text-destructive px-1">{error}</span>}
    </span>
  );
}

// ---------------------------------------------------------------------------
// One-time payment toggle
// ---------------------------------------------------------------------------

interface OneTimeToggleProps {
  dealId: string;
  paid: boolean;
}

export function OneTimeToggle({ dealId, paid }: OneTimeToggleProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleToggle() {
    setError(null);
    startTransition(async () => {
      const res = await markOneTimePaid(dealId, !paid);
      if (res?.error) setError(res.error);
    });
  }

  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <button
        onClick={handleToggle}
        disabled={pending}
        title={paid ? "Als offen markieren" : "Als bezahlt markieren"}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-all",
          "disabled:opacity-50 cursor-pointer hover:ring-2 hover:ring-offset-1",
          paid
            ? "bg-emerald-500/15 text-emerald-400 hover:ring-emerald-500/40"
            : "bg-muted text-muted-foreground hover:ring-border",
        )}
      >
        {pending ? (
          <span className="inline-block h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
        ) : paid ? (
          <Check className="h-3 w-3" />
        ) : (
          <X className="h-3 w-3" />
        )}
        {paid ? "Bezahlt" : "Offen"}
      </button>
      {error && <span className="text-xs text-destructive px-1">{error}</span>}
    </span>
  );
}
