// Einmalig ausführen: node scripts/apply-super-admin-migration.mjs
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://dfizzehiqhrlzmwsvkxq.supabase.co";
const SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRmaXp6ZWhpcWhybHptd3N2a3hxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODE3OTQxNiwiZXhwIjoyMDkzNzU1NDE2fQ.Jl4oS5N3KVNi-ZpYosGR5_FRGR6sN-qeF-DqBaEg2Gg";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// 1. Spalte hinzufügen
const { error: alterError } = await supabase.rpc("exec_migration", {
  sql: "alter table profiles add column if not exists is_super_admin boolean not null default false;"
}).catch(() => ({ error: null }));

// Fallback: direkt über auth admin
const { data, error } = await supabase
  .from("profiles")
  .select("id, email, is_super_admin")
  .limit(1);

if (error?.message?.includes("is_super_admin")) {
  console.log("❌ Spalte 'is_super_admin' existiert noch nicht.");
  console.log("\nBitte diesen SQL-Befehl im Supabase Dashboard → SQL Editor ausführen:\n");
  console.log("  alter table profiles add column if not exists is_super_admin boolean not null default false;");
  console.log("\nDanach diesen Befehl um dich als Super-Admin zu setzen:");
  console.log("  UPDATE profiles SET is_super_admin = true WHERE email = 'DEINE_EMAIL@beispiel.com';");
} else if (!error) {
  console.log("✅ Spalte 'is_super_admin' ist bereits vorhanden.");

  // Super-Admin setzen — E-Mail hier eintragen
  const SUPER_ADMIN_EMAIL = process.argv[2];
  if (SUPER_ADMIN_EMAIL) {
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ is_super_admin: true })
      .eq("email", SUPER_ADMIN_EMAIL);

    if (updateError) {
      console.log(`❌ Fehler beim Setzen des Super-Admins: ${updateError.message}`);
    } else {
      console.log(`✅ ${SUPER_ADMIN_EMAIL} ist jetzt Super-Admin!`);
    }
  } else {
    console.log("\nTipp: Führe das Script mit deiner E-Mail aus um dich als Super-Admin zu setzen:");
    console.log("  node scripts/apply-super-admin-migration.mjs deine@email.com");
  }
}
