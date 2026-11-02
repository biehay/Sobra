// Motor de recomendaciones de Sobrá. Funciones puras (sin base de datos), para
// poder probarlas: reciben las señales del usuario y los lotes candidatos y
// devuelven los mejores, variados y con el motivo de cada uno.
//
// Mezcla tres cosas:
// 1. Contenido: misma categoría, palabras en común, zona, precio y estado.
// 2. Señales colectivas: "otros que vieron esto también vieron" (ya agregadas).
// 3. Complementos de obra: si compraste cerámicos, te falta pegamento y pastina.
// Todo pesa más si es reciente, y al final se reordena para que haya variedad.

import type { Condicion, Lote } from "@/lib/datos";

export type TipoSenal = "vista" | "favorito" | "oferta" | "compra";
export type Senal = { lote: Lote; tipo: TipoSenal; fecha: string; veces?: number };
export type Colectiva = { en_comun: number; popularidad: number };
export type Motivo = { tipo: "complemento" | "colectiva" | "parecido" | "zona" | "descuento" | "nuevo"; texto: string };
export type Recomendacion = { lote: Lote; puntaje: number; motivo: Motivo };

export type Contexto = {
  senales: Senal[];
  candidatos: Lote[];
  usuarioId?: string | null;
  zonaUsuario?: string | null;
  colectivas?: Map<string, Colectiva>;
  popularidad?: Map<string, number>;
  ahora?: number;
};

// Cuánto dice cada acción sobre el interés de la persona.
export const PESOS: Record<TipoSenal, number> = { vista: 1, favorito: 3, oferta: 5, compra: 8 };
// Una señal de hace 14 días vale la mitad que una de hoy.
const VIDA_MEDIA_DIAS = 14;

// Qué categorías suelen hacer falta junto con otra en una obra.
export const COMPLEMENTOS_CATEGORIA: Record<string, string[]> = {
  "Cerámicos y porcelanatos": ["Cemento, cal y áridos", "Sanitarios y grifería", "Pinturas e impermeabilizantes"],
  "Sanitarios y grifería": ["Plomería y gas", "Cerámicos y porcelanatos"],
  "Plomería y gas": ["Sanitarios y grifería", "Herramientas y equipos"],
  "Electricidad e iluminación": ["Aislantes y durlock", "Herramientas y equipos"],
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
};

const VACIAS = new Set(
  "de del la las el los un una unos unas y o en con para por sin x al lote kg mts mt cm mm u un uni unidades".split(" "),
);

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
    .map(raiz);
}

// Los mismos, pasados por la misma raíz que las palabras de los lotes.
export const COMPLEMENTOS_MATERIAL: Record<string, string[]> = Object.fromEntries(
  Object.entries(COMPLEMENTOS_MATERIAL_TEXTO).map(([k, v]) => [palabras(k)[0], v.map((x) => palabras(x)[0])]),
);

function palabrasDe(lote: Lote): string[] {
  return palabras(`${lote.titulo} ${lote.items.map((i) => i.nombre).join(" ")} ${lote.descripcion}`);
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
};

export function armarInteres(senales: Senal[], ahora = Date.now()): Interes {
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
    contar(palabrasDe(s.lote), pesoParecido, interes.palabras);
    interes.zonas.set(s.lote.zona, (interes.zonas.get(s.lote.zona) ?? 0) + peso);
    interes.condiciones.set(s.lote.condicion, (interes.condiciones.get(s.lote.condicion) ?? 0) + peso);
    const p = precio(s.lote);
    if (p > 0) {
      sumaLog += Math.log(p) * peso;
      pesoPrecio += peso;
    }
    const pesoComplemento = s.tipo === "compra" || s.tipo === "oferta" ? peso : peso * 0.3;
    const claves = [
      ...(COMPLEMENTOS_CATEGORIA[s.lote.categoria] ?? []).map((c) => `cat:${c}`),
      ...palabrasDe(s.lote).flatMap((w) => (COMPLEMENTOS_MATERIAL[w] ?? []).map((m) => `pal:${m}`)),
    ];
    for (const clave of new Set(claves)) {
      const actual = interes.complementos.get(clave);
      if (!actual || actual.peso < pesoComplemento) interes.complementos.set(clave, { peso: pesoComplemento, origen: s.lote });
      else actual.peso += pesoComplemento * 0.5;
    }
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
const W = { categoria: 0.2, palabras: 0.22, complemento: 0.2, colectiva: 0.14, zona: 0.1, precio: 0.05, descuento: 0.04, nuevo: 0.03, popular: 0.02 };

export function recomendar(ctx: Contexto, cantidad = 6): Recomendacion[] {
  const ahora = ctx.ahora ?? Date.now();
  const interes = armarInteres(ctx.senales, ahora);
  const conHistorial = interes.total > 0;
  // No se recomienda lo que ya vio, guardó, ofertó o compró, lo propio ni lo que
  // no está disponible: la idea es mostrarle cosas nuevas.
  const descartar = new Set(ctx.senales.map((s) => s.lote.id));
  const semillas = ctx.senales.map((s) => s.lote);

  // La categoría y las palabras pesan según cuánto del interés es "algo así":
  // si solo compró porcelanato, no hace falta mostrarle más porcelanato.
  const proporcionParecido = interes.total ? interes.totalParecido / interes.total : 0;
  const maxZona = maximo(interes.zonas) || 1;
  const maxComplemento = Math.max(1, ...[...interes.complementos.values()].map((c) => c.peso));
  const maxColectiva = Math.max(1, ...[...(ctx.colectivas?.values() ?? [])].map((c) => c.en_comun / Math.sqrt(c.popularidad)));
  const maxPopular = Math.max(1, ...(ctx.popularidad?.values() ?? []));

  const puntuados = ctx.candidatos
    .filter((l) => l.estado === "publicado" && l.vendedor_id !== ctx.usuarioId && !descartar.has(l.id))
    .map((lote) => {
      const pal = contar(palabrasDe(lote));
      const partes = {
        categoria: interes.total ? (interes.categorias.get(lote.categoria) ?? 0) / interes.total : 0,
        palabras: similitudCoseno(pal, interes.palabras) * proporcionParecido,
        complemento: 0,
        colectiva: 0,
        zona: ctx.zonaUsuario && lote.zona === ctx.zonaUsuario ? 1 : (interes.zonas.get(lote.zona) ?? 0) / maxZona,
        precio: interes.logPrecio != null && precio(lote) > 0 ? Math.exp(-Math.abs(Math.log(precio(lote)) - interes.logPrecio)) : 0,
        descuento: descuentoDe(lote),
        nuevo: lote.publicado_at ? decaimiento(lote.publicado_at, ahora) : 0,
        popular: Math.log1p(ctx.popularidad?.get(lote.id) ?? 0) / Math.log1p(maxPopular),
      };
      // Complementos: por categoría y por material puntual (lo puntual pesa más).
      let origenComplemento: Lote | null = null;
      const porCategoria = interes.complementos.get(`cat:${lote.categoria}`);
      if (porCategoria) {
        partes.complemento = (0.6 * porCategoria.peso) / maxComplemento;
        origenComplemento = porCategoria.origen;
      }
      for (const p of pal.keys()) {
        const porMaterial = interes.complementos.get(`pal:${p}`);
        if (porMaterial && porMaterial.peso / maxComplemento >= partes.complemento) {
          partes.complemento = Math.min(1, porMaterial.peso / maxComplemento);
          origenComplemento = porMaterial.origen;
        }
      }
      const col = ctx.colectivas?.get(lote.id);
      if (col) partes.colectiva = col.en_comun / Math.sqrt(col.popularidad) / maxColectiva;

      // Sin historial: lo nuevo, lo barato, lo popular y lo cercano.
      const puntaje = conHistorial
        ? (Object.keys(W) as (keyof typeof W)[]).reduce((t, k) => t + W[k] * partes[k], 0)
        : 0.35 * partes.nuevo + 0.3 * partes.descuento + 0.2 * partes.popular + 0.15 * partes.zona;

      return { lote, puntaje, partes, origenComplemento };
    })
    .filter((r) => !conHistorial || r.puntaje > 0.05);

  // Variedad (MMR): cada elegido penaliza a los demás que se le parecen mucho.
  const elegidos: typeof puntuados = [];
  const restantes = [...puntuados];
  while (elegidos.length < cantidad && restantes.length) {
    let mejor = 0;
    let mejorValor = -Infinity;
    restantes.forEach((r, i) => {
      const repeticion = elegidos.length ? Math.max(...elegidos.map((e) => parecido(e.lote, r.lote))) : 0;
      const valor = 0.75 * r.puntaje - 0.25 * repeticion * r.puntaje;
      if (valor > mejorValor) {
        mejorValor = valor;
        mejor = i;
      }
    });
    elegidos.push(restantes.splice(mejor, 1)[0]);
  }

  return elegidos.map((r) => ({ lote: r.lote, puntaje: r.puntaje, motivo: motivo(r, semillas, interes.principal, ctx.zonaUsuario) }));
}

function motivo(
  r: { lote: Lote; partes: Record<keyof typeof W, number>; origenComplemento: Lote | null },
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
  if (partes.complemento >= 0.5 && r.origenComplemento && W.complemento * partes.complemento >= W.palabras * partes.palabras) {
    return { tipo: "complemento", texto: `Va con ${corto(r.origenComplemento.titulo)}` };
  }
  const referencia = masParecida.lote ?? principal;
  if (partes.colectiva >= 0.5 && referencia) {
    return { tipo: "colectiva", texto: `Quienes vieron ${corto(referencia.titulo)} también vieron esto` };
  }
  if (masParecida.lote && masParecida.valor >= 0.3) {
    return { tipo: "parecido", texto: `Porque viste ${corto(masParecida.lote.titulo)}` };
  }
  if (zona && r.lote.zona === zona) return { tipo: "zona", texto: `Cerca tuyo, en ${zona}` };
  if (partes.descuento >= 0.4) return { tipo: "descuento", texto: `${Math.round(partes.descuento * 100)}% menos que nuevo` };
  return { tipo: "nuevo", texto: "Recién publicado" };
}
