import { NextResponse } from "next/server";

// Immer dynamisch + ungecacht, damit der Client stets die live deployte Version sieht.
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { buildId: process.env.NEXT_PUBLIC_BUILD_ID ?? "unknown" },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
