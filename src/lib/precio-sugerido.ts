import "server-only";
import { cache } from "react";
import { crearClienteServidor } from "@/lib/supabase/server";
import { estimarPrecioMercado, type InformePrecio, type LoteParaTasar } from "@/lib/precio-mercado";
import { precioReportado } from "@/lib/precios-reportados";
import { nombreConMarca } from "@/lib/datos";
import { buscarComparables, combinarPrecio, type LoteComparable, type Referencia } from "@/lib/precio-comparables";

// Precio sugerido completo: precio de mercado del material nuevo (búsqueda web)
// más los lotes parecidos que hay en Sobrá (publicados y vendidos).

// `deUsuarios`: cuántas personas reportaron lo que pagaron (entran en la comparación de precios).
export type InformeCompleto = InformePrecio & { sugeridoMercado: number; referencia: Referencia; motivo: string; deUsuarios: number };

// Lotes con los que comparar. Los vendidos también: son el mejor dato de a cuánto se vende.
export const lotesParaComparar = cache(async (): Promise<LoteComparable[]> => {
  const supabase = await crearClienteServidor();
  const { data } = await supabase
    .from("lotes")
    .select("id, titulo, categoria, condicion, items, precio_publicado, precio_pedido, estado, detalles")
    .in("estado", ["publicado", "reservado", "vendido"])
    .order("publicado_at", { ascending: false })
    .limit(1000);
  return (data ?? []) as LoteComparable[];
});

export async function referenciaEnSobra(lote: { texto: string; items?: LoteParaTasar["items"]; categoria?: string | null; condicion: LoteParaTasar["condicion"]; detalles?: string[]; excluir?: string }) {
  return buscarComparables(lote, await lotesParaComparar());
}

// `reportado`: lo que reportaron otros usuarios (si ya se consultó antes, para no repetir).
export async function precioSugeridoCompleto(
  lote: LoteParaTasar & { excluir?: string },
  reportado?: Awaited<ReturnType<typeof precioReportado>>,
): Promise<InformeCompleto> {
  const texto = `${lote.titulo} ${lote.items.map((i) => nombreConMarca(i)).join(" ")}`;
  const deOtros = reportado !== undefined ? reportado : await precioReportado(texto, lote.items.find((i) => i.marca)?.marca);
  const [informe, referencia] = await Promise.all([
    // Lo que pagaron otros usuarios entra en la comparación junto con los precios de la web.
    estimarPrecioMercado(lote, { extras: deOtros?.precios }),
    referenciaEnSobra({ texto: lote.titulo, items: lote.items, categoria: lote.categoria || null, condicion: lote.condicion, detalles: lote.detalles, excluir: lote.excluir }),
  ]);
  const { sugerido, motivo } = combinarPrecio(informe.sugerido, referencia);
  return { ...informe, sugeridoMercado: informe.sugerido, sugerido: sugerido ?? informe.sugerido, referencia, motivo, deUsuarios: deOtros?.personas ?? 0 };
}
