"use client";

import { useTransition } from "react";
import { ShieldAlert } from "lucide-react";
import { setDealEscalation } from "@/lib/actions/deals";

export function MahnungEscalateButton({ dealId }: { dealId: string }) {
  const [pending, startTransition] = useTransition();

  function handleEscalate() {
    if (!confirm("Deal zu Inkasso eskalieren?")) return;
    startTransition(async () => {
      await setDealEscalation(dealId, true, true);
    });
  }

  return (
    <button
      onClick={handleEscalate}
      disabled={pending}
      title="Zu Inkasso eskalieren"
      className="rounded p-1 text-rose-400 hover:bg-rose-500/10 transition-colors disabled:opacity-50"
    >
      {pending
        ? <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border border-current border-t-transparent" />
        : <ShieldAlert className="h-3.5 w-3.5" />}
    </button>
  );
}
