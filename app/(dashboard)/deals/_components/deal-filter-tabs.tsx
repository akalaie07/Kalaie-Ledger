import Link from "next/link";
import { cn } from "@/lib/utils";

type Tab = { key: string; label: string };

const BASE_TABS: Tab[] = [{ key: "alle", label: "Alle" }];
const PRODUCT_TABS: Tab[] = [
  { key: "msm", label: "MSM" },
  { key: "mcc", label: "MCC" },
];

export function DealFilterTabs({
  active,
  counts,
  showProductFilter = false,
}: {
  active: string;
  counts: Record<string, number>;
  showProductFilter?: boolean;
}) {
  const tabs = showProductFilter ? [...BASE_TABS, ...PRODUCT_TABS] : BASE_TABS;

  return (
    <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/20 p-1 w-fit">
      {tabs.map((tab) => (
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
