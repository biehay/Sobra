import "server-only";
import { cache } from "react";
import { crearClienteServidor } from "@/lib/supabase/server";
import type { Lote } from "@/lib/datos";
import { recomendar, type Busqueda, type Colectiva, type Ficha, type Recomendacion, type Senal } from "./motor";

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

// Confianza por vendedor: (ventas sin reclamos + 1) / (ventas + 2). Sin ventas da
// 0,5; con buenas ventas se acerca a 1. Así un vendedor nuevo no arranca hundido.
const confianza = cache(async (): Promise<Map<string, number>> => {
  const supabase = await crearClienteServidor();
  const { data } = await supabase.rpc("confianza_vendedores");
  return new Map(
    ((data ?? []) as { vendedor_id: string; ventas: number; ventas_ok: number }[]).map((c) => [
      c.vendedor_id,
      (Number(c.ventas_ok) + 1) / (Number(c.ventas) + 2),
    ]),
  );
});

// Fichas técnicas de los lotes publicados (las que ya están armadas).
const fichasPublicadas = cache(async (): Promise<Map<string, Ficha>> => {
  const supabase = await crearClienteServidor();
  const { data } = await supabase
    .from("fichas_lote")
    .select("lote_id, ficha, lotes!inner(estado)")
    .eq("lotes.estado", "publicado")
    .limit(1000);
  return new Map(((data ?? []) as unknown as { lote_id: string; ficha: Ficha }[]).map((f) => [f.lote_id, f.ficha]));
});

// Las de los candidatos más las de unos pocos lotes puntuales (lo que vio o compró,
// que puede ya no estar publicado).
async function fichasDe(loteIds: string[]): Promise<Map<string, Ficha>> {
  const publicadas = await fichasPublicadas();
  const faltan = [...new Set(loteIds)].filter((id) => !publicadas.has(id)).slice(0, 40);
  if (!faltan.length) return publicadas;
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("fichas_lote").select("lote_id, ficha").in("lote_id", faltan);
  const todas = new Map(publicadas);
  for (const f of (data ?? []) as { lote_id: string; ficha: Ficha }[]) todas.set(f.lote_id, f.ficha);
  return todas;
}

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

// Lo que guardó en "Lo busco" y lo que tiene para retirar (compras en curso).
const contextoDe = cache(async (usuarioId: string) => {
  const supabase = await crearClienteServidor();
  const [{ data: busquedas }, { data: enCurso }] = await Promise.all([
    supabase.from("busquedas").select("texto, categoria, zona, created_at").eq("activa", true),
    supabase.from("ofertas").select("lotes(vendedor_id, zona, localidad, titulo)").eq("comprador_id", usuarioId).in("estado", ["aceptada", "pagada"]),
  ]);
  return {
    busquedas: ((busquedas ?? []) as { texto: string; categoria: string | null; zona: string | null; created_at: string }[]).map(
      (b): Busqueda => ({ texto: b.texto, categoria: b.categoria, zona: b.zona, fecha: b.created_at }),
    ),
    retiros: ((enCurso ?? []) as unknown as { lotes: { vendedor_id: string; zona: string; localidad: string; titulo: string } | null }[])
      .filter((o) => o.lotes)
      .map((o) => ({ vendedorId: o.lotes!.vendedor_id, zona: o.lotes!.zona, localidad: o.lotes!.localidad, titulo: o.lotes!.titulo })),
  };
});

// Portada y "Para vos": según todo lo que hizo la persona.
export async function recomendacionesParaUsuario(usuarioId: string, zona: string | null, cantidad = 6): Promise<Recomendacion[]> {
  const senales = await senalesDe(usuarioId);
  const semillas = [...new Set(senales.map((s) => s.lote.id))].slice(0, 30);
  const [lotes, pop, col, conf, extra] = await Promise.all([
    candidatos(),
    popularidad(),
    colectivas(semillas, usuarioId),
    confianza(),
    contextoDe(usuarioId),
  ]);
  const fichas = await fichasDe(semillas);
  return recomendar(
    { senales, candidatos: lotes, usuarioId, zonaUsuario: zona, colectivas: col, popularidad: pop, confianza: conf, fichas, ...extra },
    cantidad,
  );
}

// Sin cuenta: según los lotes que vio en este navegador (los manda el navegador).
export async function recomendacionesParaVisitante(loteIds: string[], cantidad = 6): Promise<Recomendacion[]> {
  const ids = loteIds.filter((id) => /^[0-9a-f-]{36}$/.test(id)).slice(0, 20);
  const [lotes, pop, col, conf] = await Promise.all([candidatos(), popularidad(), colectivas(ids, null), confianza()]);
  const porId = new Map(lotes.map((l) => [l.id, l]));
  // Las más recientes primero: el navegador las manda en ese orden.
  const senales: Senal[] = ids
    .map((id, i) => ({ lote: porId.get(id), i }))
    .filter((x): x is { lote: Lote; i: number } => !!x.lote)
    .map(({ lote, i }) => ({ lote, tipo: "vista", fecha: new Date(Date.now() - i * 3_600_000).toISOString() }));
  if (!senales.length) return [];
  const fichas = await fichasDe(ids);
  return recomendar({ senales, candidatos: lotes, colectivas: col, popularidad: pop, confianza: conf, fichas }, cantidad);
}

// En el detalle de un lote: parecidos y complementos de ese lote, más un poco
// de lo que ya sabemos de la persona.
export async function recomendacionesDeLote(lote: Lote, usuarioId: string | null, zona: string | null) {
  const [lotes, pop, col, propias, conf, extra] = await Promise.all([
    candidatos(),
    popularidad(),
    colectivas([lote.id], usuarioId),
    usuarioId ? senalesDe(usuarioId) : Promise.resolve([] as Senal[]),
    confianza(),
    usuarioId ? contextoDe(usuarioId) : Promise.resolve({ busquedas: [], retiros: [] }),
  ]);
  const ahora = new Date().toISOString();
  const otros = lotes.filter((l) => l.id !== lote.id);
  const fichas = await fichasDe([lote.id, ...propias.map((s) => s.lote.id)]);
  // "Para completar la obra": como si ya lo hubiera comprado, solo complementos.
  const complementos = recomendar(
    { senales: [{ lote, tipo: "compra", fecha: ahora }], candidatos: otros, usuarioId, zonaUsuario: zona, confianza: conf, retiros: extra.retiros, fichas },
    6,
  )
    .flatMap((r) => (r.complemento ? [{ ...r, motivo: r.complemento }] : []))
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
      confianza: conf,
      fichas,
      ...extra,
    },
    6,
  );
  return { parecidos, complementos };
}

// `origen`: si llegó desde una recomendación ("rec-complemento", "rec-etapa"...),
// para medir qué tipos de recomendación sirven de verdad.
export async function registrarVista(loteId: string, origen?: string | null) {
  const supabase = await crearClienteServidor();
  await supabase.rpc("registrar_vista", { p_lote: loteId, p_origen: origen && /^rec-[a-z]+$/.test(origen) ? origen : null });
}
