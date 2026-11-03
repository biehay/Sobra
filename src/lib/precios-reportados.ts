import "server-only";
import { createHash } from "node:crypto";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { dolarDelDia } from "@/lib/dolar";
import { adivinarCategoria } from "@/lib/depreciacion";
import { palabrasProducto, precioDeReportes, type Reporte } from "@/lib/precio-consolidar";
import { cantidadPrincipal } from "@/lib/precio-comparables";

// Precios reportados por los usuarios (tabla precios_reportados): se guardan y se
// leen solo desde el servidor. Ver precioDeReportes() para cuándo se confía en ellos.

// Identificador anónimo de quién reporta: no se guarda ni el usuario ni la IP.
export function quienReporta(usuarioOIp: string) {
  const sal = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "sobra").slice(-16);
  return createHash("sha256").update(`${sal}:${usuarioOIp}`).digest("hex").slice(0, 32);
}

// Como mucho 10 reportes por persona por día (para que nadie inunde la tabla).
const usos = new Map<string, number[]>();

export async function guardarReporte(r: {
  texto: string;
  marca?: string | null;
  cantidad: number;
  unidad: string;
  precioTotalArs: number;
  quien: string;
  origen: "calculadora" | "publicacion";
}) {
  const admin = crearClienteAdmin();
  const dolar = await dolarDelDia();
  if (!admin || !dolar || !(r.cantidad > 0) || !(r.precioTotalArs > 0)) return;
  const ahora = Date.now();
  const recientes = (usos.get(r.quien) ?? []).filter((t) => ahora - t < 86_400_000);
  if (recientes.length >= 10) return;
  usos.set(r.quien, [...recientes, ahora]);
  const texto = r.texto.trim().slice(0, 200);
  const { error } = await admin.from("precios_reportados").insert({
    texto,
    palabras: palabrasProducto(texto),
    categoria: adivinarCategoria(texto),
    marca: r.marca?.trim().slice(0, 60) || null,
    unidad: r.unidad.slice(0, 20),
    precio_usd_por_unidad: r.precioTotalArs / r.cantidad / dolar,
    dolar,
    quien: r.quien,
    origen: r.origen,
  });
  if (error) console.error("[Sobrá] No se pudo guardar el precio reportado:", error.message);
}

// Lo que reportaron otros sobre este producto (null si no hay nada que sirva).
export async function precioReportado(texto: string, marca?: string | null) {
  const admin = crearClienteAdmin();
  const lote = cantidadPrincipal(texto);
  const pal = palabrasProducto(texto);
  if (!admin || !lote || !pal.length) return null;
  const [{ data }, dolar] = await Promise.all([
    admin
      .from("precios_reportados")
      .select("palabras, marca, unidad, precio_usd_por_unidad, quien, created_at")
      .overlaps("palabras", pal)
      .gte("created_at", new Date(Date.now() - 365 * 86_400_000).toISOString())
      .order("created_at", { ascending: false })
      .limit(300),
    dolarDelDia(),
  ]);
  if (!data?.length || !dolar) return null;
  const r = precioDeReportes({ texto, marca, unidad: lote.unidad }, data as Reporte[], dolar);
  return r ? { ...r, cantidad: lote.cantidad, total: Math.round(r.porUnidad * lote.cantidad) } : null;
}
