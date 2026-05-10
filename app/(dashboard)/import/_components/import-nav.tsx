import Link from "next/link";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "deals", label: "Deals importieren", href: "/import/deals" },
  { key: "zahlungsabgleich", label: "Zahlungsabgleich", href: "/import/zahlungsabgleich" },
] as const;

export function ImportNav({ active }: { active: "deals" | "zahlungsabgleich" }) {
  return (
    <div className="flex gap-1 border-b border-border">
      {TABS.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          className={cn(
            "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
            active === tab.key
              ? "border-foreground text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
