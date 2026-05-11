"use client";

import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

export function ViewToggle({ view }: { view: "monthly" | "yearly" }) {
  const router = useRouter();

  return (
    <div className="flex rounded-md border border-border overflow-hidden text-sm">
      <button
        type="button"
        onClick={() => router.push("/berichte?view=monthly")}
        className={cn(
          "px-4 py-1.5 font-medium transition-colors",
          view === "monthly"
            ? "bg-accent text-accent-foreground"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        Monatlich
      </button>
      <button
        type="button"
        onClick={() => router.push("/berichte?view=yearly")}
        className={cn(
          "px-4 py-1.5 font-medium transition-colors border-l border-border",
          view === "yearly"
            ? "bg-accent text-accent-foreground"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        Jährlich
      </button>
    </div>
  );
}
