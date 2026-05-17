import "server-only";

// Re-export createAdminClient under the legacy name to avoid touching callers.
export { createAdminClient as createServiceClient } from "@/lib/supabase/admin";
