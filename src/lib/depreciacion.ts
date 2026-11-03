import { palabras } from "@/lib/recomendaciones/motor";
import type { Condicion } from "@/lib/datos";

// Cuánto vale un sobrante según QUÉ es y en qué estado está. No es lineal: un
// equipo de telecomunicaciones se desvaloriza mucho más rápido que un
// porcelanato; el cemento y la pintura vencen; una herramienta usada conserva
// bastante su valor. Son valores de referencia (fracción del precio nuevo) para
// arrancar; se ajustan con la experiencia y con lo que se vende en Sobrá.

type Tabla = Record<Condicion, number>;
//                       nuevo  sin_uso como_nuevo buen_estado con_detalles para_reparar
const t = (...v: number[]): Tabla => ({
  nuevo: v[0],
  sin_uso: v[1],
  usado_como_nuevo: v[2],
  usado_buen_estado: v[3],
  usado_con_detalles: v[4],
  para_reparar: v[5],
});

export const DEPRECIACION: Record<string, Tabla> = {
  // Durables, se venden por m²: el usado pierde porque se recupera de una obra.
  "Cerámicos y porcelanatos": t(0.75, 0.68, 0.55, 0.45, 0.3, 0.1),
  "Sanitarios y grifería": t(0.75, 0.68, 0.5, 0.4, 0.25, 0.08),
  "Electricidad e iluminación": t(0.7, 0.62, 0.5, 0.4, 0.28, 0.12),
  // Equipos electrónicos: quedan viejos rápido y el comprador desconfía del usado.
  "Fibra óptica y telecomunicaciones": t(0.65, 0.58, 0.45, 0.35, 0.25, 0.1),
  "Plomería y gas": t(0.74, 0.68, 0.55, 0.45, 0.3, 0.1),
  // Vencen o se humedecen: abierto vale mucho menos.
  "Cemento, cal y áridos": t(0.7, 0.55, 0.4, 0.35, 0.2, 0.05),
  "Pinturas e impermeabilizantes": t(0.65, 0.5, 0.35, 0.3, 0.2, 0.05),
  // Commodity: se cotiza casi por kilo, el estado importa poco.
  "Hierros y perfiles": t(0.8, 0.78, 0.7, 0.62, 0.5, 0.3),
  "Maderas y placas": t(0.75, 0.7, 0.6, 0.5, 0.35, 0.15),
  Aberturas: t(0.72, 0.65, 0.55, 0.45, 0.3, 0.12),
  "Aislantes y durlock": t(0.72, 0.65, 0.5, 0.4, 0.25, 0.08),
  // Conservan valor: se usan muchas veces.
  "Herramientas y equipos": t(0.78, 0.72, 0.62, 0.52, 0.38, 0.18),
  Otros: t(0.7, 0.62, 0.5, 0.4, 0.28, 0.1),
};

// Detalles que el vendedor puede marcar. Bajan el precio (ajuste) y el comprador
// los ve en el lote. `categorias` vacío: aplica a todas.
export type Detalle = { id: string; texto: string; ajuste: number; categorias: string[] };
export const DETALLES: Detalle[] = [
  { id: "embalaje_danado", texto: "Embalaje dañado o incompleto", ajuste: 0.93, categorias: [] },
  { id: "distinto_lote", texto: "Cajas de distintos lotes (puede variar el tono)", ajuste: 0.85, categorias: ["Cerámicos y porcelanatos"] },
  { id: "piezas_rotas", texto: "Algunas piezas rotas o despuntadas", ajuste: 0.85, categorias: ["Cerámicos y porcelanatos", "Aislantes y durlock", "Maderas y placas"] },
  { id: "vence_pronto", texto: "Vence en menos de 3 meses", ajuste: 0.7, categorias: ["Cemento, cal y áridos", "Pinturas e impermeabilizantes"] },
  { id: "bolsas_abiertas", texto: "Bolsas o envases abiertos", ajuste: 0.8, categorias: ["Cemento, cal y áridos", "Pinturas e impermeabilizantes"] },
  { id: "humedad", texto: "Estuvo expuesto a la humedad", ajuste: 0.75, categorias: ["Cemento, cal y áridos", "Maderas y placas", "Aislantes y durlock"] },
  { id: "oxido", texto: "Con óxido superficial", ajuste: 0.88, categorias: ["Hierros y perfiles", "Herramientas y equipos"] },
  { id: "rayones", texto: "Rayones o marcas leves", ajuste: 0.9, categorias: ["Sanitarios y grifería", "Aberturas", "Herramientas y equipos", "Fibra óptica y telecomunicaciones", "Electricidad e iluminación"] },
  { id: "sin_probar", texto: "Sin probar", ajuste: 0.8, categorias: ["Electricidad e iluminación", "Fibra óptica y telecomunicaciones", "Herramientas y equipos"] },
  { id: "faltan_accesorios", texto: "Faltan accesorios, fuente o cables", ajuste: 0.85, categorias: ["Electricidad e iluminación", "Fibra óptica y telecomunicaciones", "Herramientas y equipos", "Sanitarios y grifería"] },
  { id: "bloqueado", texto: "Equipo configurado o bloqueado para un proveedor", ajuste: 0.7, categorias: ["Fibra óptica y telecomunicaciones"] },
  { id: "bobina_empezada", texto: "Bobina o rollo empezado", ajuste: 0.9, categorias: ["Fibra óptica y telecomunicaciones", "Electricidad e iluminación", "Plomería y gas"] },
  { id: "sin_herrajes", texto: "Sin herrajes o accesorios de colocación", ajuste: 0.85, categorias: ["Aberturas", "Sanitarios y grifería"] },
  { id: "necesita_service", texto: "Necesita service o mantenimiento", ajuste: 0.75, categorias: ["Herramientas y equipos"] },
];

export function detallesPara(categoria: string | null | undefined) {
  return DETALLES.filter((d) => !d.categorias.length || (categoria ? d.categorias.includes(categoria) : false));
}

// Fracción del precio nuevo según el rubro, el estado y los detalles marcados.
export function factorPrecio(categoria: string | null | undefined, condicion: Condicion, detalles: string[] = []) {
  const tabla = DEPRECIACION[categoria ?? ""] ?? DEPRECIACION.Otros;
  const ajuste = detallesPara(categoria)
    .filter((d) => detalles.includes(d.id))
    .reduce((f, d) => f * d.ajuste, 1);
  return tabla[condicion] * ajuste;
}

// Por debajo de esto, el precio de lista seguramente está mal cargado (por ejemplo "5").
export const PRECIO_LISTA_MINIMO = 1000;

export function precioSugerido(precioLista: number | null, condicion: Condicion, categoria?: string | null, detalles: string[] = []): number | null {
  if (!precioLista || precioLista < PRECIO_LISTA_MINIMO) return null;
  // Redondeo a múltiplos de 1.000 para que el precio quede prolijo.
  return Math.max(1000, Math.round((precioLista * factorPrecio(categoria, condicion, detalles)) / 1000) * 1000);
}

// Para la calculadora de la portada (solo hay un texto): de qué rubro es.
const PALABRAS_RUBRO: [string, string[]][] = [
  ["Fibra óptica y telecomunicaciones", ["fibra", "optica", "onu", "olt", "splitter", "patchcord", "pigtail", "nap", "drop", "utp", "rack", "patchera", "fusionadora", "ftth", "router", "switch", "sfp"]],
  ["Cerámicos y porcelanatos", ["porcelanato", "ceramico", "azulejo", "mosaico", "guarda", "zocalo"]],
  ["Sanitarios y grifería", ["inodoro", "bacha", "bidet", "griferia", "mochila", "lavatorio", "ducha", "mampara", "vanitory"]],
  ["Electricidad e iluminación", ["cable", "termica", "disyuntor", "tablero", "led", "toma", "corrugado", "luminaria", "lampara", "reflector"]],
  ["Plomería y gas", ["cano", "termofusion", "codo", "tanque", "calefon", "termotanque", "valvula", "sifon"]],
  ["Cemento, cal y áridos", ["cemento", "cal", "arena", "piedra", "ladrillo", "pegamento", "pastina", "hormigon", "revoque", "bloque"]],
  ["Hierros y perfiles", ["hierro", "malla", "varilla", "viga", "acero", "chapa"]],
  ["Maderas y placas", ["madera", "fenolico", "tirante", "osb", "mdf", "tabla", "machimbre"]],
  ["Aberturas", ["puerta", "ventana", "porton", "abertura", "vidrio", "persiana"]],
  ["Pinturas e impermeabilizantes", ["pintura", "membrana", "esmalte", "barniz", "sellador", "enduido"]],
  ["Aislantes y durlock", ["durlock", "lana", "montante", "solera", "telgopor", "aislante"]],
  ["Herramientas y equipos", ["hormigonera", "taladro", "amoladora", "andamio", "compresor", "generador", "rotomartillo", "escalera"]],
];

export function adivinarCategoria(texto: string): string | null {
  const pal = new Set(palabras(texto));
  let mejor: [string | null, number] = [null, 0];
  for (const [categoria, claves] of PALABRAS_RUBRO) {
    const n = claves.filter((c) => pal.has(palabras(c)[0] ?? c)).length;
    if (n > mejor[1]) mejor = [categoria, n];
  }
  return mejor[0];
}
