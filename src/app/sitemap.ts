import type { MetadataRoute } from "next";
import { createClient } from "@supabase/supabase-js";
import { CATEGORIAS, urlFoto } from "@/lib/datos";

// Mapa del sitio para Google: las páginas públicas, una por rubro y cada lote
// disponible (con su foto). Se actualiza cada hora.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const sitio = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
  const fijas: MetadataRoute.Sitemap = [
    { url: sitio, changeFrequency: "daily", priority: 1 },
    { url: `${sitio}/lotes`, changeFrequency: "hourly", priority: 0.9 },
    ...CATEGORIAS.map((c) => ({ url: `${sitio}/lotes?categoria=${encodeURIComponent(c)}`, changeFrequency: "daily" as const, priority: 0.7 })),
    ...["como-funciona", "buscados", "impacto", "ayuda", "devoluciones", "terminos", "privacidad"].map((r) => ({
      url: `${sitio}/${r}`,
      changeFrequency: "monthly" as const,
      priority: 0.3,
    })),
  ];
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data } = await supabase
    .from("lotes")
    .select("id, updated_at, fotos")
    .in("estado", ["publicado", "reservado"])
    .order("publicado_at", { ascending: false })
    .limit(5000);
  const lotes: MetadataRoute.Sitemap = (data ?? []).map((l) => ({
    url: `${sitio}/lotes/${l.id}`,
    lastModified: l.updated_at,
    changeFrequency: "daily",
    priority: 0.8,
    ...(l.fotos?.[0] ? { images: [urlFoto(l.fotos[0])] } : {}),
  }));
  return [...fijas, ...lotes];
}
