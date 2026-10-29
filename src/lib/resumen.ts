import "server-only";
import { cache } from "react";
import { crearClienteServidor } from "@/lib/supabase/server";
import { TASA_COMISION, type EstadoLote, type EstadoOferta } from "@/lib/datos";

// Resumen de la cuenta para el menú del usuario en el encabezado. Lee con el
// cliente del usuario, así que los permisos de la base (RLS) aplican igual.

export type Resumen = {
  lotes: Record<"publicados" | "enRevision" | "observados" | "reservados" | "vendidos" | "total", number>;
  // Ventas
  ofertasPorResponder: number;
  ventasDelMes: number;
  ganadoDelMes: number; // neto (ya sin la comisión) de los retiros confirmados este mes
  aCobrar: number; // retiro confirmado, falta que Sobrá le transfiera
  retenido: number; // pagado por el comprador, se libera cuando confirma el retiro
  // Compras
  comprasPorPagar: number;
  comprasPorRetirar: number;
  ofertasEsperando: number;
  reclamosAbiertos: number;
  visitasSemana: number; // de todos sus lotes, últimos 7 días
  favoritosQueBajaron: number;
  lotesParaMisBusquedas: number; // coincidencias de los últimos 7 días
  // Lo que necesita que el usuario haga algo (el numerito del círculo).
  pendientes: number;
};

// Primer momento del mes en Buenos Aires (UTC-3, sin horario de verano).
function inicioDelMes() {
  const ahora = new Date(Date.now() - 3 * 3_600_000);
  return new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), 1, 3));
}

function neto(o: { monto: number; comision: number | null }) {
  return Number(o.monto) - Number(o.comision ?? Math.round(o.monto * TASA_COMISION * 100) / 100);
}

export const resumenUsuario = cache(async (usuarioId: string): Promise<Resumen> => {
  const supabase = await crearClienteServidor();
  const [{ data: lotesData }, { data: comprasData }, { count: reclamosAbiertos }, { data: visitasData }, { data: favoritosData }, { count: coincidencias }] = await Promise.all([
    supabase.from("lotes").select("id, estado").eq("vendedor_id", usuarioId),
    supabase.from("ofertas").select("estado").eq("comprador_id", usuarioId).in("estado", ["pendiente", "aceptada", "pagada"]),
    supabase.from("reclamos").select("id", { count: "exact", head: true }).eq("estado", "abierto"),
    supabase.rpc("visitas_de_mis_lotes"),
    supabase.from("favoritos").select("precio_guardado, lotes(precio_publicado, estado)"),
    supabase.from("busqueda_coincidencias").select("id", { count: "exact", head: true }).gte("created_at", new Date(Date.now() - 7 * 86_400_000).toISOString()),
  ]);
  const favoritos = (favoritosData ?? []) as unknown as { precio_guardado: number | null; lotes: { precio_publicado: number | null; estado: EstadoLote } | null }[];
  const lotes = (lotesData ?? []) as { id: string; estado: EstadoLote }[];

  type Venta = { monto: number; comision: number | null; estado: EstadoOferta; completada_at: string | null; liquidada_at: string | null };
  const { data: ventasData } = lotes.length
    ? await supabase
        .from("ofertas")
        .select("monto, comision, estado, completada_at, liquidada_at")
        .in("lote_id", lotes.map((l) => l.id))
        .in("estado", ["pendiente", "pagada", "completada"])
    : { data: [] };
  const ventas = (ventasData ?? []) as Venta[];

  const desde = inicioDelMes().getTime();
  const delMes = ventas.filter((v) => v.estado === "completada" && v.completada_at && new Date(v.completada_at).getTime() >= desde);
  const suma = (lista: Venta[]) => lista.reduce((total, v) => total + neto(v), 0);
  const contarLotes = (...estados: EstadoLote[]) => lotes.filter((l) => estados.includes(l.estado)).length;
  const compras = (comprasData ?? []) as { estado: EstadoOferta }[];
  const contarCompras = (estado: EstadoOferta) => compras.filter((c) => c.estado === estado).length;

  const resumen = {
    lotes: {
      publicados: contarLotes("publicado"),
      enRevision: contarLotes("en_revision"),
      observados: contarLotes("rechazado"),
      reservados: contarLotes("reservado"),
      vendidos: contarLotes("vendido"),
      total: lotes.length,
    },
    ofertasPorResponder: ventas.filter((v) => v.estado === "pendiente").length,
    ventasDelMes: delMes.length,
    ganadoDelMes: suma(delMes),
    aCobrar: suma(ventas.filter((v) => v.estado === "completada" && !v.liquidada_at)),
    retenido: suma(ventas.filter((v) => v.estado === "pagada")),
    comprasPorPagar: contarCompras("aceptada"),
    comprasPorRetirar: contarCompras("pagada"),
    ofertasEsperando: contarCompras("pendiente"),
    reclamosAbiertos: reclamosAbiertos ?? 0,
    visitasSemana: ((visitasData ?? []) as { semana: number }[]).reduce((total, v) => total + Number(v.semana), 0),
    favoritosQueBajaron: favoritos.filter(
      (f) => f.lotes?.estado === "publicado" && Number(f.precio_guardado) > Number(f.lotes.precio_publicado),
    ).length,
    lotesParaMisBusquedas: coincidencias ?? 0,
  };
  return {
    ...resumen,
    pendientes: resumen.ofertasPorResponder + resumen.comprasPorPagar + resumen.lotes.observados,
  };
});
