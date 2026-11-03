"use server";

import Anthropic from "@anthropic-ai/sdk";
import { headers } from "next/headers";
import { z } from "zod";
import { CONDICIONES, type Condicion } from "@/lib/datos";
import { obtenerPerfil } from "@/lib/sesion";
import { precioSugeridoCompleto, referenciaEnSobra } from "@/lib/precio-sugerido";
import type { Referencia } from "@/lib/precio-comparables";
import { adivinarCategoria } from "@/lib/depreciacion";

// La calculadora "¿Te sobró material?" de la portada. La puede usar cualquiera,
// así que la búsqueda de precios con IA (que cuesta) tiene límites: por persona,
// un tope por día para todo el sitio, y la misma consulta se responde de la memoria.

const esquema = z.object({
  texto: z.string().trim().min(4, "Contanos qué te sobró (por ejemplo, 38 m² de porcelanato 60x60).").max(120),
  condicion: z.enum(Object.keys(CONDICIONES) as [Condicion, ...Condicion[]]),
});

export type Tasacion = {
  mercado: number;
  sugerido: number;
  motivo: string;
  fuentes: { titulo: string; url: string }[];
  referencia: Referencia;
};

// Lo parecido que hay en Sobrá (al instante, sin IA).
// También devuelve de qué rubro parece ser (para usar el descuento de ese rubro).
export async function compararEnSobra(
  texto: unknown,
  condicion: unknown,
): Promise<{ ok: true; referencia: Referencia; categoria: string | null } | { ok: false; error: string }> {
  const datos = esquema.safeParse({ texto, condicion });
  if (!datos.success) return { ok: false, error: datos.error.issues[0].message };
  const categoria = adivinarCategoria(datos.data.texto);
  return { ok: true, categoria, referencia: await referenciaEnSobra({ texto: datos.data.texto, condicion: datos.data.condicion, categoria }) };
}

const POR_PERSONA_SIN_CUENTA = 3;
const POR_PERSONA_CON_CUENTA = 10;
const TOPE_DIARIO = 300;
const usos = new Map<string, number[]>();
let delDia: number[] = [];
const memoria = new Map<string, { tasacion: Tasacion; hasta: number }>();

export async function tasarDesdePortada(texto: unknown, condicion: unknown): Promise<{ ok: true; tasacion: Tasacion } | { ok: false; error: string }> {
  const datos = esquema.safeParse({ texto, condicion });
  if (!datos.success) return { ok: false, error: datos.error.issues[0].message };
  const { texto: t, condicion: c } = datos.data;

  const clave = `${t.toLowerCase().replace(/\s+/g, " ")}|${c}`;
  const guardada = memoria.get(clave);
  if (guardada && guardada.hasta > Date.now()) return { ok: true, tasacion: guardada.tasacion };

  const dePrueba = process.env.SOBRA_IA_DE_PRUEBA === "1";
  if (!dePrueba && !process.env.ANTHROPIC_API_KEY) return { ok: false, error: "Poné cuánto cuesta nuevo y te hacemos la cuenta." };

  const perfil = await obtenerPerfil();
  const h = await headers();
  const quien = perfil?.id ?? h.get("x-forwarded-for")?.split(",")[0].trim() ?? h.get("x-real-ip") ?? "sin-ip";
  const ahora = Date.now();
  const recientes = (usos.get(quien) ?? []).filter((x) => ahora - x < 86_400_000);
  delDia = delDia.filter((x) => ahora - x < 86_400_000);
  if (recientes.length >= (perfil ? POR_PERSONA_CON_CUENTA : POR_PERSONA_SIN_CUENTA) || delDia.length >= TOPE_DIARIO) {
    return { ok: false, error: "Ya buscamos muchos precios hoy. Poné cuánto cuesta nuevo y te hacemos la cuenta." };
  }
  usos.set(quien, [...recientes, ahora]);
  delDia.push(ahora);

  try {
    const lote = { titulo: t, categoria: adivinarCategoria(t) ?? "", condicion: c, descripcion: "", items: [] };
    const informe = dePrueba ? await tasacionDePrueba(lote) : await precioSugeridoCompleto(lote);
    const tasacion: Tasacion = {
      mercado: informe.total_mercado_ars,
      sugerido: informe.sugerido,
      motivo: informe.motivo,
      fuentes: informe.fuentes.slice(0, 3).map((f) => ({ titulo: f.titulo, url: f.url })),
      referencia: informe.referencia,
    };
    memoria.set(clave, { tasacion, hasta: ahora + 24 * 3_600_000 });
    return { ok: true, tasacion };
  } catch (error) {
    console.error("[Sobrá] No se pudo tasar desde la portada", error);
    if (error instanceof Anthropic.APIError && /credit|balance/i.test(error.message)) {
      return { ok: false, error: "Ahora no podemos buscar precios. Poné cuánto cuesta nuevo y te hacemos la cuenta." };
    }
    return { ok: false, error: "No pudimos buscar precios ahora. Poné cuánto cuesta nuevo y te hacemos la cuenta." };
  }
}

// Para el recorrido de pruebas (SOBRA_IA_DE_PRUEBA=1, nunca en producción): sin
// gastar la API, pero con la comparación real contra lo publicado en Sobrá.
async function tasacionDePrueba(lote: { titulo: string; condicion: Condicion }) {
  const { combinarPrecio } = await import("@/lib/precio-comparables");
  const { factorPrecio, adivinarCategoria } = await import("@/lib/depreciacion");
  const referencia = await referenciaEnSobra({ texto: lote.titulo, condicion: lote.condicion, categoria: adivinarCategoria(lote.titulo) });
  const mercado = 600000;
  const { sugerido, motivo } = combinarPrecio(mercado * factorPrecio(adivinarCategoria(lote.titulo), lote.condicion), referencia);
  return { total_mercado_ars: mercado, sugerido: sugerido ?? 0, motivo, fuentes: [{ titulo: "Tienda de prueba", url: "https://example.com" }], referencia };
}
