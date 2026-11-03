import { normalizarUnidad } from "@/lib/lote-desde-fotos-control";

// La IA junta precios; las cuentas las hace este código. Así no confunde precio
// por metro con precio por kilómetro o por bobina, ni hace conversiones de
// moneda "a ojo". Prioriza proveedores (lo que paga quien compra por volumen) y
// descarta precios fuera de lugar.

export type PrecioEncontrado = {
  tipo_vendedor: "proveedor" | "minorista";
  moneda: "ARS" | "USD";
  precio: number;
  por_cantidad: number; // cuántas unidades cubre el precio: 1 si es por metro, 1000 si es por km, 4000 si es la bobina entera
  unidad: string;
  incluye_iva: boolean | null;
};

export type Consolidado = { porUnidad: number; total: number; usados: number; deProveedores: boolean };

const IVA = 1.21;

const mediana = (v: number[]) => {
  const o = [...v].sort((a, b) => a - b);
  return o.length % 2 ? o[(o.length - 1) / 2] : (o[o.length / 2 - 1] + o[o.length / 2]) / 2;
};

// Lleva la unidad a la del lote: km → m (×1000), el resto tal cual.
function aUnidad(cantidad: number, unidad: string): { cantidad: number; unidad: string } {
  const u = normalizarUnidad(unidad).toLowerCase();
  if (u === "km" || u === "kilometro" || u === "kilometros") return { cantidad: cantidad * 1000, unidad: "m" };
  return { cantidad, unidad: u.replace(/s$/, "") === "metro" ? "m" : u };
}

export function consolidarPrecios(
  precios: PrecioEncontrado[],
  lote: { cantidad: number; unidad: string } | null,
  dolar: number | null,
): Consolidado | null {
  if (!lote || lote.cantidad <= 0) return null;
  const unidadLote = aUnidad(1, lote.unidad).unidad;
  const porUnidad = precios
    .map((p) => {
      if (!(p.precio > 0) || !(p.por_cantidad > 0)) return null;
      if (p.moneda === "USD" && !dolar) return null;
      const pesos = (p.moneda === "USD" ? p.precio * dolar! : p.precio) * (p.incluye_iva === false ? IVA : 1);
      const { cantidad, unidad } = aUnidad(p.por_cantidad, p.unidad);
      if (unidad !== unidadLote) return null;
      return { valor: pesos / cantidad, proveedor: p.tipo_vendedor === "proveedor" };
    })
    .filter((x): x is { valor: number; proveedor: boolean } => !!x);
  if (!porUnidad.length) return null;

  // Si hay precios de proveedores, mandan esos.
  const deProveedores = porUnidad.some((p) => p.proveedor);
  const grupo = (deProveedores ? porUnidad.filter((p) => p.proveedor) : porUnidad).map((p) => p.valor);
  // Fuera de lugar: menos de la mitad o más del doble del valor del medio.
  const m = mediana(grupo);
  const razonables = grupo.filter((v) => v >= m / 2 && v <= m * 2);
  const final = mediana(razonables.length ? razonables : grupo);
  return { porUnidad: final, total: Math.round(final * lote.cantidad), usados: razonables.length || grupo.length, deProveedores };
}
