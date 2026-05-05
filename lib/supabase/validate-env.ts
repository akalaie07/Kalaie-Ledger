const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

if (url.includes("/rest/v1") || url.includes("/auth/v1")) {
  throw new Error(
    `[Supabase] NEXT_PUBLIC_SUPABASE_URL must be the bare project URL ` +
      `(e.g. https://PROJECT_REF.supabase.co) without any path suffix. ` +
      `Got: "${url}"`,
  );
}
