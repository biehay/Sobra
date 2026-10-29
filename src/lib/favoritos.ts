import "server-only";
import { cache } from "react";
import { crearClienteServidor } from "@/lib/supabase/server";
import { obtenerPerfil } from "@/lib/sesion";

type Favoritos = { usuarioId: string; guardados: Set<string> };

// Lotes que guardó el usuario logueado, o null si no hay usuario (o es admin).
export const idsFavoritos = cache(async (): Promise<Favoritos | null> => {
  const perfil = await obtenerPerfil();
  if (!perfil || perfil.rol === "admin") return null;
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("favoritos").select("lote_id");
  return { usuarioId: perfil.id, guardados: new Set((data ?? []).map((f) => f.lote_id as string)) };
});

// Para la tarjeta: si el lote está guardado, o undefined (sin corazón) cuando no
// hay usuario o el lote es del propio usuario.
export function estadoFavorito(favoritos: Favoritos | null, lote: { id: string; vendedor_id: string }) {
  if (!favoritos || lote.vendedor_id === favoritos.usuarioId) return undefined;
  return favoritos.guardados.has(lote.id);
}
