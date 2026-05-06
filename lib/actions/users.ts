"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { getCurrentSession } from "@/lib/auth/get-current-org";

export type UserActionState = {
  error?: string;
  /** The raw invite token — client constructs the full URL using window.location.origin */
  inviteToken?: string;
} | null;

const InviteSchema = z.object({
  email: z.string().email("Ungültige E-Mail-Adresse.").trim().toLowerCase(),
  role: z.enum(["closer", "sales_partner", "admin"]),
});

export async function createInvite(
  _prev: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  const session = await getCurrentSession();
  if (!session) return { error: "Nicht angemeldet." };
  if (session.role !== "admin") return { error: "Nur Admins können Einladungen erstellen." };

  const result = InviteSchema.safeParse({
    email: formData.get("email"),
    role: formData.get("role"),
  });

  if (!result.success) {
    const errs = result.error.flatten().fieldErrors;
    return { error: Object.values(errs).flat()[0] ?? "Ungültige Eingabe." };
  }

  const { email, role } = result.data;
  const supabase = await createClient();

  // Check if user already exists in org
  const { data: existing } = await supabase
    .from("profiles")
    .select("id")
    .eq("organization_id", session.organizationId)
    .eq("email", email)
    .maybeSingle();

  if (existing) {
    return { error: "Dieser Benutzer ist bereits Mitglied deiner Organisation." };
  }

  const { data: invite, error } = await supabase
    .from("organization_invites")
    .insert({
      organization_id: session.organizationId,
      email,
      role,
      invited_by: session.userId,
    })
    .select("token")
    .single();

  if (error || !invite) {
    // Could be duplicate invite (unique constraint on org+email)
    if (error?.code === "23505") {
      return { error: "Für diese E-Mail gibt es bereits eine offene Einladung." };
    }
    return { error: "Einladung konnte nicht erstellt werden." };
  }

  revalidatePath("/einstellungen/benutzer");

  return { inviteToken: invite.token };
}
