"use server";

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { obtenerPerfil, sesionVerificada } from "@/lib/sesion";
import { estimarPrecioMercado, type InformePrecio } from "@/lib/precio-mercado";
import { CATEGORIAS, CONDICIONES, type Condicion } from "@/lib/datos";

// Cada consulta usa la API de Anthropic (cuesta centavos). Para cuidar el saldo:
// como máximo 15 por usuario por día, y la misma consulta se responde de la
// memoria durante 12 horas. (Se guarda en la memoria del servidor: alcanza para
// empezar; con muchos usuarios conviene pasarlo a la base.)
const MAXIMO_POR_DIA = 15;
const usos = new Map<string, number[]>();
const memoria = new Map<string, { informe: InformePrecio; hasta: number }>();

const esquema = z.object({
  titulo: z.string().trim().min(5, "Escribí primero el título del lote").max(120),
  categoria: z.enum(CATEGORIAS, "Elegí primero la categoría"),
  condicion: z.enum(Object.keys(CONDICIONES) as [Condicion, ...Condicion[]]),
  descripcion: z.string().trim().max(3000).default(""),
  items: z
    .array(z.object({ nombre: z.string().trim().max(120), cantidad: z.number().nonnegative(), unidad: z.string().trim().max(20) }))
    .max(30),
});

export type ResultadoPrecioIA = { ok: true; informe: InformePrecio } | { ok: false; error: string };

export async function sugerirPrecioConIA(datos: unknown): Promise<ResultadoPrecioIA> {
  const perfil = await obtenerPerfil();
  if (!perfil) return { ok: false, error: "Tu sesión venció. Volvé a ingresar." };
  if (!(await sesionVerificada())) return { ok: false, error: "Ingresá el código que te mandamos por email para usar esto." };
  if (!process.env.ANTHROPIC_API_KEY) return { ok: false, error: "Falta configurar ANTHROPIC_API_KEY en el servidor." };

  const lote = esquema.safeParse(datos);
  if (!lote.success) return { ok: false, error: lote.error.issues[0].message };
  lote.data.items = lote.data.items.filter((i) => i.nombre && i.cantidad > 0);

  const clave = JSON.stringify(lote.data);
  const guardado = memoria.get(clave);
  if (guardado && guardado.hasta > Date.now()) return { ok: true, informe: guardado.informe };

  const ahora = Date.now();
  const recientes = (usos.get(perfil.id) ?? []).filter((t) => ahora - t < 86_400_000);
  if (recientes.length >= MAXIMO_POR_DIA) {
    return { ok: false, error: "Ya pediste muchas sugerencias hoy. Probá mañana o cargá el precio de lista." };
  }
  usos.set(perfil.id, [...recientes, ahora]);

  try {
    const informe = await estimarPrecioMercado(lote.data);
    memoria.set(clave, { informe, hasta: ahora + 12 * 3_600_000 });
    return { ok: true, informe };
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      console.error("[Sobrá] La clave ANTHROPIC_API_KEY no es válida.");
      return { ok: false, error: "La clave de la IA no es válida. Revisá ANTHROPIC_API_KEY." };
    }
    if (error instanceof Anthropic.RateLimitError) {
      return { ok: false, error: "La IA está con mucha demanda. Probá de nuevo en un minuto." };
    }
    if (error instanceof Anthropic.APIError) {
      console.error(`[Sobrá] Error de la API de Anthropic ${error.status}:`, error.message);
      return {
        ok: false,
        error: error.status === 400 && /credit|balance/i.test(error.message)
          ? "La cuenta de Anthropic no tiene saldo. Cargá crédito en console.anthropic.com."
          : "No pudimos consultar la IA. Probá de nuevo.",
      };
    }
    console.error("[Sobrá] No se pudo estimar el precio con IA", error);
    // Si la IA devolvió algo con otro formato, no se lo mostramos al usuario.
    if (error instanceof z.ZodError) return { ok: false, error: "La IA devolvió una respuesta incompleta. Probá de nuevo." };
    return { ok: false, error: error instanceof Error ? error.message : "No pudimos estimar el precio." };
  }
}
