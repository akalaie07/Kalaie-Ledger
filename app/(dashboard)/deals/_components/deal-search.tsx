"use client";

import { useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Search } from "lucide-react";

export function DealSearch({
  filter,
  platform,
  defaultValue,
}: {
  filter: string;
  platform?: string;
  defaultValue?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    clearTimeout(timer.current);
    const val = e.target.value;
    timer.current = setTimeout(() => {
      const p = new URLSearchParams();
      if (filter !== "alle") p.set("filter", filter);
      if (platform) p.set("platform", platform);
      if (val.trim()) p.set("q", val.trim());
      const qs = p.toString();
      router.push(`${pathname}${qs ? `?${qs}` : ""}`);
    }, 300);
  }

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
      <input
        type="search"
        placeholder="Kunde, Bestell-ID, Produkt…"
        defaultValue={defaultValue}
        onChange={handleChange}
        className="h-8 w-60 rounded-md border border-input bg-transparent pl-8 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      />
    </div>
  );
}
