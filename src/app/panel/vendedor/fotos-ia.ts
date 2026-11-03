"use server";

import Anthropic from "@anthropic-ai/sdk";
import { obtenerPerfil, sesionVerificada } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { CONSULTAS_DE_PRUEBA, MAX_FOTOS_IA, proponerLoteDesdeFotos, type PropuestaLote } from "@/lib/lote-desde-fotos";

// Cada análisis usa la API de Anthropic. Para cuidar el saldo: como máximo 20
// por usuario por día (en la memoria del servidor, igual que el precio con IA).
const MAXIMO_POR_DIA = 20;
const usos = new Map<string, number[]>();

export type ResultadoFotosIA = { ok: true; propuesta: PropuestaLote } | { ok: false; error: string };

export async function completarConFotos(rutas: unknown, pista: unknown): Promise<ResultadoFotosIA> {
  const perfil = await obtenerPerfil();
  if (!perfil) return { ok: false, error: "Tu sesión venció. Volvé a ingresar." };
  if (!(await sesionVerificada())) return { ok: false, error: "Ingresá el código que te mandamos por email para usar esto." };

  // Solo fotos propias, ya subidas (están en la carpeta del usuario).
  const fotos = (Array.isArray(rutas) ? rutas : [])
    .filter((r): r is string => typeof r === "string" && new RegExp(`^${perfil.id}/[\\w-]+\\.jpg$`).test(r))
    .slice(0, MAX_FOTOS_IA);
  if (!fotos.length) return { ok: false, error: "Subí al menos una foto del lote." };
  const textoPista = typeof pista === "string" ? pista.trim().slice(0, 120) : "";

  const dePrueba = process.env.SOBRA_IA_DE_PRUEBA === "1";
  if (!dePrueba && !process.env.ANTHROPIC_API_KEY) return { ok: false, error: "Falta configurar ANTHROPIC_API_KEY en el servidor." };

  const ahora = Date.now();
  const recientes = (usos.get(perfil.id) ?? []).filter((t) => ahora - t < 86_400_000);
  if (recientes.length >= MAXIMO_POR_DIA) return { ok: false, error: "Ya usaste mucho esta función hoy. Completá los datos a mano o probá mañana." };
  usos.set(perfil.id, [...recientes, ahora]);

  try {
    const supabase = await crearClienteServidor();
    const imagenes = await Promise.all(
      fotos.map(async (ruta) => {
        const { data, error } = await supabase.storage.from("lotes").download(ruta);
        if (error || !data) throw new Error("No pudimos leer una de las fotos. Probá subirla de nuevo.");
        return { datos: Buffer.from(await data.arrayBuffer()), tipo: "image/jpeg" as const };
      }),
    );
    const propuesta = await proponerLoteDesdeFotos(imagenes, textoPista, dePrueba ? CONSULTAS_DE_PRUEBA : undefined);
    if (!propuesta.es_material) {
      return { ok: false, error: "No reconocimos materiales en las fotos. Probá con fotos donde se vea bien el material, o completá los datos a mano." };
    }
    return { ok: true, propuesta };
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      console.error("[Sobrá] La clave ANTHROPIC_API_KEY no es válida.");
      return { ok: false, error: "La clave de la IA no es válida. Revisá ANTHROPIC_API_KEY." };
    }
    if (error instanceof Anthropic.RateLimitError) return { ok: false, error: "La IA está con mucha demanda. Probá de nuevo en un minuto." };
    if (error instanceof Anthropic.APIError) {
      console.error(`[Sobrá] Error de la API de Anthropic ${error.status}:`, error.message);
      return {
        ok: false,
        error: /credit|balance/i.test(error.message) ? "La cuenta de Anthropic no tiene saldo. Cargá crédito en console.anthropic.com." : "No pudimos analizar las fotos. Probá de nuevo.",
      };
    }
    console.error("[Sobrá] No se pudo completar el lote con fotos", error);
    return { ok: false, error: error instanceof Error ? error.message : "No pudimos analizar las fotos." };
  }
}
