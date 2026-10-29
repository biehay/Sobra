import "server-only";
import { crearClienteServidor } from "@/lib/supabase/server";

// Impacto ambiental de las operaciones. Los números los calcula la base
// (mi_impacto, emitir_constancia); acá solo se leen y se formatean.

// Factores de CO₂ por categoría (kg de CO₂ por kg de material nuevo). Tienen que
// coincidir con public.factor_co2() en la base: acá se usan solo para explicar.
export const FACTORES_CO2: [string, number][] = [
  ["Cerámicos y porcelanatos", 0.78],
  ["Sanitarios y grifería", 1.6],
  ["Electricidad e iluminación", 3.0],
  ["Plomería y gas", 2.5],
  ["Cemento, cal y áridos", 0.5],
  ["Hierros y perfiles", 1.55],
  ["Maderas y placas", 0.45],
  ["Aberturas", 3.0],
  ["Pinturas e impermeabilizantes", 2.5],
  ["Aislantes y durlock", 0.6],
  ["Herramientas y equipos", 2.0],
  ["Otros", 1.0],
];

export type OperacionImpacto = {
  oferta_id: string;
  titulo: string;
  categoria: string;
  rol: "vendedor" | "comprador";
  kg: number;
  co2: number;
  completada_at: string;
};

export type Constancia = {
  codigo?: string;
  titular?: string;
  anio: number;
  kg_recuperados: number;
  kg_reutilizados: number;
  co2_evitado: number;
  operaciones: number;
  emitida_at: string;
};

export function anioDe(fecha: string) {
  return Number(new Date(fecha).toLocaleDateString("es-AR", { year: "numeric", timeZone: "America/Argentina/Buenos_Aires" }));
}

// 1.234 kg o 3,2 t, según el tamaño.
export function peso(kg: number) {
  return kg >= 1000
    ? `${(kg / 1000).toLocaleString("es-AR", { maximumFractionDigits: 1 })} t`
    : `${Math.round(kg).toLocaleString("es-AR")} kg`;
}

export async function miImpacto(): Promise<OperacionImpacto[]> {
  const supabase = await crearClienteServidor();
  const { data } = await supabase.rpc("mi_impacto");
  return ((data ?? []) as OperacionImpacto[]).map((o) => ({ ...o, kg: Number(o.kg), co2: Number(o.co2) }));
}

export async function misConstancias(): Promise<Constancia[]> {
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("constancias").select("*").order("emitida_at", { ascending: false });
  return (data ?? []) as Constancia[];
}

export async function verificarConstancia(codigo: string): Promise<Constancia | null> {
  const supabase = await crearClienteServidor();
  const { data } = await supabase.rpc("verificar_constancia", { p_codigo: codigo });
  const fila = (data ?? [])[0] as Constancia | undefined;
  return fila ? { ...fila, codigo: codigo.toUpperCase() } : null;
}

export async function impactoTotal() {
  const supabase = await crearClienteServidor();
  const { data } = await supabase.rpc("impacto_total");
  const fila = (data ?? [])[0] as { kg: number; co2: number; operaciones: number } | undefined;
  return { kg: Number(fila?.kg ?? 0), co2: Number(fila?.co2 ?? 0), operaciones: Number(fila?.operaciones ?? 0) };
}
