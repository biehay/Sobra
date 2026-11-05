import { pesos } from "@/lib/datos";

// El mensaje que se manda al compartir un lote (en la tarjeta y en la publicación).
export function textoParaCompartir(titulo: string, precio: number | null, off: number | null) {
  return `Mirá este lote en Sobrá: ${titulo}${precio ? `, a ${pesos(precio)}` : ""}${off ? ` (${off}% menos que nuevo)` : ""}.`;
}

// El link que se comparte: con ?ref=compartido para saber cuántas visitas llegan así.
export const rutaParaCompartir = (loteId: string) => `/lotes/${loteId}?ref=compartido`;
