import Link from "next/link";
import { cn } from "@/lib/utils";

const MSM_SUB_TABS = [
  { key: "msm_gold", label: "Gold" },
  { key: "msm_silber", label: "Silber" },
  { key: "msm_bronze", label: "Bronze" },
  { key: "msm_alt", label: "Alt" },
];

const MCC_SUB_TABS = [
  { key: "mcc_monatlich", label: "Monatlich" },
  { key: "mcc_jaehrlich", label: "Jährlich" },
];

function isMsmFilter(filter: string) {
  return filter === "msm" || filter === "msm_gold" || filter === "msm_silber" || filter === "msm_bronze" || filter === "msm_alt";
}

function isMccFilter(filter: string) {
  return filter === "mcc" || filter === "mcc_monatlich" || filter === "mcc_jaehrlich";
}

export function DealFilterTabs({
  active,
  counts,
  showProductFilter = false,
}: {
  active: string;
  counts: Record<string, number>;
  showProductFilter?: boolean;
}) {
  const mainTabs = [
    { key: "alle", label: "Alle" },
    ...(showProductFilter ? [{ key: "msm", label: "MSM" }, { key: "mcc", label: "MCC" }] : []),
  ];

  const showMsmSubs = showProductFilter && isMsmFilter(active);
  const showMccSubs = showProductFilter && isMccFilter(active);

  return (
    <div className="flex flex-col gap-1.5">
      {/* Main tabs */}
      <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/20 p-1 w-fit">
        {mainTabs.map((tab) => (
          <Link
            key={tab.key}
            href={tab.key === "alle" ? "/deals" : `/deals?filter=${tab.key}`}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              (active === tab.key) ||
              (tab.key === "msm" && isMsmFilter(active)) ||
              (tab.key === "mcc" && isMccFilter(active))
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

      {/* MSM sub-tabs */}
      {showMsmSubs && (
        <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/10 px-1 py-0.5 w-fit ml-px">
          <Link
            href="/deals?filter=msm"
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              active === "msm"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Alle MSM
            <span className="ml-1 tabular-nums opacity-60">{counts.msm ?? 0}</span>
          </Link>
          {MSM_SUB_TABS.map((sub) => (
            <Link
              key={sub.key}
              href={`/deals?filter=${sub.key}`}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                active === sub.key
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {sub.label}
              <span className="ml-1 tabular-nums opacity-60">{counts[sub.key] ?? 0}</span>
            </Link>
          ))}
        </div>
      )}

      {/* MCC sub-tabs */}
      {showMccSubs && (
        <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/10 px-1 py-0.5 w-fit ml-px">
          <Link
            href="/deals?filter=mcc"
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              active === "mcc"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Alle MCC
            <span className="ml-1 tabular-nums opacity-60">{counts.mcc ?? 0}</span>
          </Link>
          {MCC_SUB_TABS.map((sub) => (
            <Link
              key={sub.key}
              href={`/deals?filter=${sub.key}`}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                active === sub.key
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {sub.label}
              <span className="ml-1 tabular-nums opacity-60">{counts[sub.key] ?? 0}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
