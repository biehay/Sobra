"use server";

import { z } from "zod";
import { obtenerPerfil, sesionVerificada } from "@/lib/sesion";
import { explicarErrorIA } from "@/lib/errores-ia";
import { precioSugeridoCompleto, type InformeCompleto } from "@/lib/precio-sugerido";
import { CATEGORIAS, CONDICIONES, type Condicion } from "@/lib/datos";

// Cada consulta usa la API de Anthropic (cuesta centavos). Para cuidar el saldo:
// como máximo 15 por usuario por día, y la misma consulta se responde de la
// memoria durante 12 horas. (Se guarda en la memoria del servidor: alcanza para
// empezar; con muchos usuarios conviene pasarlo a la base.)
const MAXIMO_POR_DIA = 15;
const usos = new Map<string, number[]>();
const memoria = new Map<string, { informe: InformeCompleto; hasta: number }>();

const esquema = z.object({
  titulo: z.string().trim().min(5, "Escribí primero el título del lote").max(120),
  categoria: z.enum(CATEGORIAS, "Elegí primero la categoría"),
  condicion: z.enum(Object.keys(CONDICIONES) as [Condicion, ...Condicion[]]),
  descripcion: z.string().trim().max(3000).default(""),
  items: z
    .array(z.object({ nombre: z.string().trim().max(120), cantidad: z.number().nonnegative(), unidad: z.string().trim().max(20) }))
    .max(30),
  detalles: z.array(z.string().regex(/^[a-z_]+$/)).max(10).default([]),
});

export type ResultadoPrecioIA = { ok: true; informe: InformeCompleto } | { ok: false; error: string };

export async function sugerirPrecioConIA(datos: unknown): Promise<ResultadoPrecioIA> {
  const perfil = await obtenerPerfil();
  if (!perfil) return { ok: false, error: "Tu sesión venció. Volvé a ingresar." };
  if (!(await sesionVerificada())) return { ok: false, error: "Ingresá el código que te mandamos por email para usar esto." };
  const dePrueba = process.env.SOBRA_IA_DE_PRUEBA === "1";
  if (!dePrueba && !process.env.ANTHROPIC_API_KEY) return { ok: false, error: "Falta configurar ANTHROPIC_API_KEY en el servidor." };

  const lote = esquema.safeParse(datos);
  if (!lote.success) return { ok: false, error: lote.error.issues[0].message };
  lote.data.items = lote.data.items.filter((i) => i.nombre && i.cantidad > 0);
  if (dePrueba) return { ok: true, informe: await informeDePrueba(lote.data) };

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
    // Las fuentes no se mandan al navegador: solo el resultado.
    const informe = { ...(await precioSugeridoCompleto(lote.data)), fuentes: [] };
    memoria.set(clave, { informe, hasta: ahora + 12 * 3_600_000 });
    return { ok: true, informe };
  } catch (error) {
    // Si la IA devolvió algo con otro formato, no se lo mostramos al usuario.
    if (error instanceof z.ZodError) return { ok: false, error: "La IA devolvió una respuesta incompleta. Probá de nuevo." };
    const { mensaje, detalle } = explicarErrorIA(error);
    return { ok: false, error: detalle ? `${mensaje} (${detalle})` : mensaje };
  }
}

// Para el recorrido de pruebas (SOBRA_IA_DE_PRUEBA=1, nunca en producción): sin
// gastar la API. "La web" dice $ 900.000 nuevo; el resto es el cálculo real
// (descuento por rubro y estado, y comparación con lo publicado en Sobrá).
async function informeDePrueba(lote: z.infer<typeof esquema>): Promise<InformeCompleto> {
  const { referenciaEnSobra } = await import("@/lib/precio-sugerido");
  const { combinarPrecio } = await import("@/lib/precio-comparables");
  const { factorPrecio } = await import("@/lib/depreciacion");
  const mercado = 900_000;
  const factor = factorPrecio(lote.categoria, lote.condicion, lote.detalles, lote.titulo);
  const sugeridoMercado = Math.round((mercado * factor) / 1000) * 1000;
  const referencia = await referenciaEnSobra({ texto: lote.titulo, items: lote.items, categoria: lote.categoria, condicion: lote.condicion, detalles: lote.detalles });
  const { sugerido, motivo } = combinarPrecio(sugeridoMercado, referencia);
  return {
    total_mercado_ars: mercado,
    precios_encontrados: [],
    tipo_cambio_usd_ars: 1000,
    usados_mercado_ars: null,
    detalle: [],
    fuentes: [],
    confianza: "media",
    notas: "",
    sugerido: sugerido ?? sugeridoMercado,
    descuento: Math.round((1 - factor) * 100),
    coherencia: "solo_web",
    sugeridoMercado,
    referencia,
    motivo,
    deUsuarios: 0,
  } as unknown as InformeCompleto;
}
