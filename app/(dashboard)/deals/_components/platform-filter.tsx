"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Building2 } from "lucide-react";

export function PlatformFilter({
  platforms,
  active,
}: {
  platforms: string[];
  active: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value;
    const p = new URLSearchParams(searchParams.toString());
    if (val) {
      p.set("platform", val);
    } else {
      p.delete("platform");
    }
    router.push(`${pathname}?${p.toString()}`);
  }

  return (
    <div className="relative">
      <Building2 className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
      <select
        value={active}
        onChange={handleChange}
        className="h-8 rounded-md border border-input bg-transparent pl-8 pr-7 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring appearance-none cursor-pointer"
      >
        <option value="">Alle Plattformen</option>
        {platforms.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
    </div>
  );
}
