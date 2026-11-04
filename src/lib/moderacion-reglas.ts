// Moderación de publicaciones: los tipos, las reglas fijas (sin IA) y cómo se
// combinan con lo que dice la IA. Cada publicación termina en uno de tres caminos:
//  - aprobado: se puede publicar al instante (si además pasa los controles de la base).
//  - dudoso: va a la cola del admin, con el motivo escrito.
//  - rechazado: vuelve al vendedor con una explicación.

export type ResultadoModeracion = "aprobado" | "dudoso" | "rechazado";

export const TIPOS_MOTIVO = [
  "fuera_de_rubro",
  "prohibido",
  "posible_robo",
  "fotos_no_coinciden",
  "foto_de_internet",
  "contacto",
  "precio_sospechoso",
  "enganoso",
  "sin_revision_ia",
  "otro",
] as const;
export type TipoMotivo = (typeof TIPOS_MOTIVO)[number];

// Para el admin: qué significa cada motivo, en pocas palabras.
export const NOMBRE_MOTIVO: Record<TipoMotivo, string> = {
  fuera_de_rubro: "Fuera de rubro",
  prohibido: "Prohibido o peligroso",
  posible_robo: "Posible material robado",
  fotos_no_coinciden: "Las fotos no coinciden",
  foto_de_internet: "Fotos de catálogo o de internet",
  contacto: "Datos de contacto",
  precio_sospechoso: "Precio sospechoso",
  enganoso: "Engañoso",
  sin_revision_ia: "La IA no pudo revisarlo",
  otro: "Otro",
};

export type Motivo = { tipo: TipoMotivo; detalle: string };
// `mensaje`: lo que se le dice al vendedor si se rechaza.
export type Moderacion = { resultado: ResultadoModeracion; motivos: Motivo[]; mensaje: string };

export type LoteAModerar = {
  titulo: string;
  descripcion: string;
  condicion: string;
  items: { nombre: string; marca?: string | null }[];
  precio_pedido: number;
  precio_lista: number | null;
};

const GRAVEDAD: Record<ResultadoModeracion, number> = { aprobado: 0, dudoso: 1, rechazado: 2 };

export const textoDelLote = (l: LoteAModerar) =>
  [l.titulo, l.descripcion, ...l.items.map((i) => `${i.nombre} ${i.marca ?? ""}`)].join(" ");

// Empresas de servicios cuyo material no se vende de segunda mano: si aparece su
// nombre, hay que confirmar de dónde viene. ("Claro" y "Personal" quedan afuera:
// son palabras comunes; los logos en las fotos los mira la IA.)
const EMPRESAS_DE_SERVICIOS = /\b(telecom|movistar|telef[oó]nica|fibertel|edenor|edesur|edelap|metrogas|aysa|naturgy|camuzzi)\b/i;
const INSTALACION_PUBLICA = /\b(medidor(es)? de (luz|gas|agua)|tapas? de medidor|rejillas? pluvial(es)?|tapas? de (c[aá]mara|registro|boca de tormenta))\b/i;
const COBRE = /\bcobre\b/i;
const COBRE_RECUPERADO = /\b(recuperad[oa]s?|chatarra|desarme|pelad[oa]s?|retirad[oa]s? de)\b/i;
const AMIANTO = /\b(amianto|asbesto)\b/i;
const CONTACTO = [/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i, /(https?:\/\/|www\.)/i, /(whats ?app|\bwsp\b|\bwpp\b)/i, /(\d[\s.-]?){8,}/];

// Lo que se detecta sin IA: rápido, gratis y siempre igual.
export function revisarReglas(lote: LoteAModerar): Moderacion {
  const texto = textoDelLote(lote);
  const motivos: Motivo[] = [];
  let resultado: ResultadoModeracion = "aprobado";
  let mensaje = "";
  const marcar = (r: ResultadoModeracion, motivo: Motivo) => {
    motivos.push(motivo);
    if (GRAVEDAD[r] > GRAVEDAD[resultado]) resultado = r;
  };

  if (AMIANTO.test(texto)) {
    marcar("rechazado", { tipo: "prohibido", detalle: "Menciona amianto o asbesto." });
    mensaje = "En Sobrá no se pueden publicar materiales con amianto (asbesto): su venta está prohibida en Argentina.";
  }
  const empresa = texto.match(EMPRESAS_DE_SERVICIOS);
  if (empresa) marcar("dudoso", { tipo: "posible_robo", detalle: `Menciona a ${empresa[1]}: confirmar de dónde viene el material.` });
  if (INSTALACION_PUBLICA.test(texto)) marcar("dudoso", { tipo: "posible_robo", detalle: "Parece material de una instalación pública (medidores, tapas, rejillas)." });
  if (COBRE.test(texto) && (lote.condicion !== "nuevo" && lote.condicion !== "sin_uso" || COBRE_RECUPERADO.test(texto))) {
    marcar("dudoso", { tipo: "posible_robo", detalle: "Cobre usado o recuperado: confirmar de dónde viene." });
  }
  if (CONTACTO.some((r) => r.test(texto))) marcar("dudoso", { tipo: "contacto", detalle: "Tiene datos de contacto en el texto." });
  if (lote.precio_lista && lote.precio_pedido < lote.precio_lista * 0.15) {
    marcar("dudoso", { tipo: "precio_sospechoso", detalle: "Pide menos del 15% del precio de lista." });
  }
  return { resultado, motivos, mensaje };
}

// Gana la decisión más estricta; los motivos se suman.
export function combinar(a: Moderacion, b: Moderacion): Moderacion {
  const peor = GRAVEDAD[b.resultado] > GRAVEDAD[a.resultado] ? b : a;
  return { resultado: peor.resultado, motivos: [...a.motivos, ...b.motivos], mensaje: peor.mensaje || a.mensaje || b.mensaje };
}
