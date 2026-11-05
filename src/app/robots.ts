import type { MetadataRoute } from "next";

// Qué puede recorrer Google: lo público sí; los paneles, el admin y la seguridad, no.
export default function robots(): MetadataRoute.Robots {
  const sitio = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/panel", "/admin", "/seguridad", "/api", "/auth", "/salir", "/aviso-cookies"] },
    sitemap: `${sitio}/sitemap.xml`,
  };
}
