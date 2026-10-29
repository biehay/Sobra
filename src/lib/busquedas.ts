import "server-only";
import { crearClienteServidor } from "@/lib/supabase/server";
import type { Lote } from "@/lib/datos";

// "Lo busco": búsquedas guardadas de los compradores. Que un lote coincida lo
// decide la base (public.coincide); acá solo se leen.
export type Busqueda = {
  id: string;
  texto: string;
  categoria: string | null;
  zona: string | null;
  precio_max: number | null;
  activa: boolean;
  created_at: string;
};

export async function misBusquedas(): Promise<(Busqueda & { lotes: Lote[] })[]> {
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("busquedas").select("*").order("created_at", { ascending: false });
  const busquedas = (data ?? []) as Busqueda[];
  return Promise.all(
    busquedas.map(async (b) => {
      if (!b.activa) return { ...b, lotes: [] };
      const { data: lotes } = await supabase.rpc("lotes_para_busqueda", { p_busqueda: b.id });
      return { ...b, lotes: (lotes ?? []) as Lote[] };
    }),
  );
}

export type BusquedaPublica = { texto: string; categoria: string | null; zona: string | null; precio_max: number | null; created_at: string; cantidad: number };

export async function busquedasPublicas(): Promise<BusquedaPublica[]> {
  const supabase = await crearClienteServidor();
  const { data } = await supabase.rpc("busquedas_publicas");
  return (data ?? []) as BusquedaPublica[];
}
