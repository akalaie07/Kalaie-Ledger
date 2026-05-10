"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, useCallback, useRef } from "react";
import {
  FileText,
  Settings,
  LogOut,
  Building2,
  BarChart2,
  Upload,
  Users,
  MessageSquare,
  Bell,
  ChevronRight,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { signOut } from "@/lib/actions/auth";
import { SidebarMembers } from "./sidebar-members";

type Role = "admin" | "closer" | "sales_partner";

type Member = {
  id: string;
  full_name: string | null;
  email: string;
  role: string;
  last_seen_at: string | null;
};

interface SidebarProps {
  orgName: string;
  fullName: string | null;
  email: string;
  role: Role;
  currentUserId: string;
  organizationId: string;
  initialMembers: Member[];
}

type ChildItem = { href: string; label: string };

type NavItem = {
  href: string;
  label: string;
  icon: React.ElementType;
  roles: Role[];
  children?: ChildItem[];
};

const navItems: NavItem[] = [
  {
    href: "/deals",
    label: "Deals",
    icon: FileText,
    roles: ["admin", "closer", "sales_partner"],
  },
  {
    href: "/forderungsmanagement",
    label: "Forderungsmanagement",
    icon: Bell,
    roles: ["admin"],
    children: [
      { href: "/forderungsmanagement/mahnung", label: "Mahnung" },
      { href: "/forderungsmanagement/inkasso", label: "Inkasso" },
    ],
  },
  {
    href: "/berichte",
    label: "Berichte",
    icon: BarChart2,
    roles: ["admin"],
  },
  {
    href: "/import",
    label: "Importieren",
    icon: Upload,
    roles: ["admin"],
    children: [
      { href: "/import/deals", label: "Deals importieren" },
      { href: "/import/zahlungsabgleich", label: "Zahlungsabgleich" },
    ],
  },
  {
    href: "/chat",
    label: "Chat",
    icon: MessageSquare,
    roles: ["admin", "closer", "sales_partner"],
  },
  {
    href: "/einstellungen/benutzer",
    label: "Benutzer",
    icon: Users,
    roles: ["admin"],
  },
  {
    href: "/einstellungen/stammdaten",
    label: "Stammdaten",
    icon: Settings,
    roles: ["admin"],
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

function NavChildLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center rounded-md px-3 py-1.5 text-sm transition-colors",
        active
          ? "bg-accent text-accent-foreground font-medium"
          : "text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground",
      )}
    >
      {label}
    </Link>
  );
}

function NavGroup({
  label,
  icon: Icon,
  children,
  groupActive,
  pathname,
}: {
  label: string;
  icon: React.ElementType;
  children: ChildItem[];
  groupActive: boolean;
  pathname: string;
}) {
  const [open, setOpen] = useState(groupActive);

  return (
    <div className="space-y-0.5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
          groupActive
            ? "text-accent-foreground hover:bg-accent/50"
            : "text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground",
        )}
      >
        <Icon className="h-4 w-4 shrink-0" />
        <span className="flex-1 truncate text-left">{label}</span>
        <ChevronRight
          className={cn("h-3.5 w-3.5 shrink-0 transition-transform", open && "rotate-90")}
        />
      </button>
      {open && (
        <div className="ml-7 space-y-0.5 border-l border-border pl-3">
          {children.map((child) => (
            <NavChildLink
              key={child.href}
              href={child.href}
              label={child.label}
              active={pathname === child.href || pathname.startsWith(child.href + "/")}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const MIN_WIDTH = 180;
const MAX_WIDTH = 400;
const DEFAULT_WIDTH = 224;
const STORAGE_KEY = "sidebar-width";

export function Sidebar({ orgName, fullName, email, role, currentUserId, organizationId, initialMembers }: SidebarProps) {
  const pathname = usePathname();
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const isResizing = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) setWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, parseInt(saved, 10))));
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    startX.current = e.clientX;
    startWidth.current = width;

    const onMove = (ev: MouseEvent) => {
      if (!isResizing.current) return;
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth.current + ev.clientX - startX.current));
      setWidth(next);
    };

    const onUp = () => {
      isResizing.current = false;
      setWidth((prev) => { localStorage.setItem(STORAGE_KEY, String(prev)); return prev; });
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, [width]);

  const visible = navItems.filter((item) => item.roles.includes(role));

  return (
    <aside
      style={{ width }}
      className="relative flex h-full shrink-0 flex-col border-r border-border bg-card"
    >
      {/* Drag handle */}
      <div
        onMouseDown={handleMouseDown}
        className="absolute right-0 top-0 z-10 h-full w-1 cursor-col-resize transition-colors hover:bg-primary/30 active:bg-primary/50"
      />
      <div className="flex h-14 items-center gap-2.5 border-b border-border px-4">
        <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="truncate text-sm font-semibold">{orgName}</span>
      </div>

      <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {visible.map((item) =>
          item.children ? (
            <NavGroup
              key={item.href}
              label={item.label}
              icon={item.icon}
              children={item.children}
              groupActive={pathname.startsWith(item.href)}
              pathname={pathname}
            />
          ) : (
            <NavLink
              key={item.href}
              href={item.href}
              label={item.label}
              icon={item.icon}
              active={pathname === item.href || pathname.startsWith(item.href + "/")}
            />
          ),
        )}
      </nav>

      {/* Team-Mitglieder mit Online-Status */}
      <SidebarMembers
        initialMembers={initialMembers}
        currentUserId={currentUserId}
        organizationId={organizationId}
      />

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
