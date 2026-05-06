"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  FileText,
  Settings,
  LogOut,
  Building2,
  AlertTriangle,
  BarChart2,
  Upload,
  Users,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { signOut } from "@/lib/actions/auth";

type Role = "admin" | "closer" | "sales_partner";

interface SidebarProps {
  orgName: string;
  fullName: string | null;
  email: string;
  role: Role;
}

const navItems = [
  {
    href: "/deals",
    label: "Deals",
    icon: FileText,
    roles: ["admin", "closer", "sales_partner"] as Role[],
  },
  {
    href: "/inkasso",
    label: "Inkasso",
    icon: AlertTriangle,
    roles: ["admin"] as Role[],
  },
  {
    href: "/berichte",
    label: "Berichte",
    icon: BarChart2,
    roles: ["admin"] as Role[],
  },
  {
    href: "/import",
    label: "Importieren",
    icon: Upload,
    roles: ["admin"] as Role[],
  },
  {
    href: "/einstellungen/benutzer",
    label: "Benutzer",
    icon: Users,
    roles: ["admin"] as Role[],
  },
  {
    href: "/einstellungen/stammdaten",
    label: "Stammdaten",
    icon: Settings,
    roles: ["admin"] as Role[],
  },
];

function NavLink({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: React.ElementType;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {label}
    </Link>
  );
}

export function Sidebar({ orgName, fullName, email, role }: SidebarProps) {
  const pathname = usePathname();

  const visible = navItems.filter((item) => item.roles.includes(role));

  return (
    <aside className="flex h-full w-56 shrink-0 flex-col border-r border-border bg-card">
      <div className="flex h-14 items-center gap-2.5 border-b border-border px-4">
        <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="truncate text-sm font-semibold">{orgName}</span>
      </div>

      <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {visible.map((item) => (
          <NavLink
            key={item.href}
            href={item.href}
            label={item.label}
            icon={item.icon}
            active={
              pathname === item.href || pathname.startsWith(item.href + "/")
            }
          />
        ))}
      </nav>

      <div className="border-t border-border p-2">
        <div className="mb-1 px-3 py-1.5">
          <p className="truncate text-xs font-medium">
            {fullName ?? email}
          </p>
          {fullName && (
            <p className="truncate text-xs text-muted-foreground">{email}</p>
          )}
        </div>
        <form action={signOut}>
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent/50 hover:text-accent-foreground"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            Abmelden
          </button>
        </form>
      </div>
    </aside>
  );
}
