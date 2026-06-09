import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.hcaptcha.com https://newassets.hcaptcha.com",
      "style-src 'self' 'unsafe-inline' https://newassets.hcaptcha.com",
      "img-src 'self' blob: data: https://newassets.hcaptcha.com",
      "font-src 'self'",
      `connect-src 'self' ${process.env.NEXT_PUBLIC_SUPABASE_URL} wss://*.supabase.co https://api.hcaptcha.com`,
      "frame-src https://newassets.hcaptcha.com",
      "frame-ancestors 'none'",
    ].join("; "),
  },
];

// Eindeutige ID pro Deploy — Basis für den "Neue Version verfügbar"-Hinweis.
// Auf Vercel: Commit-SHA; lokal/sonst: Zeitstempel beim Build.
const buildId =
  process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ??
  process.env.BUILD_ID ??
  `build-${Date.now()}`;

const nextConfig: NextConfig = {
  // Für Client (eingebacken) und Server (Laufzeit) verfügbar machen.
  env: {
    NEXT_PUBLIC_BUILD_ID: buildId,
  },
  generateBuildId: () => buildId,

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },

  async redirects() {
    return [
      // Forderungen (alte Routen) → Forderungsmanagement
      { source: "/forderungen/mahnung",      destination: "/forderungsmanagement/mahnung",  permanent: false },
      { source: "/forderungen/inkasso",      destination: "/forderungsmanagement/inkasso",  permanent: false },
      { source: "/forderungen/ueberfaellig", destination: "/forderungsmanagement",          permanent: false },
      { source: "/forderungen",              destination: "/forderungsmanagement/mahnung",  permanent: false },
      // Standalone Inkasso-Seite
      { source: "/inkasso",                  destination: "/forderungsmanagement/inkasso",  permanent: false },
      // Einstellungen → Verwaltung
      { source: "/einstellungen/stammdaten", destination: "/verwaltung/stammdaten",         permanent: false },
      { source: "/einstellungen/benutzer",   destination: "/verwaltung/benutzer",           permanent: false },
      { source: "/einstellungen",            destination: "/verwaltung/stammdaten",         permanent: false },
      // Chat → Verwaltung/Chat
      { source: "/chat",                     destination: "/verwaltung/chat",               permanent: false },
      // Import — alte Sub-Routen
      { source: "/import/deals",             destination: "/import",                        permanent: false },
      { source: "/zahlungsabgleich",         destination: "/import/plattform",              permanent: false },
    ];
  },
};

export default nextConfig;
