import Link from "next/link";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "mahnung", label: "Mahnung", href: "/forderungsmanagement/mahnung" },
  { key: "inkasso", label: "Inkasso", href: "/forderungsmanagement/inkasso" },
] as const;

export function ForderungsNav({ active }: { active: "mahnung" | "inkasso" }) {
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
