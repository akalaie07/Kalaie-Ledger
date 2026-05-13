import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/get-current-org";
import { createClient } from "@/lib/supabase/server";
import { ChatWindow } from "@/app/(dashboard)/chat/_components/chat-window";

export const metadata: Metadata = { title: "Chat — Kalaie Ledger" };

export default async function ChatPage() {
  const session = await requireSession();
  const supabase = await createClient();

  const [{ data: rawMessages }, { data: members }] = await Promise.all([
    supabase
      .from("messages")
      .select("id, content, created_at, sender_id, profiles(full_name, email)")
      .eq("organization_id", session.organizationId)
      .order("created_at", { ascending: true })
      .limit(100),
    supabase
      .from("profiles")
      .select("id, full_name, email, role, last_seen_at")
      .eq("organization_id", session.organizationId)
      .order("full_name"),
  ]);

  const messages = (rawMessages ?? []).map((m) => ({
    id: m.id,
    content: m.content,
    created_at: m.created_at,
    sender_id: m.sender_id,
    sender_name: (m.profiles as { full_name: string | null; email: string } | null)?.full_name ?? null,
    sender_email: (m.profiles as { full_name: string | null; email: string } | null)?.email ?? "",
  }));

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 border-b border-border px-6 py-4 shrink-0">
        <div>
          <h1 className="text-base font-semibold leading-tight">Team Chat</h1>
          <p className="text-xs text-muted-foreground">{session.organizationName}</p>
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        <ChatWindow
          initialMessages={messages}
          members={members ?? []}
          currentUserId={session.userId}
          organizationId={session.organizationId}
        />
      </div>
    </div>
  );
}
