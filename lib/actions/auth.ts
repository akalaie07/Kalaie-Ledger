"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

export type AuthFormState = {
  error?: string;
  fieldErrors?: Partial<Record<string, string[]>>;
  message?: string;
  /** true when the login failed because the email is not confirmed yet */
  needsEmailConfirmation?: boolean;
  /** the email that needs confirmation — so the resend action can use it */
  unconfirmedEmail?: string;
} | null;

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const LoginSchema = z.object({
  email: z.string().email("Ungültige E-Mail-Adresse.").trim().toLowerCase(),
  password: z.string().min(8, "Mindestens 8 Zeichen erforderlich."),
  next: z.string().optional(),
});

const SignupSchema = z.object({
  full_name: z.string().min(2, "Name zu kurz (min. 2 Zeichen).").trim(),
  email: z.string().email("Ungültige E-Mail-Adresse.").trim().toLowerCase(),
  password: z
    .string()
    .min(8, "Mindestens 8 Zeichen.")
    .regex(/[a-zA-Z]/, "Muss einen Buchstaben enthalten.")
    .regex(/[0-9]/, "Muss eine Zahl enthalten."),
  organization_name: z
    .string()
    .min(2, "Organisationsname zu kurz (min. 2 Zeichen).")
    .trim(),
});

const InviteSignupSchema = z.object({
  full_name: z.string().min(2, "Name zu kurz (min. 2 Zeichen).").trim(),
  email: z.string().email().trim(),
  password: z
    .string()
    .min(8, "Mindestens 8 Zeichen.")
    .regex(/[a-zA-Z]/, "Muss einen Buchstaben enthalten.")
    .regex(/[0-9]/, "Muss eine Zahl enthalten."),
  invited_organization_id: z.string().uuid(),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safeRedirectPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/deals";
  return next;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export async function signIn(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const result = LoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next"),
  });

  if (!result.success) {
    return { fieldErrors: result.error.flatten().fieldErrors };
  }

  const { email, password, next } = result.data;
  const captchaToken = formData.get("h-captcha-response") as string | null;
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
    options: { captchaToken: captchaToken ?? undefined },
  });

  if (error) {
    if (
      error.code === "email_not_confirmed" ||
      error.message.toLowerCase().includes("email not confirmed")
    ) {
      return {
        error:
          "Deine E-Mail-Adresse wurde noch nicht bestätigt. Bitte überprüfe dein Postfach.",
        needsEmailConfirmation: true,
        unconfirmedEmail: email,
      };
    }
    return { error: "E-Mail oder Passwort falsch. Bitte erneut versuchen." };
  }

  redirect(safeRedirectPath(next));
}

export async function signUp(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const result = SignupSchema.safeParse({
    full_name: formData.get("full_name"),
    email: formData.get("email"),
    password: formData.get("password"),
    organization_name: formData.get("organization_name"),
  });

  if (!result.success) {
    return { fieldErrors: result.error.flatten().fieldErrors };
  }

  const { full_name, email, password, organization_name } = result.data;
  const captchaToken = formData.get("h-captcha-response") as string | null;
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name, organization_name },
      captchaToken: captchaToken ?? undefined,
    },
  });

  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("already registered") || msg.includes("already exists")) {
      return { error: "Diese E-Mail-Adresse ist bereits registriert." };
    }
    if (msg.includes("database error") || msg.includes("trigger")) {
      return { error: "Datenbankfehler beim Anlegen des Kontos. Bitte wende dich an den Support." };
    }
    return { error: "Registrierung fehlgeschlagen. Bitte erneut versuchen." };
  }

  if (!data.session) {
    return {
      message:
        "Bitte bestätige deine E-Mail-Adresse. Wir haben dir einen Link zugeschickt.",
    };
  }

  redirect("/deals");
}

export async function signUpViaInvite(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const result = InviteSignupSchema.safeParse({
    full_name: formData.get("full_name"),
    email: formData.get("email"),
    password: formData.get("password"),
    invited_organization_id: formData.get("invited_organization_id"),
  });

  if (!result.success) {
    return { fieldErrors: result.error.flatten().fieldErrors };
  }

  const { full_name, email, password, invited_organization_id } = result.data;
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name, invited_organization_id } },
  });

  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("invalid_invite") || msg.includes("no valid invite")) {
      return { error: "Einladung ungültig oder abgelaufen." };
    }
    if (msg.includes("already registered") || msg.includes("already exists")) {
      return { error: "Diese E-Mail-Adresse ist bereits registriert." };
    }
    return { error: "Registrierung fehlgeschlagen. Bitte erneut versuchen." };
  }

  if (!data.session) {
    return {
      message:
        "Bitte bestätige deine E-Mail-Adresse. Wir haben dir einen Link zugeschickt.",
    };
  }

  redirect("/deals");
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function resendConfirmationEmail(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = (formData.get("email") as string | null)?.trim().toLowerCase();
  if (!email) return { error: "E-Mail fehlt." };

  const supabase = await createClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
  });

  if (error) {
    return { error: "Bestätigungs-E-Mail konnte nicht gesendet werden. Bitte versuche es später erneut." };
  }

  return {
    message: "Bestätigungs-E-Mail wurde erneut gesendet. Bitte überprüfe dein Postfach.",
  };
}
