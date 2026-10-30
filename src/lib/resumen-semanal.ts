import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { crearClienteAdmin } from "@/lib/supabase/admin";
import type { Lote } from "@/lib/datos";

// Resumen semanal por email: lo nuevo que le importa a cada usuario. Solo se
// manda si hay algo de verdad (no es un newsletter), una vez por semana.

type Admin = NonNullable<ReturnType<typeof crearClienteAdmin>>;
type LoteCorto = Pick<Lote, "id" | "titulo" | "precio_publicado" | "zona">;

export type Resumen = {
  paraTusBusquedas: LoteCorto[];
  favoritosQueBajaron: (LoteCorto & { antes: number })[];
  ofertasPorResponder: number;
  visitasATusLotes: number;
  enTuZona: LoteCorto[];
};

const UNA_SEMANA = 7 * 86_400_000;

export async function armarResumen(admin: Admin, usuario: { id: string; zona: string | null }): Promise<Resumen | null> {
  const desde = new Date(Date.now() - UNA_SEMANA).toISOString();
  const campos = "id, titulo, precio_publicado, zona, estado, vendedor_id, publicado_at";

  const [{ data: busquedas }, { data: favoritos }, { data: misLotes }] = await Promise.all([
    admin.from("busquedas").select("id").eq("usuario_id", usuario.id),
    admin.from("favoritos").select(`precio_guardado, lotes(${campos})`).eq("usuario_id", usuario.id),
    admin.from("lotes").select("id").eq("vendedor_id", usuario.id),
  ]);
  const idsBusquedas = (busquedas ?? []).map((b) => b.id as string);
  const idsMisLotes = (misLotes ?? []).map((l) => l.id as string);

  const [{ data: coincidencias }, { count: visitas }, { count: ofertas }, { data: zona }] = await Promise.all([
    idsBusquedas.length
      ? admin.from("busqueda_coincidencias").select(`lotes(${campos})`).in("busqueda_id", idsBusquedas).gte("created_at", desde)
      : Promise.resolve({ data: [] }),
    idsMisLotes.length
      ? admin.from("visitas_lote").select("lote_id", { count: "exact", head: true }).in("lote_id", idsMisLotes).gte("dia", desde.slice(0, 10))
      : Promise.resolve({ count: 0 }),
    idsMisLotes.length
      ? admin.from("ofertas").select("id", { count: "exact", head: true }).in("lote_id", idsMisLotes).eq("estado", "pendiente")
      : Promise.resolve({ count: 0 }),
    usuario.zona
      ? admin.from("lotes").select(campos).eq("estado", "publicado").eq("zona", usuario.zona).neq("vendedor_id", usuario.id).gte("publicado_at", desde).order("publicado_at", { ascending: false }).limit(3)
      : Promise.resolve({ data: [] }),
  ]);

  type Fila = LoteCorto & { estado: string };
  const paraTusBusquedas = [
    ...new Map(((coincidencias ?? []) as unknown as { lotes: Fila | null }[]).map((c) => c.lotes).filter((l): l is Fila => !!l && l.estado === "publicado").map((l) => [l.id, l])).values(),
  ].slice(0, 5);
  const favoritosQueBajaron = ((favoritos ?? []) as unknown as { precio_guardado: number | null; lotes: Fila | null }[])
    .filter((f) => f.lotes?.estado === "publicado" && Number(f.precio_guardado) > Number(f.lotes.precio_publicado))
    .map((f) => ({ ...f.lotes!, antes: Number(f.precio_guardado) }))
    .slice(0, 5);
  const yaMostrados = new Set(paraTusBusquedas.map((l) => l.id));
  const enTuZona = ((zona ?? []) as Fila[]).filter((l) => !yaMostrados.has(l.id));

  const resumen = { paraTusBusquedas, favoritosQueBajaron, ofertasPorResponder: ofertas ?? 0, visitasATusLotes: visitas ?? 0, enTuZona };
  // Sin nada nuevo de verdad, no se manda: lo de la zona solo acompaña.
  const hayAlgo = paraTusBusquedas.length || favoritosQueBajaron.length || resumen.ofertasPorResponder || resumen.visitasATusLotes;
  return hayAlgo ? resumen : null;
}

// Link de baja firmado: deja desactivar el resumen sin ingresar, pero solo a
// quien recibió el email.
function secreto() {
  return process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
}

export function firmaBaja(usuarioId: string) {
  return createHmac("sha256", secreto()).update(`baja-resumen:${usuarioId}`).digest("hex").slice(0, 32);
}

export function firmaBajaValida(usuarioId: string, firma: string) {
  const esperada = Buffer.from(firmaBaja(usuarioId));
  const recibida = Buffer.from(firma);
  return secreto() !== "" && esperada.length === recibida.length && timingSafeEqual(esperada, recibida);
}
