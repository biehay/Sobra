import { NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
import { CATEGORIAS } from "@/lib/datos";
import { sugerir, type LoteBuscable } from "@/lib/sugerencias";

// Sugerencias del buscador mientras se escribe (lotes publicados y categorías).
// Lo mismo para todos: no depende de quién busca.
export async function GET(request: Request) {
  const q = (new URL(request.url).searchParams.get("q") ?? "").slice(0, 80);
  if (q.trim().length < 2) return NextResponse.json({ lotes: [], categorias: [] });
  const supabase = await crearClienteServidor();
  const { data } = await supabase
    .from("lotes")
    .select("id, titulo, categoria, zona, items, fotos, precio_publicado, precio_pedido")
    .eq("estado", "publicado")
    .order("publicado_at", { ascending: false })
    .limit(500);
  const resultado = sugerir(q, (data ?? []) as LoteBuscable[], CATEGORIAS);
  return NextResponse.json(resultado, { headers: { "Cache-Control": "public, max-age=30" } });
}
