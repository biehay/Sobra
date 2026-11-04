// Motivos para denunciar una publicación (los mismos que acepta la base).
export const MOTIVOS_DENUNCIA = {
  robado: "Puede ser material robado",
  estafa: "Parece una estafa",
  contacto: "Pide contactar o pagar por fuera de Sobrá",
  enganoso: "Las fotos o el texto engañan",
  prohibido: "Es un producto prohibido o peligroso",
  no_es_material: "No es material de obra",
  otro: "Otro motivo",
} as const;
export type MotivoDenuncia = keyof typeof MOTIVOS_DENUNCIA;

// Lo decide la base (supabase/migrations/20261114000000_denuncias.sql); acá solo para mostrarlo.
// Con denuncias abiertas de esta cantidad de personas, el lote se pausa hasta que lo revise el admin.
export const DENUNCIAS_PARA_PAUSAR = 3;
// Si el admin ya las desestimó y el lote llega a esta cantidad de personas en total, se da de baja solo.
export const DENUNCIAS_PARA_BAJA = 5;
