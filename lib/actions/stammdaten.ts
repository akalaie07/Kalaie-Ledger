"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

export type LookupActionState = {
  ok: boolean;
  error?: string;
  fieldErrors?: Partial<Record<string, string[]>>;
} | null;

/** Used as the `action` prop type in section components. */
export type LookupAction = (
  prev: LookupActionState,
  fd: FormData,
) => Promise<LookupActionState>;

const PATH = "/einstellungen/stammdaten";

// ---------------------------------------------------------------------------
// Auth helper — returns { supabase, orgId } or { err }
// ---------------------------------------------------------------------------

async function adminCtx() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { err: "Nicht angemeldet." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, organization_id")
    .eq("id", user.id)
    .single();

  if (!profile || (profile as { role: string }).role !== "admin")
    return { err: "Keine Berechtigung." };

  return { supabase, orgId: (profile as { organization_id: string }).organization_id };
}

function dupErr(code: string | undefined, raw: string): LookupActionState {
  return { ok: false, error: code === "23505" ? "Name bereits vorhanden." : raw };
}

// ===========================================================================
// Platforms
// ===========================================================================

const PlatformSchema = z.object({
  name: z.string().min(1, "Name erforderlich.").max(100).trim(),
});

export async function createPlatform(
  _prev: LookupActionState,
  fd: FormData,
): Promise<LookupActionState> {
  const ctx = await adminCtx();
  if ("err" in ctx) return { ok: false, error: ctx.err };

  const r = PlatformSchema.safeParse({ name: fd.get("name") });
  if (!r.success) return { ok: false, fieldErrors: r.error.flatten().fieldErrors };

  const { error } = await ctx.supabase
    .from("platforms")
    .insert({ organization_id: ctx.orgId, name: r.data.name });

  if (error) return dupErr(error.code, error.message);
  revalidatePath(PATH);
  return { ok: true };
}

export async function updatePlatform(
  _prev: LookupActionState,
  fd: FormData,
): Promise<LookupActionState> {
  const ctx = await adminCtx();
  if ("err" in ctx) return { ok: false, error: ctx.err };

  const id = fd.get("id") as string;
  const r = PlatformSchema.safeParse({ name: fd.get("name") });
  if (!r.success) return { ok: false, fieldErrors: r.error.flatten().fieldErrors };

  const { error } = await ctx.supabase
    .from("platforms")
    .update({ name: r.data.name })
    .eq("id", id)
    .eq("organization_id", ctx.orgId);

  if (error) return dupErr(error.code, error.message);
  revalidatePath(PATH);
  return { ok: true };
}

export async function togglePlatform(
  _prev: LookupActionState,
  fd: FormData,
): Promise<LookupActionState> {
  const ctx = await adminCtx();
  if ("err" in ctx) return { ok: false, error: ctx.err };

  const { error } = await ctx.supabase
    .from("platforms")
    .update({ active: fd.get("active") !== "true" })
    .eq("id", fd.get("id") as string)
    .eq("organization_id", ctx.orgId);

  if (error) return { ok: false, error: error.message };
  revalidatePath(PATH);
  return { ok: true };
}

// ===========================================================================
// Products
// ===========================================================================

const ProductSchema = z.object({
  name: z.string().min(1, "Name erforderlich.").max(100).trim(),
  default_price: z.preprocess(
    (v) => (v === "" || v == null ? null : Number(v)),
    z.number().nonnegative("Preis muss ≥ 0 sein.").nullable(),
  ),
});

export async function createProduct(
  _prev: LookupActionState,
  fd: FormData,
): Promise<LookupActionState> {
  const ctx = await adminCtx();
  if ("err" in ctx) return { ok: false, error: ctx.err };

  const r = ProductSchema.safeParse({
    name: fd.get("name"),
    default_price: fd.get("default_price"),
  });
  if (!r.success) return { ok: false, fieldErrors: r.error.flatten().fieldErrors };

  const { error } = await ctx.supabase
    .from("products")
    .insert({ organization_id: ctx.orgId, ...r.data });

  if (error) return dupErr(error.code, error.message);
  revalidatePath(PATH);
  return { ok: true };
}

export async function updateProduct(
  _prev: LookupActionState,
  fd: FormData,
): Promise<LookupActionState> {
  const ctx = await adminCtx();
  if ("err" in ctx) return { ok: false, error: ctx.err };

  const id = fd.get("id") as string;
  const r = ProductSchema.safeParse({
    name: fd.get("name"),
    default_price: fd.get("default_price"),
  });
  if (!r.success) return { ok: false, fieldErrors: r.error.flatten().fieldErrors };

  const { error } = await ctx.supabase
    .from("products")
    .update(r.data)
    .eq("id", id)
    .eq("organization_id", ctx.orgId);

  if (error) return dupErr(error.code, error.message);
  revalidatePath(PATH);
  return { ok: true };
}

export async function toggleProduct(
  _prev: LookupActionState,
  fd: FormData,
): Promise<LookupActionState> {
  const ctx = await adminCtx();
  if ("err" in ctx) return { ok: false, error: ctx.err };

  const { error } = await ctx.supabase
    .from("products")
    .update({ active: fd.get("active") !== "true" })
    .eq("id", fd.get("id") as string)
    .eq("organization_id", ctx.orgId);

  if (error) return { ok: false, error: error.message };
  revalidatePath(PATH);
  return { ok: true };
}

// ===========================================================================
// Shared staff schema (closers + sales_partners)
// ===========================================================================

const StaffSchema = z.object({
  name: z.string().min(1, "Name erforderlich.").max(100).trim(),
  commission_rate_pct: z.coerce
    .number()
    .min(0, "Min. 0 %.")
    .max(100, "Max. 100 %."),
  profile_id: z.preprocess(
    (v) => (v === "" || v == null ? null : v),
    z.string().uuid().nullable(),
  ),
});

// ===========================================================================
// Closers
// ===========================================================================

export async function createCloser(
  _prev: LookupActionState,
  fd: FormData,
): Promise<LookupActionState> {
  const ctx = await adminCtx();
  if ("err" in ctx) return { ok: false, error: ctx.err };

  const r = StaffSchema.safeParse({
    name: fd.get("name"),
    commission_rate_pct: fd.get("commission_rate_pct"),
    profile_id: fd.get("profile_id"),
  });
  if (!r.success) return { ok: false, fieldErrors: r.error.flatten().fieldErrors };

  const { error } = await ctx.supabase.from("closers").insert({
    organization_id: ctx.orgId,
    name: r.data.name,
    commission_rate: r.data.commission_rate_pct / 100,
    profile_id: r.data.profile_id,
  });

  if (error) return dupErr(error.code, error.message);
  revalidatePath(PATH);
  return { ok: true };
}

export async function updateCloser(
  _prev: LookupActionState,
  fd: FormData,
): Promise<LookupActionState> {
  const ctx = await adminCtx();
  if ("err" in ctx) return { ok: false, error: ctx.err };

  const id = fd.get("id") as string;
  const r = StaffSchema.safeParse({
    name: fd.get("name"),
    commission_rate_pct: fd.get("commission_rate_pct"),
    profile_id: fd.get("profile_id"),
  });
  if (!r.success) return { ok: false, fieldErrors: r.error.flatten().fieldErrors };

  const { error } = await ctx.supabase
    .from("closers")
    .update({
      name: r.data.name,
      commission_rate: r.data.commission_rate_pct / 100,
      profile_id: r.data.profile_id,
    })
    .eq("id", id)
    .eq("organization_id", ctx.orgId);

  if (error) return dupErr(error.code, error.message);
  revalidatePath(PATH);
  return { ok: true };
}

export async function toggleCloser(
  _prev: LookupActionState,
  fd: FormData,
): Promise<LookupActionState> {
  const ctx = await adminCtx();
  if ("err" in ctx) return { ok: false, error: ctx.err };

  const { error } = await ctx.supabase
    .from("closers")
    .update({ active: fd.get("active") !== "true" })
    .eq("id", fd.get("id") as string)
    .eq("organization_id", ctx.orgId);

  if (error) return { ok: false, error: error.message };
  revalidatePath(PATH);
  return { ok: true };
}

// ===========================================================================
// Sales Partners
// ===========================================================================

export async function createSalesPartner(
  _prev: LookupActionState,
  fd: FormData,
): Promise<LookupActionState> {
  const ctx = await adminCtx();
  if ("err" in ctx) return { ok: false, error: ctx.err };

  const r = StaffSchema.safeParse({
    name: fd.get("name"),
    commission_rate_pct: fd.get("commission_rate_pct"),
    profile_id: fd.get("profile_id"),
  });
  if (!r.success) return { ok: false, fieldErrors: r.error.flatten().fieldErrors };

  const { error } = await ctx.supabase.from("sales_partners").insert({
    organization_id: ctx.orgId,
    name: r.data.name,
    commission_rate: r.data.commission_rate_pct / 100,
    profile_id: r.data.profile_id,
  });

  if (error) return dupErr(error.code, error.message);
  revalidatePath(PATH);
  return { ok: true };
}

export async function updateSalesPartner(
  _prev: LookupActionState,
  fd: FormData,
): Promise<LookupActionState> {
  const ctx = await adminCtx();
  if ("err" in ctx) return { ok: false, error: ctx.err };

  const id = fd.get("id") as string;
  const r = StaffSchema.safeParse({
    name: fd.get("name"),
    commission_rate_pct: fd.get("commission_rate_pct"),
    profile_id: fd.get("profile_id"),
  });
  if (!r.success) return { ok: false, fieldErrors: r.error.flatten().fieldErrors };

  const { error } = await ctx.supabase
    .from("sales_partners")
    .update({
      name: r.data.name,
      commission_rate: r.data.commission_rate_pct / 100,
      profile_id: r.data.profile_id,
    })
    .eq("id", id)
    .eq("organization_id", ctx.orgId);

  if (error) return dupErr(error.code, error.message);
  revalidatePath(PATH);
  return { ok: true };
}

export async function toggleSalesPartner(
  _prev: LookupActionState,
  fd: FormData,
): Promise<LookupActionState> {
  const ctx = await adminCtx();
  if ("err" in ctx) return { ok: false, error: ctx.err };

  const { error } = await ctx.supabase
    .from("sales_partners")
    .update({ active: fd.get("active") !== "true" })
    .eq("id", fd.get("id") as string)
    .eq("organization_id", ctx.orgId);

  if (error) return { ok: false, error: error.message };
  revalidatePath(PATH);
  return { ok: true };
}
