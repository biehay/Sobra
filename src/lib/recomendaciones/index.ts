import "server-only";
import { cache } from "react";
import { crearClienteServidor } from "@/lib/supabase/server";
import type { Lote } from "@/lib/datos";
import { recomendar, type Colectiva, type Recomendacion, type Senal } from "./motor";

// Junta los datos que necesita el motor (motor.ts) y arma las recomendaciones
// para cada lugar de la app. Los candidatos son los lotes publicados más
// recientes; con muchos lotes, esto se puede precalcular.

const CANDIDATOS = 300;

const candidatos = cache(async (): Promise<Lote[]> => {
  const supabase = await crearClienteServidor();
  const { data } = await supabase
    .from("lotes")
    .select("*")
    .eq("estado", "publicado")
    .order("publicado_at", { ascending: false })
    .limit(CANDIDATOS);
  return (data ?? []) as Lote[];
});

const popularidad = cache(async (): Promise<Map<string, number>> => {
  const supabase = await crearClienteServidor();
  const { data } = await supabase.rpc("popularidad_lotes");
  return new Map(((data ?? []) as { lote_id: string; personas: number }[]).map((p) => [p.lote_id, Number(p.personas)]));
});

async function colectivas(loteIds: string[], usuarioId: string | null): Promise<Map<string, Colectiva>> {
  if (!loteIds.length) return new Map();
  const supabase = await crearClienteServidor();
  const { data } = await supabase.rpc("senales_colectivas", { p_lotes: loteIds, p_usuario: usuarioId });
  return new Map(
    ((data ?? []) as { lote_id: string; en_comun: number; popularidad: number }[]).map((c) => [
      c.lote_id,
      { en_comun: Number(c.en_comun), popularidad: Number(c.popularidad) },
    ]),
  );
}

// Lo que hizo el usuario: lo que vio, guardó, ofertó y compró (cada uno con su fecha).
const senalesDe = cache(async (usuarioId: string): Promise<Senal[]> => {
  const supabase = await crearClienteServidor();
  const [{ data: vistas }, { data: favoritos }, { data: ofertas }] = await Promise.all([
    supabase.from("vistas_usuario").select("dia, veces, lotes(*)").order("dia", { ascending: false }).limit(60),
    supabase.from("favoritos").select("created_at, lotes(*)"),
    supabase.from("ofertas").select("created_at, completada_at, estado, lotes(*)").eq("comprador_id", usuarioId),
  ]);
  type ConLote<T> = T & { lotes: Lote | null };
  const senales: Senal[] = [];
  for (const v of (vistas ?? []) as unknown as ConLote<{ dia: string; veces: number }>[]) {
    if (v.lotes) senales.push({ lote: v.lotes, tipo: "vista", fecha: `${v.dia}T15:00:00Z`, veces: v.veces });
  }
  for (const f of (favoritos ?? []) as unknown as ConLote<{ created_at: string }>[]) {
    if (f.lotes) senales.push({ lote: f.lotes, tipo: "favorito", fecha: f.created_at });
  }
  for (const o of (ofertas ?? []) as unknown as ConLote<{ created_at: string; completada_at: string | null; estado: string }>[]) {
    if (!o.lotes) continue;
    const compro = ["pagada", "completada"].includes(o.estado);
    senales.push({ lote: o.lotes, tipo: compro ? "compra" : "oferta", fecha: o.completada_at ?? o.created_at });
  }
  return senales;
});

// Portada y "Para vos": según todo lo que hizo la persona.
export async function recomendacionesParaUsuario(usuarioId: string, zona: string | null, cantidad = 6): Promise<Recomendacion[]> {
  const senales = await senalesDe(usuarioId);
  const semillas = [...new Set(senales.map((s) => s.lote.id))].slice(0, 30);
  const [lotes, pop, col] = await Promise.all([candidatos(), popularidad(), colectivas(semillas, usuarioId)]);
  return recomendar({ senales, candidatos: lotes, usuarioId, zonaUsuario: zona, colectivas: col, popularidad: pop }, cantidad);
}

// Sin cuenta: según los lotes que vio en este navegador (los manda el navegador).
export async function recomendacionesParaVisitante(loteIds: string[], cantidad = 6): Promise<Recomendacion[]> {
  const ids = loteIds.filter((id) => /^[0-9a-f-]{36}$/.test(id)).slice(0, 20);
  const [lotes, pop, col] = await Promise.all([candidatos(), popularidad(), colectivas(ids, null)]);
  const porId = new Map(lotes.map((l) => [l.id, l]));
  // Las más recientes primero: el navegador las manda en ese orden.
  const senales: Senal[] = ids
    .map((id, i) => ({ lote: porId.get(id), i }))
    .filter((x): x is { lote: Lote; i: number } => !!x.lote)
    .map(({ lote, i }) => ({ lote, tipo: "vista", fecha: new Date(Date.now() - i * 3_600_000).toISOString() }));
  if (!senales.length) return [];
  return recomendar({ senales, candidatos: lotes, colectivas: col, popularidad: pop }, cantidad);
}

// En el detalle de un lote: parecidos y complementos de ese lote, más un poco
// de lo que ya sabemos de la persona.
export async function recomendacionesDeLote(lote: Lote, usuarioId: string | null, zona: string | null) {
  const [lotes, pop, col, propias] = await Promise.all([
    candidatos(),
    popularidad(),
    colectivas([lote.id], usuarioId),
    usuarioId ? senalesDe(usuarioId) : Promise.resolve([] as Senal[]),
  ]);
  const ahora = new Date().toISOString();
  const otros = lotes.filter((l) => l.id !== lote.id);
  // "Para completar la obra": como si ya lo hubiera comprado, solo complementos.
  const complementos = recomendar({ senales: [{ lote, tipo: "compra", fecha: ahora }], candidatos: otros, usuarioId, zonaUsuario: zona }, 6)
    .filter((r) => r.motivo.tipo === "complemento")
    .slice(0, 3);
  const yaMostrados = new Set(complementos.map((r) => r.lote.id));
  // "También te puede interesar": el lote abierto pesa como si lo hubiera
  // guardado, más un poco de su historial, sin repetir los complementos.
  const parecidos = recomendar(
    {
      senales: [{ lote, tipo: "favorito", fecha: ahora }, ...propias.slice(0, 10).map((s) => ({ ...s, tipo: "vista" as const }))],
      candidatos: otros.filter((l) => !yaMostrados.has(l.id)),
      usuarioId,
      zonaUsuario: zona,
      colectivas: col,
      popularidad: pop,
    },
    6,
  );
  return { parecidos, complementos };
}

export async function registrarVista(loteId: string) {
  const supabase = await crearClienteServidor();
  await supabase.rpc("registrar_vista", { p_lote: loteId });
}
