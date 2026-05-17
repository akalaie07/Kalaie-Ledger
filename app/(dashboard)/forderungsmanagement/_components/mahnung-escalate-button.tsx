"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { setDealEscalation } from "@/lib/actions/deals";

export function MahnungEscalateButton({ dealId }: { dealId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleEscalate() {
    if (!confirm("Deal zu Inkasso eskalieren?")) return;
    setError(null);
    startTransition(async () => {
      const res = await setDealEscalation(dealId, true, true);
      if (res?.error) {
        setError(res.error);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <span className="inline-flex flex-col items-end gap-0.5">
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
      {error && <span className="text-xs text-destructive whitespace-nowrap">{error}</span>}
    </span>
  );
}
