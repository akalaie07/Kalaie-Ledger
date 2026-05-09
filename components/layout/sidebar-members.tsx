"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type Member = {
  id: string;
  full_name: string | null;
  email: string;
  role: string;
  last_seen_at: string | null;
};

function isOnline(last_seen_at: string | null) {
  if (!last_seen_at) return false;
  return Date.now() - new Date(last_seen_at).getTime() < 2 * 60 * 1000;
}

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  closer: "Closer",
  sales_partner: "Partner",
};

export function SidebarMembers({
  initialMembers,
  currentUserId,
  organizationId,
}: {
  initialMembers: Member[];
  currentUserId: string;
  organizationId: string;
}) {
  const [members, setMembers] = useState<Member[]>(initialMembers);

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`sidebar-presence:${organizationId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
          filter: `organization_id=eq.${organizationId}`,
        },
        (payload) => {
          const updated = payload.new as Member;
          setMembers((prev) =>
            prev.map((m) =>
              m.id === updated.id
                ? { ...m, last_seen_at: updated.last_seen_at }
                : m,
            ),
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [organizationId]);

  // Sortieren: Online zuerst, dann Offline
  const sorted = [...members].sort((a, b) => {
    const aOnline = isOnline(a.last_seen_at) ? 0 : 1;
    const bOnline = isOnline(b.last_seen_at) ? 0 : 1;
    return aOnline - bOnline;
  });

  const onlineCount = sorted.filter((m) => isOnline(m.last_seen_at)).length;

  return (
    <div className="border-t border-border">
      <div className="px-3 pt-2.5 pb-1 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Team
        </span>
        <span className="text-[10px] text-muted-foreground">
          <span className="text-emerald-400">{onlineCount}</span>/{members.length} online
        </span>
      </div>
      <ul className="px-2 pb-2 space-y-0.5 max-h-40 overflow-y-auto">
        {sorted.map((m) => {
          const online = isOnline(m.last_seen_at);
          const isMe = m.id === currentUserId;
          return (
            <li
              key={m.id}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent/40"
            >
              {/* Avatar mit Online-Dot */}
              <div className="relative shrink-0">
                <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-semibold text-muted-foreground uppercase">
                  {(m.full_name ?? m.email).charAt(0)}
                </div>
                <span
                  className={cn(
                    "absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-card",
                    online ? "bg-emerald-400" : "bg-muted-foreground/30",
                  )}
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium leading-tight">
                  {m.full_name ?? m.email}
                  {isMe && <span className="text-muted-foreground font-normal"> (Du)</span>}
                </p>
                <p className="text-[10px] text-muted-foreground leading-tight">
                  {ROLE_LABEL[m.role] ?? m.role}
                </p>
              </div>
              <span
                className={cn(
                  "text-[10px] shrink-0",
                  online ? "text-emerald-400" : "text-muted-foreground/50",
                )}
              >
                {online ? "●" : "○"}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
