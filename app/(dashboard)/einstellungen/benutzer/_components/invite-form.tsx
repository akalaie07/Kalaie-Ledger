"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Copy, Check, UserPlus } from "lucide-react";

import { createInvite, type UserActionState } from "@/lib/actions/users";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function InviteForm() {
  const [state, action, pending] = useActionState<UserActionState, FormData>(
    createInvite,
    null,
  );
  const [copied, setCopied] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // When invite token is returned, build the full URL using window.location.origin
  const inviteUrl = state?.inviteToken
    ? `${window.location.origin}/invite?token=${state.inviteToken}`
    : null;

  useEffect(() => {
    if (inviteUrl && formRef.current) {
      formRef.current.reset();
    }
  }, [inviteUrl]);

  function handleCopy() {
    if (!inviteUrl) return;
    navigator.clipboard.writeText(inviteUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="space-y-4">
      <form ref={formRef} action={action} className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5 min-w-48 flex-1">
          <Label htmlFor="invite-email">E-Mail</Label>
          <Input
            id="invite-email"
            name="email"
            type="email"
            placeholder="name@beispiel.de"
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="invite-role">Rolle</Label>
          <select
            id="invite-role"
            name="role"
            defaultValue="closer"
            className={cn(
              "flex h-8 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm",
              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            )}
          >
            <option value="closer">Closer</option>
            <option value="sales_partner">Vertriebspartner</option>
            <option value="admin">Admin</option>
          </select>
        </div>

        <Button type="submit" size="sm" disabled={pending}>
          <UserPlus className="h-4 w-4 mr-1.5" />
          {pending ? "Wird erstellt…" : "Einladen"}
        </Button>
      </form>

      {state?.error && (
        <p className="text-sm text-destructive">{state.error}</p>
      )}

      {inviteUrl && (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 space-y-2">
          {state?.emailSent ? (
            <p className="text-sm font-medium text-emerald-400">
              ✓ Einladungs-E-Mail wurde gesendet!
            </p>
          ) : (
            <p className="text-sm font-medium text-emerald-400">
              Einladungslink erstellt
            </p>
          )}

          {/* Fallback link — always shown in case email doesn't arrive */}
          <details className={state?.emailSent ? "text-xs" : undefined}>
            {state?.emailSent && (
              <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground select-none">
                Link als Fallback anzeigen (falls E-Mail nicht ankommt)
              </summary>
            )}
            <div className="flex items-center gap-2 mt-1">
              <input
                type="text"
                readOnly
                value={inviteUrl}
                className="flex-1 rounded border border-border bg-background px-2 py-1 text-xs font-mono text-muted-foreground truncate"
              />
              <button
                type="button"
                onClick={handleCopy}
                className="shrink-0 rounded p-1.5 hover:bg-emerald-500/20 transition-colors"
                title="Link kopieren"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-emerald-400" />
                ) : (
                  <Copy className="h-4 w-4 text-emerald-400" />
                )}
              </button>
            </div>
          </details>

          <p className="text-xs text-muted-foreground">Link ist 14 Tage gültig.</p>
        </div>
      )}
    </div>
  );
}
