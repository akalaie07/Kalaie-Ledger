import { redirect } from "next/navigation";

// Zahlungsabgleich wurde in den einheitlichen Import-Wizard integriert.
export default function ZahlungsabgleichPage() {
  redirect("/import/deals");
}
