import { normalizarUnidad } from "@/lib/lote-desde-fotos-control";
import { palabras } from "@/lib/recomendaciones/motor";

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
  // "usuario": lo que reportó pagar una persona en Sobrá (uno por persona). Si no, viene de la web.
  origen?: "web" | "usuario";
};

// Cómo se llegó al precio:
// - coinciden: la web y lo que pagaron los usuarios se parecen; se combinan.
// - web_descartada: no se parecen y varias personas coinciden entre sí; manda lo que pagaron.
// - usuarios_descartados: no se parecen y hay una sola persona (o no coinciden entre ellas); manda la web.
// - solo_web / solo_usuarios: hay una sola de las dos fuentes.
export type Coherencia = "coinciden" | "web_descartada" | "usuarios_descartados" | "solo_web" | "solo_usuarios";
export type Consolidado = { porUnidad: number; total: number; usados: number; deProveedores: boolean; coherencia: Coherencia };

// Hasta cuánto se pueden diferenciar la web y los usuarios para considerarlos coherentes.
const COHERENTES = 1.6;

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
      return { valor: pesos / cantidad, proveedor: p.tipo_vendedor === "proveedor", usuario: p.origen === "usuario" };
    })
    .filter((x): x is { valor: number; proveedor: boolean; usuario: boolean } => !!x);
  if (!porUnidad.length) return null;

  // La web: si hay precios de proveedores, mandan esos; se descartan los fuera de
  // lugar (menos de la mitad o más del doble del valor del medio).
  const web = porUnidad.filter((p) => !p.usuario);
  const deProveedores = web.some((p) => p.proveedor);
  const grupoWeb = (deProveedores ? web.filter((p) => p.proveedor) : web).map((p) => p.valor);
  const mW = grupoWeb.length ? mediana(grupoWeb) : null;
  const webRazonables = mW ? grupoWeb.filter((v) => v >= mW / 2 && v <= mW * 2) : [];
  const valorWeb = webRazonables.length ? mediana(webRazonables) : null;

  // Lo que pagaron los usuarios (uno por persona). Varias personas que coinciden pesan mucho.
  const usuarios = porUnidad.filter((p) => p.usuario).map((p) => p.valor);
  const valorUsuarios = usuarios.length ? mediana(usuarios) : null;
  const usuariosCoinciden = usuarios.length >= 2 && Math.max(...usuarios) / Math.min(...usuarios) <= 1.8;

  let final: number;
  let usados: number;
  let coherencia: Coherencia;
  if (valorWeb && valorUsuarios) {
    if (Math.max(valorWeb, valorUsuarios) / Math.min(valorWeb, valorUsuarios) <= COHERENTES) {
      final = mediana([...webRazonables, ...usuarios]);
      usados = webRazonables.length + usuarios.length;
      coherencia = "coinciden";
    } else if (usuariosCoinciden) {
      final = valorUsuarios;
      usados = usuarios.length;
      coherencia = "web_descartada";
    } else {
      final = valorWeb;
      usados = webRazonables.length;
      coherencia = "usuarios_descartados";
    }
  } else if (valorWeb) {
    [final, usados, coherencia] = [valorWeb, webRazonables.length, "solo_web"];
  } else {
    [final, usados, coherencia] = [valorUsuarios!, usuarios.length, "solo_usuarios"];
  }
  return { porUnidad: final, total: Math.round(final * lote.cantidad), usados, deProveedores, coherencia };
}

// ---------------------------------------------------------------------------
// Precios que reportaron los usuarios (cuánto les costó el material nuevo).
// ---------------------------------------------------------------------------
export type Reporte = {
  palabras: string[];
  marca: string | null;
  unidad: string;
  precio_usd_por_unidad: number;
  quien: string;
  created_at: string;
};

export type DeReportes = { porUnidad: number; personas: number; confiable: boolean; precios: PrecioEncontrado[] };

const UN_ANO = 365 * 86_400_000;

// Palabras del producto, sin números ni la unidad (para comparar qué es).
export function palabrasProducto(texto: string) {
  const fuera = new Set(["metro", "unidade", "unidad", "kilo", "litro", "bolsa", "caja", "rollo", "marca"]);
  return [...new Set(palabras(texto).filter((p) => !/^\d/.test(p) && !fuera.has(p)))];
}

export function precioDeReportes(
  objetivo: { texto: string; marca?: string | null; unidad: string },
  reportes: Reporte[],
  dolarHoy: number,
  ahora = Date.now(),
): DeReportes | null {
  const buscadas = new Set(palabrasProducto(objetivo.texto));
  if (!buscadas.size) return null;
  const unidad = aUnidad(1, objetivo.unidad).unidad;
  const marca = objetivo.marca?.trim().toLowerCase() || null;
  const parecidos = reportes.filter((r) => {
    if (ahora - new Date(r.created_at).getTime() > UN_ANO) return false;
    if (aUnidad(1, r.unidad).unidad !== unidad) return false;
    // La marca cambia mucho el precio: si se busca una, solo esa.
    if (marca && r.marca?.trim().toLowerCase() !== marca) return false;
    const suyas = new Set(r.palabras);
    const comunes = [...buscadas].filter((p) => suyas.has(p)).length;
    return comunes / buscadas.size >= 0.6 && comunes / Math.max(1, suyas.size) >= 0.5;
  });
  if (!parecidos.length) return null;
  // Una opinión por persona (la del medio, si reportó varias veces).
  const porPersona = new Map<string, number[]>();
  for (const r of parecidos) porPersona.set(r.quien, [...(porPersona.get(r.quien) ?? []), r.precio_usd_por_unidad * dolarHoy]);
  const valores = [...porPersona.values()].map(mediana);
  const porUnidad = mediana(valores);
  return {
    porUnidad,
    personas: valores.length,
    confiable: valores.length >= 2 && Math.max(...valores) / Math.min(...valores) <= 1.8,
    precios: valores.map((v) => ({ tipo_vendedor: "proveedor" as const, moneda: "ARS" as const, precio: v, por_cantidad: 1, unidad, incluye_iva: true, origen: "usuario" as const })),
  };
}
