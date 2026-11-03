import type { Condicion } from "@/lib/datos";
import { palabras } from "@/lib/recomendaciones/motor";

// Controles fijos (sin IA) de "Publicar con fotos" y unificación de las dos
// revisiones. Todo lo que no cierra se convierte en una pregunta para el vendedor.

export type CampoDuda = "titulo" | "categoria" | "condicion" | "materiales" | "peso";
type Nivel = "alta" | "media" | "baja";

export type Observacion = {
  es_material: boolean;
  fotos: { numero: number; que_se_ve: string; etiquetas: string[] }[];
  titulo: string;
  categoria: string;
  condicion: Condicion;
  condicion_evidencia: string;
  materiales: {
    nombre: string;
    presentacion: string;
    unidades_contadas: number | null;
    contenido_por_unidad: number | null;
    unidad: string;
    cantidad: number;
    evidencia: string;
    seguro: boolean;
  }[];
  peso_kg: number | null;
  descripcion: string;
  confianza: Record<CampoDuda, Nivel>;
};

export type Revision = {
  categoria: string;
  condicion: Condicion;
  materiales: { indice: number; cantidad: number; unidad: string; coincide: boolean; motivo: string }[];
  peso_kg: number | null;
  problemas: string[];
};

export type PropuestaLote = {
  es_material: boolean;
  titulo: string;
  categoria: string;
  condicion: Condicion;
  materiales: { nombre: string; cantidad: number; unidad: string }[];
  peso_kg: number | null;
  descripcion: string;
  dudas: { campo: CampoDuda; pregunta: string }[];
  // Los controles que pasó, para mostrárselos al vendedor.
  verificaciones: string[];
};

const MAX_DUDAS = 3;
const NOMBRE_ESTADO: Record<Condicion, string> = { nuevo: "nuevo, en su embalaje", sin_uso: "sin uso", usado_buen_estado: "usado" };

const redondear = (n: number) => Math.round(n * 100) / 100;
const numero = (n: number) => n.toLocaleString("es-AR", { maximumFractionDigits: 2 });

export function normalizarUnidad(u: string) {
  const t = u.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/[.\s]/g, "");
  if (/^(m2|m²|mts2|metros?cuadrados?)$/.test(t)) return "m2";
  if (/^(u|un|unid|unidad(es)?)$/.test(t)) return "u";
  if (/^(kg|kilos?)$/.test(t)) return "kg";
  if (/^(m|mts|metros?)$/.test(t)) return "m";
  return u.trim();
}
const mostrarUnidad = (u: string) => (u === "m2" ? "m²" : u);

// Cuánto pesa cada material, aproximado, para controlar el peso total. Si un
// material no está en la tabla, no se controla (no se inventa).
const PESOS: { claves: string[]; por: "m2" | "u" | "bolsa"; kg: number }[] = [
  { claves: ["porcelanato"], por: "m2", kg: 22 },
  { claves: ["ceramico", "azulejo"], por: "m2", kg: 18 },
  { claves: ["cemento"], por: "bolsa", kg: 50 },
  { claves: ["cal"], por: "bolsa", kg: 25 },
  { claves: ["pegamento"], por: "bolsa", kg: 30 },
  { claves: ["inodoro"], por: "u", kg: 25 },
  { claves: ["bacha"], por: "u", kg: 10 },
  { claves: ["durlock", "placa"], por: "u", kg: 20 },
];

export function pesoEsperado(materiales: { nombre: string; cantidad: number; unidad: string; presentacion?: string; unidades_contadas?: number | null }[]) {
  let total = 0;
  for (const m of materiales) {
    const unidad = normalizarUnidad(m.unidad);
    if (unidad === "kg") {
      total += m.cantidad;
      continue;
    }
    const pal = new Set(palabras(m.nombre));
    const ref = PESOS.find((p) => p.claves.some((c) => pal.has(c)));
    if (!ref) return null;
    if (ref.por === "m2" && unidad === "m2") total += m.cantidad * ref.kg;
    else if (ref.por === "u" && unidad === "u") total += m.cantidad * ref.kg;
    else if (ref.por === "bolsa" && /bolsa/i.test(`${m.unidad} ${m.presentacion ?? ""}`)) total += (m.unidades_contadas ?? m.cantidad) * ref.kg;
    else return null;
  }
  return total > 0 ? Math.round(total) : null;
}

export function unificar(obs: Observacion, rev: Revision | null): PropuestaLote {
  const dudas = new Map<CampoDuda, string>();
  const verificaciones: string[] = [];
  const preguntar = (campo: CampoDuda, pregunta: string) => {
    if (!dudas.has(campo)) dudas.set(campo, pregunta.slice(0, 220));
  };

  // 1. Las cuentas: cantidad total = unidades contadas × contenido según la etiqueta.
  const materiales = obs.materiales
    .filter((m) => m.nombre.trim() && m.cantidad > 0)
    .slice(0, 10)
    .map((m) => {
      const unidad = normalizarUnidad(m.unidad);
      let cantidad = redondear(m.cantidad);
      if (m.unidades_contadas && m.contenido_por_unidad) {
        const cuenta = redondear(m.unidades_contadas * m.contenido_por_unidad);
        const detalle = `${numero(m.unidades_contadas)} ${m.presentacion} × ${numero(m.contenido_por_unidad)} ${mostrarUnidad(unidad)} = ${numero(cuenta)} ${mostrarUnidad(unidad)}`;
        if (Math.abs(cuenta - cantidad) / cuenta > 0.02) {
          cantidad = cuenta;
          verificaciones.push(`Corregimos una cuenta: ${detalle}`);
        } else {
          verificaciones.push(`Cuenta verificada: ${detalle}`);
        }
      }
      return { ...m, unidad, cantidad };
    });

  // 2. La segunda revisión: ¿contó lo mismo?
  materiales.forEach((m, i) => {
    const otra = rev?.materiales.find((x) => x.indice === i);
    if (!otra) return;
    const igualUnidad = normalizarUnidad(otra.unidad) === m.unidad;
    const diferencia = igualUnidad ? Math.abs(otra.cantidad - m.cantidad) / Math.max(otra.cantidad, m.cantidad) : 1;
    if (diferencia <= 0.05) {
      verificaciones.push(`Cantidad de ${m.nombre.toLowerCase()} confirmada en una segunda revisión`);
    } else {
      preguntar(
        "materiales",
        `¿Son ${numero(m.cantidad)} ${mostrarUnidad(m.unidad)} de ${m.nombre.toLowerCase()}? En una segunda revisión contamos ${numero(otra.cantidad)} ${mostrarUnidad(normalizarUnidad(otra.unidad))}${otra.motivo ? ` (${otra.motivo.replace(/\.$/, "").toLowerCase()})` : ""}.`,
      );
    }
  });
  // Lo que la propia IA marcó como estimado también se pregunta.
  const estimado = materiales.find((m) => !m.seguro);
  if (estimado || obs.confianza.materiales === "baja") {
    const m = estimado ?? materiales[0];
    if (m) preguntar("materiales", `¿Son ${numero(m.cantidad)} ${mostrarUnidad(m.unidad)} de ${m.nombre.toLowerCase()}? No se ve bien en las fotos.`);
  }

  // 3. Categoría y estado: las dos revisiones tienen que coincidir.
  if (rev && rev.categoria !== obs.categoria) {
    preguntar("categoria", `¿La categoría es "${obs.categoria}" o "${rev.categoria}"? No coincidieron las dos revisiones.`);
  } else if (rev) {
    verificaciones.push("Categoría confirmada en las dos revisiones");
  }
  if (obs.confianza.categoria === "baja") preguntar("categoria", `¿La categoría es "${obs.categoria}"? No estamos seguros.`);
  if (rev && rev.condicion !== obs.condicion) {
    preguntar("condicion", `¿Está ${NOMBRE_ESTADO[obs.condicion]} o ${NOMBRE_ESTADO[rev.condicion]}? No coincidieron las dos revisiones.`);
  } else if (rev) {
    verificaciones.push(`Estado confirmado: ${NOMBRE_ESTADO[obs.condicion]}${obs.condicion_evidencia ? ` (${obs.condicion_evidencia.replace(/\.$/, "").toLowerCase()})` : ""}`);
  }
  if (obs.confianza.condicion === "baja") preguntar("condicion", `¿Está ${NOMBRE_ESTADO[obs.condicion]}? No se ve bien en las fotos.`);

  // 4. Peso: contra lo esperable para el material y contra la otra revisión.
  const esperado = pesoEsperado(materiales);
  let peso = obs.peso_kg && obs.peso_kg > 0 ? Math.round(obs.peso_kg) : null;
  if (esperado) {
    if (!peso) {
      peso = esperado;
      verificaciones.push(`Peso calculado según el material: ~${numero(esperado)} kg`);
    } else if (peso / esperado > 1.6 || peso / esperado < 0.6) {
      preguntar("peso", `¿Pesa unos ${numero(peso)} kg? Por el material calculamos ~${numero(esperado)} kg.`);
    } else {
      verificaciones.push(`Peso coherente con el material (~${numero(esperado)} kg esperables)`);
    }
  } else if (peso && rev?.peso_kg && (peso / rev.peso_kg > 1.5 || peso / rev.peso_kg < 0.67)) {
    preguntar("peso", `¿Pesa unos ${numero(peso)} kg? En la segunda revisión estimamos ${numero(Math.round(rev.peso_kg))} kg.`);
  } else if (peso && obs.confianza.peso === "baja") {
    preguntar("peso", `¿Pesa unos ${numero(peso)} kg? Es una estimación.`);
  }

  // 5. Datos que la revisión no ve en las fotos (marcas o medidas inventadas).
  if (rev?.problemas.length) preguntar("titulo", `Revisá el título: ${rev.problemas[0].replace(/\.$/, "")}.`);
  else if (rev) verificaciones.push("Ningún dato inventado: todo lo del título se ve en las fotos");
  if (obs.confianza.titulo === "baja") preguntar("titulo", "¿El título describe bien el lote? No estamos seguros.");

  // Como máximo 3 preguntas, primero las que más importan para el comprador.
  const orden: CampoDuda[] = ["materiales", "categoria", "condicion", "peso", "titulo"];
  return {
    es_material: obs.es_material,
    titulo: obs.titulo.trim().slice(0, 120),
    categoria: obs.categoria,
    condicion: obs.condicion,
    materiales: materiales.map((m) => ({ nombre: m.nombre.trim().slice(0, 120), cantidad: m.cantidad, unidad: m.unidad.slice(0, 20) })),
    peso_kg: peso,
    descripcion: obs.descripcion.trim().slice(0, 1000),
    dudas: orden.filter((c) => dudas.has(c)).slice(0, MAX_DUDAS).map((campo) => ({ campo, pregunta: dudas.get(campo)! })),
    verificaciones: verificaciones.slice(0, 8),
  };
}
