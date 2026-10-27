import { cache } from "react";
import { redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/server";
import type { Perfil, Rol } from "@/lib/datos";

// Perfil del usuario logueado, o null. Se cachea por request.
export const obtenerPerfil = cache(async (): Promise<Perfil | null> => {
  const supabase = await crearClienteServidor();
  const { data } = await supabase.auth.getClaims();
  const id = data?.claims?.sub;
  if (!id) return null;
  const { data: perfil } = await supabase.from("perfiles").select("*").eq("id", id).single();
  return perfil as Perfil | null;
});

export async function exigirRol(...roles: Rol[]): Promise<Perfil> {
  const perfil = await obtenerPerfil();
  if (!perfil) redirect("/ingresar");
  if (!roles.includes(perfil.rol)) redirect("/panel");
  return perfil;
}
