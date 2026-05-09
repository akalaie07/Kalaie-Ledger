"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Send } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type Message = {
  id: string;
  content: string;
  created_at: string;
  sender_id: string;
  sender_name: string | null;
  sender_email: string;
};

type Member = {
  id: string;
  full_name: string | null;
  email: string;
  role: string;
  last_seen_at: string | null;
};

function isOnline(last_seen_at: string | null) {
  if (!last_seen_at) return false;
  return Date.now() - new Date(last_seen_at).getTime() < 2 * 60 * 1000; // 2 Minuten
}

function OnlineDot({ online }: { online: boolean }) {
  return (
    <span
      className={cn(
        "inline-block h-2 w-2 rounded-full shrink-0",
        online ? "bg-emerald-400" : "bg-muted-foreground/40",
      )}
    />
  );
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  closer: "Closer",
  sales_partner: "Vertriebspartner",
};

export function ChatWindow({
  initialMessages,
  members,
  currentUserId,
  organizationId,
}: {
  initialMessages: Message[];
  members: Member[];
  currentUserId: string;
  organizationId: string;
}) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [liveMembers, setLiveMembers] = useState<Member[]>(members);
  const [text, setText] = useState("");
  const [isPending, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  // Scroll to bottom whenever messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Realtime: neue Nachrichten empfangen
  useEffect(() => {
    const channel = supabase
      .channel(`chat:${organizationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `organization_id=eq.${organizationId}`,
        },
        async (payload) => {
          const row = payload.new as { id: string; content: string; created_at: string; sender_id: string };
          // Sender-Info nachladen
          const { data: profile } = await supabase
            .from("profiles")
            .select("full_name, email")
            .eq("id", row.sender_id)
            .single();

          setMessages((prev) => [
            ...prev,
            {
              id: row.id,
              content: row.content,
              created_at: row.created_at,
              sender_id: row.sender_id,
              sender_name: profile?.full_name ?? null,
              sender_email: profile?.email ?? "",
            },
          ]);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [organizationId]);

  // Realtime: Online-Status der Mitglieder live updaten
  useEffect(() => {
    const channel = supabase
      .channel(`presence:${organizationId}`)
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
          setLiveMembers((prev) =>
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

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;

    setText("");
    startTransition(async () => {
      await supabase.from("messages").insert({
        organization_id: organizationId,
        sender_id: currentUserId,
        content: trimmed,
      });
    });
  }

  return (
    <div className="flex h-full gap-0">
      {/* Sidebar: Mitglieder */}
      <aside className="w-52 shrink-0 border-r border-border bg-card/50 flex flex-col">
        <div className="px-4 py-3 border-b border-border">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Mitglieder ({liveMembers.length})
          </p>
        </div>
        <ul className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {liveMembers.map((m) => {
            const online = isOnline(m.last_seen_at);
            return (
              <li
                key={m.id}
                className="flex items-center gap-2.5 rounded-md px-2 py-2 hover:bg-muted/40"
              >
                <OnlineDot online={online} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium leading-tight">
                    {m.full_name ?? m.email}
                    {m.id === currentUserId && (
                      <span className="text-muted-foreground font-normal"> (Du)</span>
                    )}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {ROLE_LABEL[m.role] ?? m.role} · {online ? "Online" : "Offline"}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </aside>

      {/* Chat-Bereich */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Nachrichten */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-12">
              Noch keine Nachrichten. Schreib die erste!
            </p>
          )}
          {messages.map((msg, i) => {
            const isMe = msg.sender_id === currentUserId;
            const prevMsg = messages[i - 1];
            const showSender =
              !prevMsg || prevMsg.sender_id !== msg.sender_id;

            return (
              <div
                key={msg.id}
                className={cn("flex flex-col", isMe ? "items-end" : "items-start")}
              >
                {showSender && (
                  <p className={cn("text-xs text-muted-foreground mb-0.5 px-1", isMe && "text-right")}>
                    {isMe ? "Du" : (msg.sender_name ?? msg.sender_email)}
                  </p>
                )}
                <div className="flex items-end gap-1.5 max-w-[75%]">
                  {!isMe && <div className="w-0" />}
                  <div
                    className={cn(
                      "rounded-2xl px-3.5 py-2 text-sm break-words",
                      isMe
                        ? "bg-primary text-primary-foreground rounded-br-sm"
                        : "bg-muted text-foreground rounded-bl-sm",
                    )}
                  >
                    {msg.content}
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5 px-1">
                  {formatTime(msg.created_at)}
                </p>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        {/* Eingabe */}
        <form
          onSubmit={handleSend}
          className="border-t border-border p-3 flex items-center gap-2"
        >
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Nachricht schreiben…"
            maxLength={2000}
            className="flex-1 rounded-full border border-input bg-background px-4 py-2 text-sm outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend(e as unknown as React.FormEvent);
              }
            }}
          />
          <button
            type="submit"
            disabled={!text.trim() || isPending}
            className="shrink-0 rounded-full bg-primary p-2 text-primary-foreground disabled:opacity-40 hover:opacity-90 transition-opacity"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
