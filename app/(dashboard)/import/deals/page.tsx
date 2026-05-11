import { redirect } from "next/navigation";

// Backward-Kompatibilität: /import/deals → /import/migration
export default function ImportDealsRedirect() {
  redirect("/import/migration");
}
