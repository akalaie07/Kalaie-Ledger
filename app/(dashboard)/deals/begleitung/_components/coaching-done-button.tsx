"use client";

import { useTransition } from "react";
import { Check } from "lucide-react";

import { markCoachingDone } from "@/lib/actions/deals";
import { Button } from "@/components/ui/button";

export function CoachingDoneButton({ dealId }: { dealId: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() => startTransition(() => void markCoachingDone(dealId))}
    >
      <Check className="mr-1 h-3.5 w-3.5" />
      {pending ? "…" : "Erledigt"}
    </Button>
  );
}
