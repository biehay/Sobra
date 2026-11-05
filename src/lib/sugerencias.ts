import { nombreConMarca } from "@/lib/datos";
import { palabras } from "@/lib/recomendaciones/motor";

// Sugerencias mientras se escribe en el buscador. Entiende tildes, plurales,
// sinónimos de obra ("yeso" → durlock) y la última palabra a medio escribir
// ("porc" → porcelanato). Si nada coincide con todas las palabras, muestra lo
// que coincide con alguna (lo parecido).

export type LoteBuscable = {
  id: string;
  titulo: string;
  categoria: string;
  zona: string;
  items: { nombre: string; marca?: string }[];
  fotos: string[];
  precio_publicado: number | null;
  precio_pedido: number;
};

export type Sugerencias = {
  lotes: (LoteBuscable & { parecido: boolean })[];
  categorias: string[];
};

const normalizar = (t: string) => t.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
const crudas = (t: string) => normalizar(t).split(/[^a-z0-9]+/).filter(Boolean);

// Qué tan bien coincide una palabra buscada con un texto: 2 si está entera
// (con sinónimos y plurales), 1 si es el comienzo de una palabra, 0 si no está.
function coincide(termino: string, completo: boolean, enteras: Set<string>, sueltas: string[]) {
  if (completo && termino.length >= 3) {
    const [raiz] = palabras(termino);
    if (raiz && enteras.has(raiz)) return 2;
  }
  return sueltas.some((p) => p.startsWith(termino)) ? 1 : 0;
}

export function sugerir(consulta: string, lotes: LoteBuscable[], categorias: readonly string[], cantidad = 6): Sugerencias {
  const terminos = crudas(consulta);
  if (!terminos.length || normalizar(consulta).trim().length < 2) return { lotes: [], categorias: [] };
  // La última palabra puede estar a medio escribir (salvo que termine en espacio).
  const ultimaCompleta = /\s$/.test(consulta);
  const completo = (i: number) => i < terminos.length - 1 || ultimaCompleta;

  const puntuados = lotes.map((lote) => {
    const titulo = crudas(lote.titulo);
    const resto = crudas(`${lote.items.map((i) => nombreConMarca(i)).join(" ")} ${lote.categoria}`);
    const enterasTitulo = new Set(palabras(lote.titulo));
    const enterasResto = new Set(palabras(`${lote.items.map((i) => nombreConMarca(i)).join(" ")} ${lote.categoria}`));
    let encontrados = 0;
    let puntaje = 0;
    terminos.forEach((t, i) => {
      const enTitulo = coincide(t, completo(i), enterasTitulo, titulo);
      const enResto = enTitulo ? 0 : coincide(t, completo(i), enterasResto, resto);
      if (enTitulo || enResto) encontrados++;
      // Pesa más en el título que en los materiales, y entera más que a medias.
      puntaje += enTitulo * 3 + enResto;
    });
    // Que el título arranque con lo que escribió suma un poco.
    if (normalizar(lote.titulo).startsWith(normalizar(consulta).trim())) puntaje += 2;
    return { lote, encontrados, puntaje };
  });

  const todos = puntuados.filter((p) => p.encontrados === terminos.length);
  const elegidos = (todos.length ? todos : puntuados.filter((p) => p.encontrados > 0))
    .sort((a, b) => b.puntaje - a.puntaje || a.lote.titulo.localeCompare(b.lote.titulo))
    .slice(0, cantidad)
    .map((p) => ({ ...p.lote, parecido: !todos.length }));

  // Categorías: las que coinciden por nombre y, si no, las de los lotes encontrados.
  const porNombre = categorias.filter((c) => terminos.every((t, i) => coincide(t, completo(i), new Set(palabras(c)), crudas(c))));
  const deLotes = [...new Set(todos.map((p) => p.lote.categoria))];
  return { lotes: elegidos, categorias: [...new Set([...porNombre, ...deLotes])].slice(0, 3) };
}

// Palabras que no ayudan a buscar ("porcelanato DE 60x60", "cemento X 40 bolsas").
const VACIAS_DE_SENTIDO = new Set(["de", "del", "la", "el", "los", "las", "para", "con", "y", "x", "en", "por", "un", "una", "sin", "a"]);

// Búsqueda del catálogo: cada palabra tiene que aparecer en el título, los
// materiales, la marca, la categoría o la descripción (con tildes, plurales y
// sinónimos de obra, igual que las sugerencias). Devuelve los lotes ordenados por
// qué tan bien coinciden: primero los que lo tienen en el título.
export function buscarLotes<T extends { titulo: string; categoria: string; descripcion?: string; items: { nombre: string; marca?: string }[] }>(
  consulta: string,
  lotes: T[],
): T[] {
  const terminos = crudas(consulta).filter((t) => !VACIAS_DE_SENTIDO.has(t));
  if (!terminos.length) return lotes;
  const puntuados = lotes.map((lote) => {
    const textoResto = `${lote.items.map((i) => nombreConMarca(i)).join(" ")} ${lote.categoria} ${lote.descripcion ?? ""}`;
    const titulo = crudas(lote.titulo);
    const resto = crudas(textoResto);
    const enterasTitulo = new Set(palabras(lote.titulo));
    const enterasResto = new Set(palabras(textoResto));
    let puntaje = 0;
    for (const t of terminos) {
      const enTitulo = coincide(t, true, enterasTitulo, titulo);
      const enResto = enTitulo ? 0 : coincide(t, true, enterasResto, resto);
      if (!enTitulo && !enResto) return { lote, puntaje: -1 };
      puntaje += enTitulo * 3 + enResto;
    }
    return { lote, puntaje };
  });
  return puntuados
    .filter((p) => p.puntaje >= 0)
    .sort((a, b) => b.puntaje - a.puntaje)
    .map((p) => p.lote);
}
