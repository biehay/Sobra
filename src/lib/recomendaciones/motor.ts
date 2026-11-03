import { nombreConMarca } from "@/lib/datos";
// Motor de recomendaciones de Sobrá. Funciones puras (sin base de datos), para
// poder probarlas: reciben las señales del usuario y los lotes candidatos y
// devuelven los mejores, variados y con el motivo de cada uno.
//
// Mezcla:
// 1. Contenido: misma categoría, palabras (con sinónimos de obra), medidas
//    (60x60, 20 mm), zona y zonas vecinas, precio y estado.
// 2. Señales colectivas: "otros que vieron esto también vieron" (ya agregadas).
// 3. Complementos de obra: si compraste cerámicos, te falta pegamento y pastina.
// 4. Lo que la persona guardó en "Lo busco" (lo más explícito que hay).
// 5. La confianza en el vendedor (ventas sin reclamos).
//
// Y razona como alguien que conoce de obra (lo que no hace un marketplace general):
// - Etapas de obra: deduce en qué etapa está la persona (estructura,
//   cerramientos, instalaciones, terminaciones) y le anticipa la siguiente.
// - Rendimientos: con lo que compró (45 m² de porcelanato) calcula cuánto
//   complemento necesita (~5 kg de pegamento por m²) y prefiere el lote que alcanza.
// - Un solo viaje: si ya tiene algo para retirar, suben los lotes del mismo
//   vendedor o la misma localidad.
// - Anti-desperdicio: más exposición a los sobrantes que casi nadie vio.
//
// El conocimiento de cada producto viene de su ficha técnica (fichas.ts): qué
// es, cómo se usa y qué complementos necesita, para cualquier rubro (obra,
// telecomunicaciones, electrónica...). Las listas escritas a mano de abajo son
// el respaldo para los lotes que todavía no tienen ficha.
// Todo pesa más si es reciente; al final se reordena para que haya variedad y
// se deja un lugar para descubrir algo de otra categoría.

import type { Condicion, Lote } from "@/lib/datos";

export type TipoSenal = "vista" | "favorito" | "oferta" | "compra";
export type Senal = { lote: Lote; tipo: TipoSenal; fecha: string; veces?: number };
export type Colectiva = { en_comun: number; popularidad: number };
export type Motivo = {
  tipo: "complemento" | "busqueda" | "viaje" | "etapa" | "colectiva" | "parecido" | "zona" | "descuento" | "descubrir" | "nuevo";
  texto: string;
};
// Ficha técnica de un lote (la arma la IA una vez; ver fichas.ts).
export type UnidadFicha = "m2" | "m" | "u" | "kg" | "l" | "ninguna";
export type Ficha = {
  material: string;
  rubro: string;
  proceso: string;
  etapa: "estructura" | "cerramientos" | "instalaciones" | "terminaciones" | "otro";
  palabras_clave: string[];
  unidad: UnidadFicha;
  cantidad: number | null;
  complementos: { material: string; por_que: string; palabras_clave: string[]; cantidad_por_unidad: number | null; unidad: UnidadFicha }[];
};
// Una búsqueda guardada en "Lo busco".
export type Busqueda = { texto: string; categoria: string | null; zona: string | null; fecha: string };
// `complemento`: si además complementa algo que vio o compró, el motivo de ese
// complemento (aunque el motivo principal sea otro, por ejemplo una búsqueda).
export type Recomendacion = { lote: Lote; puntaje: number; motivo: Motivo; complemento: Motivo | null };

export type Contexto = {
  senales: Senal[];
  candidatos: Lote[];
  usuarioId?: string | null;
  zonaUsuario?: string | null;
  colectivas?: Map<string, Colectiva>;
  popularidad?: Map<string, number>;
  busquedas?: Busqueda[];
  // De 0 a 1 por vendedor (sin datos se toma 0,5).
  confianza?: Map<string, number>;
  // Fichas técnicas por id de lote (de las señales y de los candidatos).
  fichas?: Map<string, Ficha>;
  // Lo que ya tiene para retirar (compras aceptadas o pagadas): dónde y de quién.
  retiros?: { vendedorId: string; zona: string; localidad: string; titulo: string }[];
  ahora?: number;
};

// Cuánto dice cada acción sobre el interés de la persona.
export const PESOS: Record<TipoSenal, number> = { vista: 1, favorito: 3, oferta: 5, compra: 8 };
// Una búsqueda guardada dice mucho: la persona escribió lo que necesita.
const PESO_BUSQUEDA = 4;

// Zonas cercanas entre sí: un lote en una zona vecina también sirve, un poco menos.
const ZONAS_VECINAS: Record<string, string[]> = {
  CABA: ["GBA Norte", "GBA Oeste", "GBA Sur"],
  "GBA Norte": ["CABA", "GBA Oeste"],
  "GBA Oeste": ["CABA", "GBA Norte", "GBA Sur"],
  "GBA Sur": ["CABA", "GBA Oeste", "La Plata y alrededores"],
  "La Plata y alrededores": ["GBA Sur"],
};
// Una señal de hace 14 días vale la mitad que una de hoy.
const VIDA_MEDIA_DIAS = 14;

// Qué categorías suelen hacer falta junto con otra en una obra.
export const COMPLEMENTOS_CATEGORIA: Record<string, string[]> = {
  "Cerámicos y porcelanatos": ["Cemento, cal y áridos", "Sanitarios y grifería", "Pinturas e impermeabilizantes"],
  "Sanitarios y grifería": ["Plomería y gas", "Cerámicos y porcelanatos"],
  "Plomería y gas": ["Sanitarios y grifería", "Herramientas y equipos"],
  "Electricidad e iluminación": ["Aislantes y durlock", "Herramientas y equipos"],
  // En telecomunicaciones los complementos son del mismo rubro: los resuelven las
  // reglas por material y las fichas técnicas.
  "Fibra óptica y telecomunicaciones": [],
  "Cemento, cal y áridos": ["Hierros y perfiles", "Cerámicos y porcelanatos", "Maderas y placas"],
  "Hierros y perfiles": ["Cemento, cal y áridos", "Herramientas y equipos"],
  "Maderas y placas": ["Pinturas e impermeabilizantes", "Herramientas y equipos"],
  Aberturas: ["Pinturas e impermeabilizantes", "Aislantes y durlock"],
  "Pinturas e impermeabilizantes": ["Herramientas y equipos", "Aislantes y durlock"],
  "Aislantes y durlock": ["Hierros y perfiles", "Pinturas e impermeabilizantes", "Electricidad e iluminación"],
  "Herramientas y equipos": [],
  Otros: [],
};

// Y qué materiales puntuales van con otros (más preciso que la categoría).
const COMPLEMENTOS_MATERIAL_TEXTO: Record<string, string[]> = {
  porcelanato: ["pegamento", "pastina", "nivelador", "zocalo"],
  ceramico: ["pegamento", "pastina", "zocalo"],
  azulejo: ["pegamento", "pastina"],
  durlock: ["perfil", "masilla", "cinta", "tornillo", "lana"],
  placa: ["perfil", "masilla", "tornillo"],
  cemento: ["arena", "cal", "hierro", "piedra"],
  ladrillo: ["cemento", "cal", "arena", "hierro"],
  inodoro: ["deposito", "griferia", "flexible", "bidet"],
  bacha: ["griferia", "sifon", "flexible"],
  griferia: ["flexible", "sifon"],
  cano: ["codo", "llave", "union", "termofusion"],
  cable: ["termica", "toma", "llave", "caja", "corrugado"],
  ventana: ["sellador", "silicona", "premarco"],
  puerta: ["bisagra", "cerradura", "picaporte", "marco"],
  pintura: ["rodillo", "pincel", "enduido", "fijador"],
  membrana: ["imprimacion", "pintura"],
  // Fibra óptica y telecomunicaciones.
  fibra: ["conector", "pigtail", "patchcord", "splitter", "empalme", "manguito", "herraje", "preformado", "roseta"],
  bobina: ["conector", "empalme", "herraje", "preformado"],
  drop: ["conector", "roseta", "tensor", "herraje"],
  onu: ["patchcord", "router", "roseta"],
  olt: ["sfp", "patchcord", "splitter", "odf"],
  splitter: ["conector", "caja", "nap", "patchcord"],
  nap: ["splitter", "conector", "drop", "precinto"],
  fusionadora: ["cortadora", "manguito", "peladora"],
  utp: ["ficha", "jack", "patchera", "patchcord"],
  rack: ["patchera", "patchcord", "utp", "ordenador", "bandeja", "switch"],
};

const VACIAS = new Set(
  "de del la las el los un una unos unas y o en con para por sin x al lote kg mts mt cm mm u un uni unidades".split(" "),
);

// Etapas de una obra, en orden. Cada categoría cae en una.
export const ETAPAS = ["estructura", "cerramientos", "instalaciones", "terminaciones"] as const;
const ETAPA_DE: Record<string, number> = {
  "Hierros y perfiles": 0,
  "Cemento, cal y áridos": 0,
  "Maderas y placas": 0,
  Aberturas: 1,
  "Aislantes y durlock": 1,
  "Plomería y gas": 2,
  "Electricidad e iluminación": 2,
  "Fibra óptica y telecomunicaciones": 2,
  "Cerámicos y porcelanatos": 3,
  "Sanitarios y grifería": 3,
  "Pinturas e impermeabilizantes": 3,
};

// Rendimientos: cuánto complemento hace falta por unidad del material principal.
// Valores de referencia de obra (aproximados), para comparar cantidades.
const RENDIMIENTOS_TEXTO: Record<string, { unidad: "m2" | "u"; complemento: string; kgPorUnidad: number }[]> = {
  porcelanato: [
    { unidad: "m2", complemento: "pegamento", kgPorUnidad: 5 },
    { unidad: "m2", complemento: "pastina", kgPorUnidad: 0.5 },
  ],
  ceramico: [
    { unidad: "m2", complemento: "pegamento", kgPorUnidad: 4 },
    { unidad: "m2", complemento: "pastina", kgPorUnidad: 0.4 },
  ],
  durlock: [{ unidad: "u", complemento: "masilla", kgPorUnidad: 1 }],
  placa: [{ unidad: "u", complemento: "masilla", kgPorUnidad: 1 }],
};
// Si el lote no dice cuánto pesa cada bolsa, se toma lo habitual.
const KG_POR_BOLSA: Record<string, number> = { pegamento: 30, pastina: 1, masilla: 32, cemento: 50, cal: 25 };

// Palabras distintas que en obra quieren decir lo mismo (se comparan como una).
const SINONIMOS_TEXTO: Record<string, string> = {
  ceramica: "ceramico",
  revestimiento: "ceramico",
  baldosa: "ceramico",
  tubo: "cano",
  canilla: "griferia",
  conductor: "cable",
  yeso: "durlock",
  latex: "pintura",
  esmalte: "pintura",
  impermeabilizante: "membrana",
  portland: "cemento",
  perfileria: "perfil",
  aberturas: "abertura",
  optico: "optica",
  latiguillo: "patchcord",
  jumper: "patchcord",
  patch: "patchcord",
  pachcord: "patchcord",
  derivador: "splitter",
  divisor: "splitter",
  empalmadora: "fusionadora",
};

// Raíz simple para que singular y plural coincidan: "llaves" y "llave" quedan
// "llav"; "perfiles" y "perfil", "perfil". No tiene que ser linda, tiene que
// dar lo mismo para las dos formas.
function raiz(p: string) {
  if (p.length <= 4 || /\d/.test(p)) return p;
  return p.replace(/s$/, "").replace(/([^aeiou])e$/, "$1");
}

// Palabras útiles de un texto: minúsculas, sin tildes, sin plural y sin las vacías.
export function palabras(texto: string): string[] {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((p) => p.length >= 3 && !VACIAS.has(p))
    .map(raiz)
    .map((p) => SINONIMOS[p] ?? p);
}

const SINONIMOS: Record<string, string> = Object.fromEntries(
  Object.entries(SINONIMOS_TEXTO).map(([k, v]) => [raiz(k), raiz(v)]),
);

// Medidas del material ("60x60", "2,5 mm", "20 mm"): dos lotes con la misma
// medida se parecen mucho más (mismo porcelanato, mismo caño).
export function medidas(texto: string): string[] {
  const t = texto.toLowerCase().replace(/,/g, ".");
  const res = new Set<string>();
  for (const m of t.matchAll(/(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)/g)) res.add(`med:${m[1]}x${m[2]}`);
  for (const m of t.matchAll(/(\d+(?:\.\d+)?)\s*(mm|cm|m2|m²|kg|lts?|litros?|pulgadas?|")(?![a-z])/g)) {
    const unidad = m[2].startsWith("l") ? "l" : m[2] === "m²" ? "m2" : m[2].startsWith("pulg") || m[2] === '"' ? "pulg" : m[2];
    // Las cantidades (m2, kg, litros) no son medidas del producto: solo mm, cm y pulgadas.
    if (["mm", "cm", "pulg"].includes(unidad)) res.add(`med:${m[1]}${unidad}`);
  }
  return [...res];
}

// Los mismos, pasados por la misma raíz que las palabras de los lotes.
export const COMPLEMENTOS_MATERIAL: Record<string, string[]> = Object.fromEntries(
  Object.entries(COMPLEMENTOS_MATERIAL_TEXTO).map(([k, v]) => [palabras(k)[0], v.map((x) => palabras(x)[0])]),
);

export const RENDIMIENTOS = Object.fromEntries(
  Object.entries(RENDIMIENTOS_TEXTO).map(([k, v]) => [palabras(k)[0], v.map((r) => ({ ...r, complemento: palabras(r.complemento)[0] }))]),
);

// Cuánto hay de un material en un lote, en m², unidades o kg. Mira los
// materiales cargados y, si no, el título ("45 m²", "x 20 bolsas", "30 kg").
export function cantidadDe(lote: Lote, unidad: "m2" | "u" | "kg"): number | null {
  const norm = (u: string) => {
    const x = u.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace("²", "2").trim();
    if (/^m2|^mts?2|^metros? cuadrados?/.test(x)) return "m2";
    if (/^kg|^kilo/.test(x)) return "kg";
    if (/^bolsa/.test(x)) return "bolsa";
    if (/^(u|un|unidad|placa|pieza)/.test(x)) return "u";
    return x;
  };
  const kgPorBolsa = () => {
    const enTexto = `${lote.titulo} ${lote.descripcion}`.toLowerCase().match(/(\d+(?:[.,]\d+)?)\s*kg/);
    if (enTexto) return Number(enTexto[1].replace(",", "."));
    const material = palabras(lote.titulo).find((p) => KG_POR_BOLSA[p]);
    return material ? KG_POR_BOLSA[material] : 25;
  };
  let total = 0;
  for (const item of lote.items) {
    const u = norm(item.unidad);
    if (u === unidad) total += item.cantidad;
    else if (unidad === "kg" && u === "bolsa") total += item.cantidad * kgPorBolsa();
  }
  if (total > 0) return total;
  const t = lote.titulo.toLowerCase().replace(/,/g, ".");
  if (unidad === "m2") {
    const m = t.match(/(\d+(?:\.\d+)?)\s*(m2|m²|mts2|metros)/);
    if (m) return Number(m[1]);
  }
  if (unidad === "kg") {
    const bolsas = t.match(/(\d+)\s*bolsas?/);
    if (bolsas) return Number(bolsas[1]) * kgPorBolsa();
    const kg = t.match(/(\d+(?:\.\d+)?)\s*kg/);
    if (kg) return Number(kg[1]);
  }
  if (unidad === "u") {
    const u = t.match(/x\s*(\d+)(?!\s*(m|kg|mm|cm|l))/);
    if (u) return Number(u[1]);
  }
  return null;
}

// Palabras de un lote más las de su ficha técnica (sinónimos y nombre genérico).
function palabrasConFicha(lote: Lote, fichas: Map<string, Ficha>) {
  const ficha = fichas.get(lote.id);
  return ficha ? [...palabrasDe(lote), ...palabras(`${ficha.material} ${ficha.palabras_clave.join(" ")}`)] : palabrasDe(lote);
}

const ETAPA_POR_NOMBRE: Record<string, number> = { estructura: 0, cerramientos: 1, instalaciones: 2, terminaciones: 3 };
// La etapa sale de la ficha si la hay; si no, de la categoría.
function etapaDe(lote: Lote, fichas: Map<string, Ficha>): number | undefined {
  const ficha = fichas.get(lote.id);
  if (ficha) return ETAPA_POR_NOMBRE[ficha.etapa];
  return ETAPA_DE[lote.categoria];
}

// Si un lote es el complemento que pide una ficha: tiene el nombre del
// complemento, o al menos dos de sus palabras clave.
function cumpleComplemento(c: ComplementoFicha, pal: Map<string, number>) {
  if (c.nucleo.length && c.nucleo.every((p) => pal.has(p))) return true;
  let coincidencias = 0;
  for (const p of c.palabras) if (pal.has(p)) coincidencias++;
  return coincidencias >= Math.min(2, c.palabras.size);
}

// Cuánto hay en el lote en la unidad que pide la ficha (de su propia ficha o del texto).
function cantidadEn(lote: Lote, unidad: UnidadFicha, fichas: Map<string, Ficha>): number | null {
  const ficha = fichas.get(lote.id);
  if (ficha?.cantidad && ficha.unidad === unidad) return ficha.cantidad;
  return unidad === "m2" || unidad === "u" || unidad === "kg" ? cantidadDe(lote, unidad) : null;
}

// Qué tan bien le alcanza: 1 si cubre lo que necesita sin sobrar demasiado.
function ajusteCantidad(ofrecido: number, necesario: number) {
  const r = ofrecido / necesario;
  // Que falte es peor que que sobre: con lo que falta no se termina la obra.
  return r >= 1 ? Math.max(0.75, 1 - (r - 1) * 0.1) : r;
}

// Palabras y medidas de un lote. Las medidas van dos veces: pesan el doble.
// Solo el producto (título, materiales y ficha), sin la descripción: para
// detectar complementos. En la descripción aparecen cosas como "cajas cerradas"
// que no hablan del producto.
function palabrasDeProducto(lote: Lote, fichas: Map<string, Ficha>): string[] {
  const ficha = fichas.get(lote.id);
  const texto = `${lote.titulo} ${lote.items.map((i) => nombreConMarca(i)).join(" ")}${ficha ? ` ${ficha.material} ${ficha.palabras_clave.join(" ")}` : ""}`;
  return palabras(texto);
}

// Reglas escritas a mano que no aplican en otros rubros: un cable de fibra
// óptica no lleva térmicas ni cajas de luz (eso lo resuelve su ficha técnica).
const EXCEPCIONES_MATERIAL: Record<string, string[]> = {
  cabl: ["fibra", "optica", "coaxil", "utp", "red", "telefonico", "nap", "empalme", "ftth", "splitter", "drop"],
  // "Porcelanato símil cemento" describe el aspecto, no el material.
  cemento: ["simil", "porcelanato", "ceramico", "microcemento"],
};

// Y del otro lado: lo que pide esa regla tampoco se busca en productos de ese
// otro rubro (la "caja" de un cable eléctrico no es una caja de empalme de fibra).
const EXCEPCIONES_COMPLEMENTO: Record<string, string[]> = {};
for (const [regla, excepciones] of Object.entries(EXCEPCIONES_MATERIAL)) {
  for (const c of COMPLEMENTOS_MATERIAL[regla] ?? []) EXCEPCIONES_COMPLEMENTO[c] = [...(EXCEPCIONES_COMPLEMENTO[c] ?? []), ...excepciones];
}

function palabrasDe(lote: Lote): string[] {
  const texto = `${lote.titulo} ${lote.items.map((i) => nombreConMarca(i)).join(" ")} ${lote.descripcion}`;
  const med = medidas(texto);
  return [...palabras(texto), ...med, ...med];
}

function precio(lote: Lote) {
  return Number(lote.precio_publicado ?? lote.precio_pedido) || 0;
}

function descuentoDe(lote: Lote) {
  const p = precio(lote);
  return lote.precio_lista && lote.precio_lista > p ? 1 - p / lote.precio_lista : 0;
}

function decaimiento(fecha: string, ahora: number) {
  const dias = Math.max(0, (ahora - new Date(fecha).getTime()) / 86_400_000);
  return Math.pow(0.5, dias / VIDA_MEDIA_DIAS);
}

function similitudCoseno(a: Map<string, number>, b: Map<string, number>) {
  let producto = 0;
  let na = 0;
  let nb = 0;
  for (const [k, v] of a) {
    na += v * v;
    const w = b.get(k);
    if (w) producto += v * w;
  }
  for (const v of b.values()) nb += v * v;
  return na && nb ? producto / Math.sqrt(na * nb) : 0;
}

function contar(lista: string[], peso = 1, en = new Map<string, number>()) {
  for (const p of lista) en.set(p, (en.get(p) ?? 0) + peso);
  return en;
}

// Lo que le interesa a la persona, sumando sus señales con su peso y su antigüedad.
type Interes = {
  categorias: Map<string, number>;
  palabras: Map<string, number>;
  zonas: Map<string, number>;
  condiciones: Map<Condicion, number>;
  logPrecio: number | null;
  // Para los complementos: categorías y palabras de lo que compró u ofertó
  // (pesan mucho) y de lo que miró (pesan poco), con el lote que lo originó.
  complementos: Map<string, { peso: number; origen: Lote }>;
  total: number;
  // Qué parte del interés es "quiero algo así" (las compras cuentan menos).
  totalParecido: number;
  // La señal que más pesa, para explicar las recomendaciones.
  principal: Lote | null;
  // Cuánto de cada etapa de obra hay en lo que miró y compró.
  etapas: number[];
  // Lo que necesita según rendimientos: complemento -> kg y de qué compra viene.
  necesidades: Map<string, { kg: number; origen: Lote; cantidad: number; unidad: string }>;
  // Complementos que pide el proceso de lo que compró o miró, según su ficha.
  deFichas: ComplementoFicha[];
};

type ComplementoFicha = {
  palabras: Set<string>;
  nucleo: string[]; // las palabras del nombre del complemento
  peso: number;
  origen: Lote;
  materialOrigen: string;
  porQue: string;
  necesario: number | null; // cuánto hace falta en total
  unidad: UnidadFicha;
};

export function armarInteres(senales: Senal[], ahora = Date.now(), busquedas: Busqueda[] = [], fichas = new Map<string, Ficha>()): Interes {
  const interes: Interes = {
    categorias: new Map(),
    palabras: new Map(),
    zonas: new Map(),
    condiciones: new Map(),
    logPrecio: null,
    complementos: new Map(),
    total: 0,
    totalParecido: 0,
    principal: null,
    etapas: [0, 0, 0, 0],
    necesidades: new Map(),
    deFichas: [],
  };
  let pesoPrincipal = 0;
  let sumaLog = 0;
  let pesoPrecio = 0;
  for (const s of senales) {
    const peso = PESOS[s.tipo] * Math.min(s.veces ?? 1, 3) * decaimiento(s.fecha, ahora);
    interes.total += peso;
    // Lo que ya compró pesa menos como "quiero más de esto" que como "me falta lo que va con esto".
    const pesoParecido = s.tipo === "compra" ? peso * 0.4 : peso;
    interes.totalParecido += pesoParecido;
    if (peso > pesoPrincipal) {
      pesoPrincipal = peso;
      interes.principal = s.lote;
    }
    interes.categorias.set(s.lote.categoria, (interes.categorias.get(s.lote.categoria) ?? 0) + pesoParecido);
    contar(palabrasConFicha(s.lote, fichas), pesoParecido, interes.palabras);
    interes.zonas.set(s.lote.zona, (interes.zonas.get(s.lote.zona) ?? 0) + peso);
    interes.condiciones.set(s.lote.condicion, (interes.condiciones.get(s.lote.condicion) ?? 0) + peso);
    const p = precio(s.lote);
    if (p > 0) {
      sumaLog += Math.log(p) * peso;
      pesoPrecio += peso;
    }
    const etapa = etapaDe(s.lote, fichas);
    if (etapa !== undefined) interes.etapas[etapa] += peso;
    // Lo que pide el proceso físico de este producto, según su ficha técnica.
    const ficha = fichas.get(s.lote.id);
    if (ficha) {
      const pesoFicha = s.tipo === "compra" || s.tipo === "oferta" ? peso : peso * 0.3;
      for (const c of ficha.complementos) {
        const nucleo = palabras(c.material);
        interes.deFichas.push({
          palabras: new Set([...nucleo, ...palabras(c.palabras_clave.join(" "))]),
          nucleo,
          peso: pesoFicha,
          origen: s.lote,
          materialOrigen: ficha.material,
          porQue: c.por_que,
          necesario: c.cantidad_por_unidad && ficha.cantidad ? c.cantidad_por_unidad * ficha.cantidad : null,
          unidad: c.unidad,
        });
      }
    }
    // Rendimientos: solo con lo que compró u ofertó (lo que de verdad va a usar).
    if (s.tipo === "compra" || s.tipo === "oferta") {
      for (const material of new Set(palabrasDeProducto(s.lote, fichas))) {
        for (const r of RENDIMIENTOS[material] ?? []) {
          const cantidad = cantidadDe(s.lote, r.unidad);
          if (!cantidad) continue;
          const kg = cantidad * r.kgPorUnidad;
          const actual = interes.necesidades.get(r.complemento);
          if (!actual || actual.kg < kg) interes.necesidades.set(r.complemento, { kg, origen: s.lote, cantidad, unidad: r.unidad });
        }
      }
    }
    const pesoComplemento = s.tipo === "compra" || s.tipo === "oferta" ? peso : peso * 0.3;
    const claves = [
      ...(COMPLEMENTOS_CATEGORIA[s.lote.categoria] ?? []).map((c) => `cat:${c}`),
      ...(() => {
        const propias = palabrasDeProducto(s.lote, fichas);
        const excluida = (w: string) => (EXCEPCIONES_MATERIAL[w] ?? []).some((x) => propias.includes(x));
        return propias.flatMap((w) => (excluida(w) ? [] : (COMPLEMENTOS_MATERIAL[w] ?? []).map((m) => `pal:${m}`)));
      })(),
    ];
    for (const clave of new Set(claves)) {
      const actual = interes.complementos.get(clave);
      if (!actual || actual.peso < pesoComplemento) interes.complementos.set(clave, { peso: pesoComplemento, origen: s.lote });
      else actual.peso += pesoComplemento * 0.5;
    }
  }
  // Lo que guardó en "Lo busco": suma a la categoría, las palabras y la zona.
  for (const b of busquedas) {
    const peso = PESO_BUSQUEDA * Math.max(0.5, decaimiento(b.fecha, ahora));
    interes.total += peso;
    interes.totalParecido += peso;
    if (b.categoria) interes.categorias.set(b.categoria, (interes.categorias.get(b.categoria) ?? 0) + peso);
    contar(palabras(b.texto), peso, interes.palabras);
    if (b.zona) interes.zonas.set(b.zona, (interes.zonas.get(b.zona) ?? 0) + peso);
  }
  interes.logPrecio = pesoPrecio ? sumaLog / pesoPrecio : null;
  return interes;
}

function maximo(m: Map<unknown, number>) {
  let max = 0;
  for (const v of m.values()) if (v > max) max = v;
  return max;
}

// Cuánto se parecen dos lotes (para dar variedad y para saber "porque viste X").
export function parecido(a: Lote, b: Lote) {
  const pa = new Set(palabrasDe(a));
  const pb = new Set(palabrasDe(b));
  let comunes = 0;
  for (const p of pa) if (pb.has(p)) comunes++;
  const jaccard = pa.size + pb.size ? comunes / (pa.size + pb.size - comunes) : 0;
  return (a.categoria === b.categoria ? 0.6 : 0) + 0.4 * jaccard;
}

// Pesos de cada parte del puntaje. Suman 1.
const W = {
  categoria: 0.15,
  palabras: 0.18,
  complemento: 0.17,
  colectiva: 0.1,
  busqueda: 0.08,
  etapa: 0.06,
  viaje: 0.05,
  zona: 0.08,
  precio: 0.04,
  descuento: 0.03,
  confianza: 0.03,
  exposicion: 0.03,
};

// Si un lote cumple una búsqueda guardada: todas sus palabras, su categoría y su zona.
function cumpleBusqueda(b: Busqueda, lote: Lote, pal: Map<string, number>) {
  if (b.categoria && b.categoria !== lote.categoria) return false;
  if (b.zona && b.zona !== lote.zona) return false;
  const buscadas = palabras(b.texto);
  return buscadas.length > 0 && buscadas.every((p) => pal.has(p));
}

// Pseudoazar estable (mismo resultado para la misma persona en el mismo día),
// para elegir qué mostrar en el lugar "para descubrir".
function azarEstable(semilla: string) {
  let h = 2166136261;
  for (let i = 0; i < semilla.length; i++) h = Math.imul(h ^ semilla.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1000) / 1000;
}

// Calcula el puntaje de cada candidato según el interés de la persona.
// `descartarVistos`: para recomendar se sacan los lotes que ya vio; para ordenar
// el catálogo, no.
function puntuar(ctx: Contexto, descartarVistos: boolean) {
  const ahora = ctx.ahora ?? Date.now();
  const busquedas = ctx.busquedas ?? [];
  const fichas = ctx.fichas ?? new Map<string, Ficha>();
  const interes = armarInteres(ctx.senales, ahora, busquedas, fichas);
  const conHistorial = interes.total > 0;
  // No se recomienda lo que ya vio, guardó, ofertó o compró, lo propio ni lo que
  // no está disponible: la idea es mostrarle cosas nuevas.
  const descartar = new Set(descartarVistos ? ctx.senales.map((s) => s.lote.id) : []);
  const semillas = ctx.senales.map((s) => s.lote);

  // La categoría y las palabras pesan según cuánto del interés es "algo así":
  // si solo compró porcelanato, no hace falta mostrarle más porcelanato.
  const proporcionParecido = interes.total ? interes.totalParecido / interes.total : 0;
  const maxZona = maximo(interes.zonas) || 1;
  const totalCondicion = [...interes.condiciones.values()].reduce((t, v) => t + v, 0);
  // Etapa en la que está: la que más pesa. La que sigue es la que le conviene anticipar.
  const totalEtapas = interes.etapas.reduce((t, v) => t + v, 0);
  const etapaActual = totalEtapas ? interes.etapas.indexOf(Math.max(...interes.etapas)) : -1;
  const retiros = ctx.retiros ?? [];
  // Qué tan cerca está una zona: la del usuario o la que más mira valen 1; las vecinas, la mitad.
  const afinidadZona = (zona: string) => {
    const directa = ctx.zonaUsuario === zona ? 1 : (interes.zonas.get(zona) ?? 0) / maxZona;
    const vecinas = Math.max(
      0,
      ...(ZONAS_VECINAS[zona] ?? []).map((v) => (ctx.zonaUsuario === v ? 1 : (interes.zonas.get(v) ?? 0) / maxZona)),
    );
    return Math.max(directa, 0.5 * vecinas);
  };
  const maxComplemento = Math.max(1, ...[...interes.complementos.values()].map((c) => c.peso), ...interes.deFichas.map((c) => c.peso));
  const maxColectiva = Math.max(1, ...[...(ctx.colectivas?.values() ?? [])].map((c) => c.en_comun / Math.sqrt(c.popularidad)));
  const maxPopular = Math.max(1, ...(ctx.popularidad?.values() ?? []));

  const puntuados = ctx.candidatos
    .filter((l) => l.estado === "publicado" && l.vendedor_id !== ctx.usuarioId && !descartar.has(l.id))
    .map((lote) => {
      const pal = contar(palabrasConFicha(lote, fichas));
      const producto = contar(palabrasDeProducto(lote, fichas));
      const partes = {
        categoria: interes.total ? (interes.categorias.get(lote.categoria) ?? 0) / interes.total : 0,
        palabras: similitudCoseno(pal, interes.palabras) * proporcionParecido,
        complemento: 0,
        colectiva: 0,
        busqueda: 0,
        zona: afinidadZona(lote.zona),
        // Precio parecido a lo que suele mirar, y el mismo estado (nuevo, sin uso, usado).
        precio:
          0.7 * (interes.logPrecio != null && precio(lote) > 0 ? Math.exp(-Math.abs(Math.log(precio(lote)) - interes.logPrecio)) : 0) +
          0.3 * (totalCondicion ? (interes.condiciones.get(lote.condicion) ?? 0) / totalCondicion : 0),
        confianza: ctx.confianza?.get(lote.vendedor_id) ?? 0.5,
        etapa: 0,
        viaje: 0,
        exposicion: 0,
        descuento: descuentoDe(lote),
        nuevo: lote.publicado_at ? decaimiento(lote.publicado_at, ahora) : 0,
        popular: Math.log1p(ctx.popularidad?.get(lote.id) ?? 0) / Math.log1p(maxPopular),
      };
      // Complementos: por categoría y por material puntual (lo puntual pesa más).
      let origenComplemento: Lote | null = null;
      // Qué necesidad cubre (por ejemplo "pal:pastina"): dos complementos que cubren
      // necesidades distintas no cuentan como repetidos.
      let necesidad: string | null = null;
      const porCategoria = interes.complementos.get(`cat:${lote.categoria}`);
      if (porCategoria) {
        // Por categoría es una pista general: pesa menos que un material puntual.
        partes.complemento = (0.45 * porCategoria.peso) / maxComplemento;
        origenComplemento = porCategoria.origen;
        necesidad = `cat:${lote.categoria}`;
      }
      for (const p of producto.keys()) {
        const porMaterial = interes.complementos.get(`pal:${p}`);
        if ((EXCEPCIONES_COMPLEMENTO[p] ?? []).some((x) => producto.has(x))) continue;
        if (porMaterial && porMaterial.peso / maxComplemento >= partes.complemento) {
          partes.complemento = Math.min(1, porMaterial.peso / maxComplemento);
          origenComplemento = porMaterial.origen;
          necesidad = `pal:${p}`;
        }
      }
      const col = ctx.colectivas?.get(lote.id);
      if (col) partes.colectiva = col.en_comun / Math.sqrt(col.popularidad) / maxColectiva;
      const busquedaCumplida = busquedas.find((b) => cumpleBusqueda(b, lote, pal)) ?? null;
      if (busquedaCumplida) partes.busqueda = 1;

      // Complementos según las fichas técnicas (lo más preciso): qué pide el
      // proceso de lo que compró y si este lote lo cubre, y en qué cantidad.
      let deFicha: { c: ComplementoFicha; alcanza: number | null } | null = null;
      // Si hay ficha, manda la ficha: es más precisa que las reglas escritas a mano.
      let mejorFicha = 0;
      for (const c of interes.deFichas) {
        if (!cumpleComplemento(c, producto)) continue;
        let valor = c.peso / maxComplemento;
        let alcanza: number | null = null;
        if (c.necesario) {
          const hay = cantidadEn(lote, c.unidad, fichas);
          if (hay) {
            valor *= 0.6 + 0.4 * ajusteCantidad(hay, c.necesario);
            alcanza = hay / c.necesario;
          }
        }
        if (valor > mejorFicha) {
          mejorFicha = valor;
          partes.complemento = Math.max(partes.complemento, Math.min(1, valor));
          deFicha = { c, alcanza };
          necesidad = `ficha:${c.nucleo.join(" ")}`;
        }
      }

      // Etapa de obra: la siguiente a la actual suma más; la misma, algo.
      const etapaLote = etapaDe(lote, fichas);
      if (etapaActual >= 0 && etapaLote !== undefined) {
        partes.etapa = etapaLote === etapaActual + 1 ? 1 : etapaLote === etapaActual ? 0.5 : 0;
      }

      // Rendimientos: si es un complemento que necesita, cuánto le alcanza.
      let rendimiento: { alcanza: number; origen: Lote; cantidad: number; unidad: string } | null = null;
      for (const [material, necesidad] of interes.necesidades) {
        if (!producto.has(material)) continue;
        const kg = cantidadDe(lote, "kg");
        if (!kg) continue;
        const ajuste = ajusteCantidad(kg, necesidad.kg);
        partes.complemento = Math.min(1, partes.complemento * (0.6 + 0.4 * ajuste));
        const porUnidad = necesidad.kg / necesidad.cantidad;
        rendimiento = { alcanza: Math.round(kg / porUnidad), origen: necesidad.origen, cantidad: necesidad.cantidad, unidad: necesidad.unidad };
      }

      // Un solo viaje: mismo vendedor que algo que ya tiene para retirar, o misma localidad.
      for (const r of retiros) {
        if (r.vendedorId === lote.vendedor_id) partes.viaje = 1;
        else if (r.localidad && lote.localidad && r.localidad === lote.localidad) partes.viaje = Math.max(partes.viaje, 0.6);
      }
      const retiroCompartido = retiros.find((r) => r.vendedorId === lote.vendedor_id) ?? null;

      // Anti-desperdicio: si lleva días publicado y casi nadie lo vio, un empujón.
      if (lote.publicado_at) {
        const dias = (ahora - new Date(lote.publicado_at).getTime()) / 86_400_000;
        const vistas = ctx.popularidad?.get(lote.id) ?? 0;
        partes.exposicion = Math.min(1, dias / 14) * Math.max(0, 1 - vistas / (dias * 0.5 + 1));
      }

      // Sin historial: lo nuevo, lo barato, lo popular y lo cercano.
      const puntaje = conHistorial
        ? (Object.keys(W) as (keyof typeof W)[]).reduce((t, k) => t + W[k] * partes[k], 0)
        : 0.35 * partes.nuevo + 0.3 * partes.descuento + 0.2 * partes.popular + 0.15 * partes.zona;

      return {
        lote,
        puntaje,
        partes,
        origenComplemento,
        necesidad,
        busquedaCumplida,
        rendimiento,
        retiroCompartido,
        deFicha,
        etapaSiguiente: etapaLote !== undefined && etapaLote === etapaActual + 1,
        etapaLote,
      };
    })
  return { puntuados, interes, semillas, conHistorial, ahora };
}

// Para el catálogo: ordena una lista (por ejemplo, el resultado de una búsqueda)
// según el interés de la persona, sin sacar lo que ya vio. Lo que no se puede
// puntuar (reservado o propio) queda al final, en el orden en que vino.
export function ordenar(ctx: Contexto): Lote[] {
  const puntaje = new Map(puntuar(ctx, false).puntuados.map((r) => [r.lote.id, r.puntaje]));
  return ctx.candidatos
    .map((lote, i) => ({ lote, i, p: puntaje.get(lote.id) ?? -1 }))
    .sort((a, b) => b.p - a.p || a.i - b.i)
    .map((x) => x.lote);
}

export function recomendar(ctx: Contexto, cantidad = 6): Recomendacion[] {
  const base = puntuar(ctx, true);
  const { interes, semillas, conHistorial, ahora } = base;
  const puntuados = base.puntuados.filter((r) => !conHistorial || r.puntaje > 0.05);

  // Con historial y lugar de sobra, uno queda para descubrir algo distinto.
  const lugarDescubrir = conHistorial && cantidad >= 6 ? 1 : 0;

  // Variedad (MMR): cada elegido penaliza a los demás que se le parecen mucho.
  const elegidos: typeof puntuados = [];
  const restantes = [...puntuados];
  while (elegidos.length < cantidad - lugarDescubrir && restantes.length) {
    let mejor = 0;
    let mejorValor = -Infinity;
    restantes.forEach((r, i) => {
      const repeticion = elegidos.length
        ? Math.max(...elegidos.map((e) => parecido(e.lote, r.lote) * (e.necesidad && r.necesidad && e.necesidad !== r.necesidad ? 0.3 : 1)))
        : 0;
      const valor = 0.75 * r.puntaje - 0.25 * repeticion * r.puntaje;
      if (valor > mejorValor) {
        mejorValor = valor;
        mejor = i;
      }
    });
    elegidos.push(restantes.splice(mejor, 1)[0]);
  }

  const comoComplemento = (r: (typeof elegidos)[number]) => {
    const m = motivo({ ...r, busquedaCumplida: null, retiroCompartido: null }, semillas, interes.principal, ctx.zonaUsuario);
    return m.tipo === "complemento" ? m : null;
  };
  const resultado: Recomendacion[] = elegidos.map((r) => ({
    lote: r.lote,
    puntaje: r.puntaje,
    motivo: motivo(r, semillas, interes.principal, ctx.zonaUsuario),
    complemento: comoComplemento(r),
  }));

  // Para descubrir: de una categoría que no está en la lista, entre lo nuevo,
  // con descuento o popular. Cambia de un día a otro.
  if (lugarDescubrir) {
    const categorias = new Set(elegidos.map((e) => e.lote.categoria).concat(semillas.map((s) => s.categoria)));
    const dia = new Date(ahora).toISOString().slice(0, 10);
    const opciones = restantes
      .filter((r) => !categorias.has(r.lote.categoria))
      .map((r) => ({ r, valor: 0.4 * r.partes.nuevo + 0.3 * r.partes.descuento + 0.2 * r.partes.zona + 0.1 * azarEstable(`${ctx.usuarioId}:${dia}:${r.lote.id}`) }))
      .sort((a, b) => b.valor - a.valor);
    const elegido = opciones[0]?.r ?? restantes.sort((a, b) => b.puntaje - a.puntaje)[0];
    if (elegido) {
      resultado.push({
        lote: elegido.lote,
        puntaje: elegido.puntaje,
        motivo: categorias.has(elegido.lote.categoria)
          ? motivo(elegido, semillas, interes.principal, ctx.zonaUsuario)
          : { tipo: "descubrir", texto: "Otra cosa que te puede servir" },
        complemento: null,
      });
    }
  }
  return resultado;
}

function motivo(
  r: {
    lote: Lote;
    partes: Record<keyof typeof W, number>;
    origenComplemento: Lote | null;
    busquedaCumplida: Busqueda | null;
    rendimiento: { alcanza: number; origen: Lote; cantidad: number; unidad: string } | null;
    retiroCompartido: { titulo: string } | null;
    deFicha: { c: ComplementoFicha; alcanza: number | null } | null;
    etapaSiguiente: boolean;
    etapaLote: number | undefined;
  },
  semillas: Lote[],
  principal: Lote | null,
  zona?: string | null,
): Motivo {
  const corto = (t: string) => (t.length > 40 ? `${t.slice(0, 38)}…` : t);
  const masParecida = semillas.reduce<{ lote: Lote | null; valor: number }>(
    (m, s) => {
      const v = parecido(s, r.lote);
      return v > m.valor ? { lote: s, valor: v } : m;
    },
    { lote: null, valor: 0 },
  );
  const { partes } = r;
  if (r.busquedaCumplida) return { tipo: "busqueda", texto: `Coincide con lo que buscás: “${corto(r.busquedaCumplida.texto)}”` };
  // Lo que sabe por la ficha técnica: para qué hace falta en el proceso.
  if (r.deFicha && partes.complemento >= 0.4) {
    const { c, alcanza } = r.deFicha;
    const cuanto = alcanza == null ? "" : alcanza >= 0.9 ? " · te alcanza" : ` · cubre ~${Math.round(alcanza * 100)}%`;
    return { tipo: "complemento", texto: `Va con tu ${corto(c.materialOrigen)}: ${c.porQue}${cuanto}` };
  }
  if (r.rendimiento && partes.complemento >= 0.4) {
    const u = r.rendimiento.unidad === "m2" ? "m²" : "unidades";
    return {
      tipo: "complemento",
      texto: `Para tus ${r.rendimiento.cantidad} ${u} de ${corto(r.rendimiento.origen.titulo.split(",")[0])}: alcanza para ~${r.rendimiento.alcanza} ${u}`,
    };
  }
  if (r.retiroCompartido) return { tipo: "viaje", texto: `Lo retirás en el mismo viaje que ${corto(r.retiroCompartido.titulo)}` };
  if (partes.complemento >= 0.4 && r.origenComplemento && W.complemento * partes.complemento >= W.palabras * partes.palabras) {
    return { tipo: "complemento", texto: `Va con ${corto(r.origenComplemento.titulo)}` };
  }
  const referencia = masParecida.lote ?? principal;
  if (partes.colectiva >= 0.5 && referencia) {
    return { tipo: "colectiva", texto: `Quienes vieron ${corto(referencia.titulo)} también vieron esto` };
  }
  if (masParecida.lote && masParecida.valor >= 0.3) {
    return { tipo: "parecido", texto: `Porque viste ${corto(masParecida.lote.titulo)}` };
  }
  if (r.etapaSiguiente && partes.etapa === 1) {
    return { tipo: "etapa", texto: `Para la próxima etapa de tu obra: ${ETAPAS[r.etapaLote!]}` };
  }
  if (zona && r.lote.zona === zona) return { tipo: "zona", texto: `Cerca tuyo, en ${zona}` };
  if (partes.descuento >= 0.4) return { tipo: "descuento", texto: `${Math.round(partes.descuento * 100)}% menos que nuevo` };
  return { tipo: "nuevo", texto: "Recién publicado" };
}
