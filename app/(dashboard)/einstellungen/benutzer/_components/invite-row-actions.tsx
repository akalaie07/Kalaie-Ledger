"use client";

import { useState, useTransition } from "react";
import { Copy, Check, Mail, Loader2 } from "lucide-react";
import { resendInviteEmail } from "@/lib/actions/users";

export function InviteRowActions({
  token,
  email,
  role,
}: {
  token: string;
  email: string;
  role: string;
}) {
  const [copied, setCopied] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const inviteUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/invite?token=${token}`
      : `/invite?token=${token}`;

  function handleCopy() {
    navigator.clipboard.writeText(inviteUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleResend() {
    setError(null);
    setSent(false);
    startTransition(async () => {
      const result = await resendInviteEmail(token, email, role);
      if (result?.error) {
        setError(result.error);
      } else {
        setSent(true);
        setTimeout(() => setSent(false), 3000);
      }
    });
  }

  return (
    <div className="flex items-center gap-1">
      {/* Copy link */}
      <button
        type="button"
        onClick={handleCopy}
        title="Einladungslink kopieren"
        className="rounded p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-emerald-400" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </button>

      {/* Resend email */}
      <button
        type="button"
        onClick={handleResend}
        disabled={isPending}
        title="E-Mail erneut senden"
        className="rounded p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors disabled:opacity-50"
      >
        {isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : sent ? (
          <Check className="h-3.5 w-3.5 text-emerald-400" />
        ) : (
          <Mail className="h-3.5 w-3.5" />
        )}
      </button>

      {error && (
        <span className="text-xs text-destructive ml-1">{error}</span>
      )}
    </div>
  );
}
