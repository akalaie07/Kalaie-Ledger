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

const nextConfig: NextConfig = {
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
      // Forderungsmanagement → Forderungen
      {
        source: "/forderungsmanagement",
        destination: "/forderungen/mahnung",
        permanent: true,
      },
      {
        source: "/forderungsmanagement/mahnung",
        destination: "/forderungen/mahnung",
        permanent: true,
      },
      {
        source: "/forderungsmanagement/inkasso",
        destination: "/forderungen/inkasso",
        permanent: true,
      },
      // Standalone Inkasso-Seite → neue Route
      {
        source: "/inkasso",
        destination: "/forderungen/inkasso",
        permanent: true,
      },
      // Einstellungen → Verwaltung
      {
        source: "/einstellungen/stammdaten",
        destination: "/verwaltung/stammdaten",
        permanent: true,
      },
      {
        source: "/einstellungen/benutzer",
        destination: "/verwaltung/benutzer",
        permanent: true,
      },
      {
        source: "/einstellungen",
        destination: "/verwaltung/stammdaten",
        permanent: true,
      },
      // Chat → Verwaltung/Chat
      {
        source: "/chat",
        destination: "/verwaltung/chat",
        permanent: true,
      },
      // Berichte → Analyse
      {
        source: "/berichte",
        destination: "/analyse/berichte",
        permanent: true,
      },
      // Import — alte Sub-Routen
      {
        source: "/import/deals",
        destination: "/import",
        permanent: true,
      },
      {
        source: "/import/zahlungsabgleich",
        destination: "/import/plattform",
        permanent: true,
      },
      {
        source: "/import/zahlungsabgleich/copecart",
        destination: "/import/plattform/copecart",
        permanent: true,
      },
      {
        source: "/import/zahlungsabgleich/digistore",
        destination: "/import/plattform/digistore",
        permanent: true,
      },
      {
        source: "/import/zahlungsabgleich/ablefy",
        destination: "/import/plattform/ablefy",
        permanent: true,
      },
      // Zahlungsabgleich standalone → Import-Plattform
      {
        source: "/zahlungsabgleich",
        destination: "/import/plattform",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
