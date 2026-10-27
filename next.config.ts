import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";
const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

// Política de seguridad del navegador: la página solo carga scripts propios, solo
// habla con Supabase y no se puede incrustar en otro sitio (evita clickjacking).
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' blob: data: ${supabase}`,
  "font-src 'self'",
  `connect-src 'self' ${supabase}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  // Fuerza HTTPS solo si Supabase también lo usa (no con el Supabase local, que va por HTTP).
  ...(isDev || !supabase.startsWith("https://") ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
