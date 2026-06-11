"use client";

import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

export function ViewToggle({ view }: { view: "monthly" | "yearly" }) {
  const router = useRouter();
  // Pfadrelativ wechseln — die Komponente wird sowohl unter /berichte als auch
  // unter /analyse/berichte verwendet und darf die Seite nicht wechseln.
  const pathname = usePathname();

  return (
    <div className="flex rounded-md border border-border overflow-hidden text-sm">
      <button
        type="button"
        onClick={() => router.push(`${pathname}?view=monthly`)}
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
        onClick={() => router.push(`${pathname}?view=yearly`)}
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
