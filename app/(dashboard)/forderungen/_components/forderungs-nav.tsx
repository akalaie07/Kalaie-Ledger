import Link from "next/link";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "mahnung", label: "Mahnungen", href: "/forderungen/mahnung" },
  { key: "inkasso", label: "Inkasso", href: "/forderungen/inkasso" },
  { key: "ueberfaellig", label: "Überfällig", href: "/forderungen/ueberfaellig" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export function ForderungsNav({ active }: { active: TabKey }) {
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
