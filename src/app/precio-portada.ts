"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { CONDICIONES, type Condicion } from "@/lib/datos";
import { obtenerPerfil } from "@/lib/sesion";
import { precioSugeridoCompleto, referenciaEnSobra } from "@/lib/precio-sugerido";
import type { Referencia } from "@/lib/precio-comparables";
import type { Coherencia } from "@/lib/precio-consolidar";
import { adivinarCategoria } from "@/lib/depreciacion";
import { guardarReporte, precioReportado, quienReporta } from "@/lib/precios-reportados";
import { PRECIO_LISTA_MINIMO } from "@/lib/datos";
import { explicarErrorIA } from "@/lib/errores-ia";
import { iaDePrueba } from "@/lib/entorno";

// La calculadora "¿Te sobró material?" de la portada. La puede usar cualquiera,
// así que la búsqueda de precios con IA (que cuesta) tiene límites: por persona,
// un tope por día para todo el sitio, y la misma consulta se responde de la memoria.

const esquema = z.object({
  texto: z.string().trim().min(4, "Contanos qué te sobró (por ejemplo, 38 m² de porcelanato 60x60).").max(120),
  condicion: z.enum(Object.keys(CONDICIONES) as [Condicion, ...Condicion[]]),
});

// Solo lo que muestra la calculadora (no se mandan las fuentes al navegador).
// `deUsuarios`: cuántas personas reportaron el precio nuevo (si salió de ahí y no de la web).
export type Tasacion = { mercado: number; sugerido: number; ajustadoASobra: boolean; deUsuarios: number; coherencia: Coherencia };

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

export async function tasarDesdePortada(
  texto: unknown,
  condicion: unknown,
  marca?: unknown,
): Promise<{ ok: true; tasacion: Tasacion } | { ok: false; error: string; detalle?: string; limite?: boolean }> {
  const datos = esquema.safeParse({ texto, condicion });
  if (!datos.success) return { ok: false, error: datos.error.issues[0].message };
  const { texto: t, condicion: c } = datos.data;
  const m = typeof marca === "string" ? marca.trim().slice(0, 60) : "";

  const clave = `${t.toLowerCase().replace(/\s+/g, " ")}|${c}|${m.toLowerCase()}`;
  const guardada = memoria.get(clave);
  if (guardada && guardada.hasta > Date.now()) return { ok: true, tasacion: guardada.tasacion };
  const lote = { titulo: m ? `${t}, marca ${m}` : t, categoria: adivinarCategoria(t) ?? "", condicion: c, descripcion: "", items: [] };

  // Lo que pagaron otros usuarios por el mismo producto: entra en la comparación con la web.
  const reportado = await precioReportado(t, m || null);

  const dePrueba = iaDePrueba();
  if (!dePrueba && !process.env.ANTHROPIC_API_KEY) {
    console.error("[Sobrá] Falta ANTHROPIC_API_KEY: la calculadora no puede buscar precios.");
    return { ok: false, error: "La búsqueda de precios no está configurada (falta ANTHROPIC_API_KEY)." };
  }

  const perfil = await obtenerPerfil();
  const h = await headers();
  const quien = perfil?.id ?? h.get("x-forwarded-for")?.split(",")[0].trim() ?? h.get("x-real-ip") ?? "sin-ip";
  const ahora = Date.now();
  const recientes = (usos.get(quien) ?? []).filter((x) => ahora - x < 86_400_000);
  delDia = delDia.filter((x) => ahora - x < 86_400_000);
  if (recientes.length >= (perfil ? POR_PERSONA_CON_CUENTA : POR_PERSONA_SIN_CUENTA) || delDia.length >= TOPE_DIARIO) {
    return { ok: false, limite: true, error: "Llegaste al límite de búsquedas de precios por hoy." };
  }
  usos.set(quien, [...recientes, ahora]);
  delDia.push(ahora);

  try {
    const informe = dePrueba ? await tasacionDePrueba(lote, reportado) : await precioSugeridoCompleto(lote, reportado);
    const tasacion: Tasacion = {
      mercado: informe.total_mercado_ars,
      sugerido: informe.sugerido,
      ajustadoASobra: informe.motivo.includes("más baratos"),
      deUsuarios: informe.deUsuarios,
      coherencia: informe.coherencia ?? "solo_web",
    };
    memoria.set(clave, { tasacion, hasta: ahora + 24 * 3_600_000 });
    return { ok: true, tasacion };
  } catch (error) {
    const { mensaje, detalle } = explicarErrorIA(error);
    return { ok: false, error: mensaje, detalle };
  }
}

// Para el recorrido de pruebas (SOBRA_IA_DE_PRUEBA=1, nunca en producción): sin
// gastar la API, pero con la comparación real contra lo publicado en Sobrá.
async function tasacionDePrueba(lote: { titulo: string; condicion: Condicion }, reportado: Awaited<ReturnType<typeof precioReportado>>) {
  const { combinarPrecio, cantidadPrincipal } = await import("@/lib/precio-comparables");
  const { factorPrecio, adivinarCategoria } = await import("@/lib/depreciacion");
  const { consolidarPrecios } = await import("@/lib/precio-consolidar");
  const referencia = await referenciaEnSobra({ texto: lote.titulo, condicion: lote.condicion, categoria: adivinarCategoria(lote.titulo) });
  // "La web" de prueba: un proveedor a $ 600.000 el lote, comparado con lo que pagaron los usuarios.
  const principal = cantidadPrincipal(lote.titulo);
  const web = principal ? [{ tipo_vendedor: "proveedor" as const, moneda: "ARS" as const, precio: 600000, por_cantidad: principal.cantidad, unidad: principal.unidad, incluye_iva: true }] : [];
  const consolidado = consolidarPrecios([...web, ...(reportado?.precios ?? [])], principal, 1000);
  const mercado = consolidado?.total ?? 600000;
  const { sugerido, motivo } = combinarPrecio(mercado * factorPrecio(adivinarCategoria(lote.titulo), lote.condicion, [], lote.titulo), referencia);
  return { total_mercado_ars: mercado, sugerido: sugerido ?? 0, motivo, referencia, deUsuarios: reportado?.personas ?? 0, coherencia: consolidado?.coherencia };
}

// Cuando alguien pone cuánto le costó el material nuevo, se guarda (sin sus datos)
// para que entre en la comparación de precios la próxima vez que alguien tase lo mismo.
const esquemaReporte = z.object({
  texto: z.string().trim().min(3).max(120),
  marca: z.string().trim().max(60).optional(),
  cantidad: z.number().positive().max(1e9),
  unidad: z.string().trim().min(1).max(20),
  precio: z.number().min(PRECIO_LISTA_MINIMO).max(1e12),
});

export async function reportarPrecio(datos: unknown) {
  const r = esquemaReporte.safeParse(datos);
  if (!r.success) return;
  const perfil = await obtenerPerfil();
  const h = await headers();
  const persona = perfil?.id ?? h.get("x-forwarded-for")?.split(",")[0].trim() ?? h.get("x-real-ip") ?? "sin-ip";
  await guardarReporte({
    texto: r.data.texto,
    marca: r.data.marca,
    cantidad: r.data.cantidad,
    unidad: r.data.unidad,
    precioTotalArs: r.data.precio,
    quien: quienReporta(persona),
    origen: "calculadora",
  });
}
