import "server-only";
import { createHash } from "node:crypto";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { crearClienteServidor } from "@/lib/supabase/server";

// Visitas de los lotes. Se cuenta una por persona y por día. Para no guardar
// datos personales, cada visitante es un hash del día con su usuario (o, si no
// ingresó, con su IP y su navegador): no se puede saber quién es ni seguirlo de
// un día a otro.

const BOTS = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|headless/i;

function hoy() {
  return new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10); // Buenos Aires (UTC-3)
}

export async function registrarVisita(loteId: string, visitante: { usuarioId?: string; ip: string; navegador: string }) {
  if (BOTS.test(visitante.navegador)) return;
  const admin = crearClienteAdmin();
  if (!admin) return;
  const dia = hoy();
  const quien = visitante.usuarioId ?? `${visitante.ip}|${visitante.navegador}`;
  const hash = createHash("sha256").update(`${dia}|${quien}`).digest("hex");
  const { error } = await admin
    .from("visitas_lote")
    .upsert({ lote_id: loteId, dia, visitante: hash }, { onConflict: "lote_id,dia,visitante", ignoreDuplicates: true });
  if (error) console.error("[Sobrá] No se pudo registrar la visita", error.message);
}

export type Visitas = { semana: number; total: number };

// Visitas de los lotes del vendedor logueado (la base solo le muestra las suyas).
export async function visitasDeMisLotes(loteIds: string[]): Promise<Map<string, Visitas>> {
  const resultado = new Map<string, Visitas>();
  if (!loteIds.length) return resultado;
  const supabase = await crearClienteServidor();
  const { data } = await supabase.rpc("visitas_de_mis_lotes");
  for (const fila of (data ?? []) as { lote_id: string; semana: number; total: number }[]) {
    if (loteIds.includes(fila.lote_id)) resultado.set(fila.lote_id, { semana: Number(fila.semana), total: Number(fila.total) });
  }
  return resultado;
}
