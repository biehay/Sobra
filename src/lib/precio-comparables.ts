import type { Condicion, Item } from "@/lib/datos";
import { factorPrecio } from "@/lib/depreciacion";
import { palabras } from "@/lib/recomendaciones/motor";
import { normalizarUnidad } from "@/lib/lote-desde-fotos-control";

// Precio sugerido con lo que ya hay en Sobrá: lotes parecidos publicados o
// vendidos, llevados a precio por unidad (m², metro, unidad, bolsa...) y al mismo
// estado. Es la forma habitual de tasar algo usado: el precio nuevo es el techo y
// lo que manda es a cuánto se ofrece y se vende lo parecido. Sin IA: solo cuentas.

export type LoteComparable = {
  id: string;
  titulo: string;
  categoria: string;
  condicion: Condicion;
  items: Item[];
  precio_publicado: number | null;
  precio_pedido: number;
  estado: string;
  detalles?: string[];
};

export type Comparable = { id: string; titulo: string; precio: number; porUnidad: number; vendido: boolean };
export type Referencia = {
  unidad: string | null;
  cantidad: number | null;
  comparables: Comparable[];
  medianaPorUnidad: number | null;
  estimado: number | null;
  // Si sirven como referencia: al menos 2 y con precios por unidad parecidos entre sí.
  // Si uno cuesta más del doble y medio que otro, probablemente no son lo mismo.
  confiable: boolean;
};

const UNIDAD_EN_TEXTO = /(\d+(?:[.,]\d+)?)\s*(m2|m²|mts2|metros?\s*cuadrados?|metros?|mts?|m|unidades|unid|u|bolsas?|kg|rollos?|cajas?|baldes?|l|litros?)(?![\p{L}\d])/iu;

// Qué cantidad y en qué unidad: el material principal (si hay uno solo) o lo que
// diga el texto ("38 m² de porcelanato", "bobina de 2000 m").
export function cantidadPrincipal(texto: string, items: Item[] = []): { cantidad: number; unidad: string } | null {
  const validos = items.filter((i) => i.nombre.trim() && i.cantidad > 0);
  if (validos.length === 1) return { cantidad: validos[0].cantidad, unidad: normalizarUnidad(validos[0].unidad) };
  const m = texto.match(UNIDAD_EN_TEXTO);
  if (!m) return null;
  const unidad = normalizarUnidad(m[2]).replace(/s$/, "");
  return { cantidad: Number(m[1].replace(",", ".")), unidad: unidad === "metro" || unidad === "mt" ? "m" : unidad };
}

const mediana = (v: number[]) => {
  const o = [...v].sort((a, b) => a - b);
  return o.length % 2 ? o[(o.length - 1) / 2] : (o[o.length / 2 - 1] + o[o.length / 2]) / 2;
};

// Palabras del producto, sin números ni medidas sueltas (para comparar qué es).
const delProducto = (texto: string) => new Set(palabras(texto).filter((p) => !/^\d/.test(p)));

export function buscarComparables(
  objetivo: { texto: string; items?: Item[]; categoria?: string | null; condicion: Condicion; detalles?: string[]; excluir?: string },
  lotes: LoteComparable[],
): Referencia {
  const principal = cantidadPrincipal(objetivo.texto, objetivo.items);
  const vacia: Referencia = { unidad: principal?.unidad ?? null, cantidad: principal?.cantidad ?? null, comparables: [], medianaPorUnidad: null, estimado: null, confiable: false };
  if (!principal) return vacia;
  const buscadas = delProducto(`${objetivo.texto} ${(objetivo.items ?? []).map((i) => i.nombre).join(" ")}`);
  if (!buscadas.size) return vacia;

  const comparables: Comparable[] = [];
  for (const l of lotes) {
    if (l.id === objetivo.excluir || !["publicado", "reservado", "vendido"].includes(l.estado)) continue;
    if (objetivo.categoria && l.categoria !== objetivo.categoria) continue;
    const suyo = cantidadPrincipal(l.titulo, l.items);
    if (!suyo || suyo.unidad !== principal.unidad || suyo.cantidad <= 0) continue;
    const pal = delProducto(`${l.titulo} ${l.items.map((i) => i.nombre).join(" ")}`);
    const comunes = [...buscadas].filter((p) => pal.has(p)).length;
    // Que sea lo mismo: la mayoría de lo que se busca tiene que estar en el lote.
    if (comunes / buscadas.size < 0.5) continue;
    const precio = Number(l.precio_publicado ?? l.precio_pedido);
    // Llevado al mismo estado (y detalles) que el que se quiere tasar, con la tabla de su rubro.
    const suTexto = `${l.titulo} ${l.items.map((i) => i.nombre).join(" ")}`;
    const porUnidad =
      (precio / suyo.cantidad) *
      (factorPrecio(l.categoria, objetivo.condicion, objetivo.detalles, suTexto) / factorPrecio(l.categoria, l.condicion, l.detalles, suTexto));
    comparables.push({ id: l.id, titulo: l.titulo, precio, porUnidad, vendido: l.estado === "vendido" });
  }
  if (!comparables.length) return vacia;
  const precios = comparables.map((c) => c.porUnidad);
  const medianaPorUnidad = mediana(precios);
  return {
    ...vacia,
    confiable: comparables.length >= 2 && Math.max(...precios) / Math.min(...precios) <= 2.5,
    comparables: comparables.sort((a, b) => Number(b.vendido) - Number(a.vendido) || a.porUnidad - b.porUnidad).slice(0, 5),
    medianaPorUnidad: Math.round(medianaPorUnidad),
    estimado: Math.round(medianaPorUnidad * principal.cantidad),
  };
}

const aMiles = (n: number) => Math.max(1000, Math.round(n / 1000) * 1000);

// Une las dos referencias. Si en Sobrá lo parecido está más barato que el cálculo
// con el precio nuevo, sugiere apenas por debajo para que se venda; si no, usa el
// cálculo con el precio nuevo. Con menos de 2 parecidos, Sobrá no alcanza como referencia.
export function combinarPrecio(sugeridoMercado: number | null, ref: Referencia): { sugerido: number | null; motivo: string } {
  const alcanza = ref.confiable && ref.estimado;
  if (sugeridoMercado && alcanza && ref.estimado! < sugeridoMercado) {
    return {
      sugerido: aMiles(ref.estimado! * 0.97),
      motivo: `En Sobrá hay ${ref.comparables.length} lotes parecidos más baratos que el cálculo con el precio nuevo: lo sugerimos apenas por debajo de ellos para que se venda.`,
    };
  }
  if (sugeridoMercado) {
    return {
      sugerido: aMiles(sugeridoMercado),
      motivo: alcanza
        ? `Está en línea con los ${ref.comparables.length} lotes parecidos que hay en Sobrá.`
        : ref.comparables.length >= 2
          ? "Calculado con el precio de mercado del material nuevo y el estado (los lotes parecidos de Sobrá tienen precios muy distintos entre sí)."
          : "Calculado con el precio de mercado del material nuevo y el estado.",
    };
  }
  if (alcanza) return { sugerido: aMiles(ref.estimado!), motivo: `Según ${ref.comparables.length} lotes parecidos que hay en Sobrá.` };
  return { sugerido: null, motivo: "" };
}
