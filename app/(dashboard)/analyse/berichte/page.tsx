import { redirect } from "next/navigation";

// Diese Seite war eine zweite Berichte-Implementierung mit abweichenden
// Zahlen (zählte stornierte Deals mit, rechnete Soll = total_price).
// /berichte ist die einzige Quelle der Wahrheit — alte Links/Bookmarks
// werden weitergeleitet.
export default async function AnalyseBerichteRedirect({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view } = await searchParams;
  redirect(view === "yearly" ? "/berichte?view=yearly" : "/berichte");
}
