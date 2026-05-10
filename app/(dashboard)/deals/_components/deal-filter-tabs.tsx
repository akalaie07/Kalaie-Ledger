import Link from "next/link";
import { cn } from "@/lib/utils";

type Tab = { key: string; label: string };

const TABS: Tab[] = [
  { key: "alle", label: "Alle" },
  { key: "msm", label: "MSM" },
  { key: "mcc", label: "MCC" },
];

export function DealFilterTabs({
  active,
  counts,
}: {
  active: string;
  counts: Record<string, number>;
}) {
  return (
    <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/20 p-1 w-fit">
      {TABS.map((tab) => (
        <Link
          key={tab.key}
          href={tab.key === "alle" ? "/deals" : `/deals?filter=${tab.key}`}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            active === tab.key
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {tab.label}
          <span className="ml-1.5 text-xs tabular-nums opacity-60">
            {counts[tab.key] ?? 0}
          </span>
        </Link>
      ))}
    </div>
  );
}
