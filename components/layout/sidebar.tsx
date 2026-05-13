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
  LayoutDashboard,
  PlusCircle,
  ArrowDownToLine,
  History,
  AlertCircle,
  Gavel,
  Clock,
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

// ─── Nav-Typen ────────────────────────────────────────────────────────────────

type NavItem = {
  href: string;
  label: string;
  icon: React.ElementType;
  roles: Role[];
};

type NavSection = {
  sectionLabel: string;
  roles: Role[];
  items: NavItem[];
};

type SidebarEntry = NavItem | NavSection;

function isNavSection(entry: SidebarEntry): entry is NavSection {
  return "sectionLabel" in entry;
}

// ─── Navigation-Einträge ──────────────────────────────────────────────────────

const sidebarEntries: SidebarEntry[] = [
  // Dashboard — standalone
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    roles: ["admin", "closer", "sales_partner"],
  },

  // VERKAUF
  {
    sectionLabel: "Verkauf",
    roles: ["admin", "closer", "sales_partner"],
    items: [
      { href: "/deals", label: "Deals", icon: FileText, roles: ["admin", "closer", "sales_partner"] },
      { href: "/deals/new", label: "Neuer Deal", icon: PlusCircle, roles: ["admin", "closer", "sales_partner"] },
    ],
  },

  // IMPORT
  {
    sectionLabel: "Import",
    roles: ["admin"],
    items: [
      { href: "/import", label: "Import-Zentrale", icon: Upload, roles: ["admin"] },
      { href: "/import/plattform", label: "Plattform-Import", icon: ArrowDownToLine, roles: ["admin"] },
      { href: "/import/historie", label: "Historie", icon: History, roles: ["admin"] },
      { href: "/import/konflikte", label: "Konflikte", icon: AlertCircle, roles: ["admin"] },
    ],
  },

  // FORDERUNGEN
  {
    sectionLabel: "Forderungen",
    roles: ["admin"],
    items: [
      { href: "/forderungen/mahnung", label: "Mahnungen", icon: Bell, roles: ["admin"] },
      { href: "/forderungen/inkasso", label: "Inkasso", icon: Gavel, roles: ["admin"] },
      { href: "/forderungen/ueberfaellig", label: "Überfällig", icon: Clock, roles: ["admin"] },
    ],
  },

  // ANALYSE
  {
    sectionLabel: "Analyse",
    roles: ["admin"],
    items: [
      { href: "/analyse/berichte", label: "Berichte", icon: BarChart2, roles: ["admin"] },
    ],
  },

  // VERWALTUNG
  {
    sectionLabel: "Verwaltung",
    roles: ["admin", "closer", "sales_partner"],
    items: [
      { href: "/verwaltung/stammdaten", label: "Stammdaten", icon: Settings, roles: ["admin"] },
      { href: "/verwaltung/benutzer", label: "Benutzer", icon: Users, roles: ["admin"] },
      { href: "/verwaltung/chat", label: "Chat", icon: MessageSquare, roles: ["admin", "closer", "sales_partner"] },
    ],
  },
];

// ─── NavLink-Komponente ───────────────────────────────────────────────────────

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

// ─── Section-Label-Komponente ─────────────────────────────────────────────────

function NavSectionLabel({ label }: { label: string }) {
  return (
    <p className="px-3 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 select-none">
      {label}
    </p>
  );
}

// ─── Sidebar-Breite ───────────────────────────────────────────────────────────

const MIN_WIDTH = 180;
const MAX_WIDTH = 400;
const DEFAULT_WIDTH = 224;
const STORAGE_KEY = "sidebar-width";

// ─── Haupt-Komponente ─────────────────────────────────────────────────────────

export function Sidebar({
  orgName,
  fullName,
  email,
  role,
  currentUserId,
  organizationId,
  initialMembers,
}: SidebarProps) {
  const pathname = usePathname();
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const isResizing = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) setWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, parseInt(saved, 10))));
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
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
        setWidth((prev) => {
          localStorage.setItem(STORAGE_KEY, String(prev));
          return prev;
        });
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [width],
  );

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + "/");
  }

  // Rendert einen einzelnen Entry (Section oder standalone Item)
  function renderEntry(entry: SidebarEntry, idx: number) {
    if (isNavSection(entry)) {
      // Items filtern die der User-Rolle entsprechen
      const visibleItems = entry.items.filter((item) => item.roles.includes(role));
      // Section komplett verstecken wenn keine Items sichtbar
      if (visibleItems.length === 0) return null;

      return (
        <div key={idx}>
          <NavSectionLabel label={entry.sectionLabel} />
          <div className="space-y-0.5">
            {visibleItems.map((item) => (
              <NavLink
                key={item.href}
                href={item.href}
                label={item.label}
                icon={item.icon}
                active={isActive(item.href)}
              />
            ))}
          </div>
        </div>
      );
    }

    // Standalone Item (z.B. Dashboard)
    if (!entry.roles.includes(role)) return null;
    return (
      <NavLink
        key={entry.href}
        href={entry.href}
        label={entry.label}
        icon={entry.icon}
        active={isActive(entry.href)}
      />
    );
  }

  return (
    <aside
      style={{ width }}
      className="relative flex h-full shrink-0 flex-col border-r border-border bg-card"
    >
      {/* Drag-Handle */}
      <div
        onMouseDown={handleMouseDown}
        className="absolute right-0 top-0 z-10 h-full w-1 cursor-col-resize transition-colors hover:bg-primary/30 active:bg-primary/50"
      />

      {/* Org-Header */}
      <div className="flex h-14 items-center gap-2.5 border-b border-border px-4">
        <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="truncate text-sm font-semibold">{orgName}</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-2">
        {sidebarEntries.map((entry, idx) => renderEntry(entry, idx))}
      </nav>

      {/* Team-Mitglieder mit Online-Status */}
      <SidebarMembers
        initialMembers={initialMembers}
        currentUserId={currentUserId}
        organizationId={organizationId}
      />

      {/* Benutzer-Footer */}
      <div className="border-t border-border p-2">
        <div className="mb-1 px-3 py-1.5">
          <p className="truncate text-xs font-medium">{fullName ?? email}</p>
          {fullName && <p className="truncate text-xs text-muted-foreground">{email}</p>}
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
