import "server-only";
import { cache } from "react";
import { crearClienteServidor } from "@/lib/supabase/server";
import { estimarPrecioMercado, type InformePrecio, type LoteParaTasar } from "@/lib/precio-mercado";
import { buscarComparables, combinarPrecio, type LoteComparable, type Referencia } from "@/lib/precio-comparables";

// Precio sugerido completo: precio de mercado del material nuevo (búsqueda web)
// más los lotes parecidos que hay en Sobrá (publicados y vendidos).

export type InformeCompleto = InformePrecio & { sugeridoMercado: number; referencia: Referencia; motivo: string };

// Lotes con los que comparar. Los vendidos también: son el mejor dato de a cuánto se vende.
export const lotesParaComparar = cache(async (): Promise<LoteComparable[]> => {
  const supabase = await crearClienteServidor();
  const { data } = await supabase
    .from("lotes")
    .select("id, titulo, categoria, condicion, items, precio_publicado, precio_pedido, estado")
    .in("estado", ["publicado", "reservado", "vendido"])
    .order("publicado_at", { ascending: false })
    .limit(1000);
  return (data ?? []) as LoteComparable[];
});

export async function referenciaEnSobra(lote: { texto: string; items?: LoteParaTasar["items"]; categoria?: string | null; condicion: LoteParaTasar["condicion"]; excluir?: string }) {
  return buscarComparables(lote, await lotesParaComparar());
}

export async function precioSugeridoCompleto(lote: LoteParaTasar & { excluir?: string }): Promise<InformeCompleto> {
  const [informe, referencia] = await Promise.all([
    estimarPrecioMercado(lote),
    referenciaEnSobra({ texto: lote.titulo, items: lote.items, categoria: lote.categoria || null, condicion: lote.condicion, excluir: lote.excluir }),
  ]);
  const { sugerido, motivo } = combinarPrecio(informe.sugerido, referencia);
  return { ...informe, sugeridoMercado: informe.sugerido, sugerido: sugerido ?? informe.sugerido, referencia, motivo };
}
