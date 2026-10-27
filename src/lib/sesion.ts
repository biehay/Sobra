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

// Verificación en dos pasos de la sesión actual:
// - `activa`: el usuario tiene una app autenticadora registrada.
// - `verificada`: en esta sesión ya ingresó el código (nivel aal2).
export const dosPasos = cache(async () => {
  const supabase = await crearClienteServidor();
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  return { activa: data?.nextLevel === "aal2", verificada: data?.currentLevel === "aal2" };
});

export async function exigirRol(...roles: Rol[]): Promise<Perfil> {
  const perfil = await obtenerPerfil();
  if (!perfil) redirect("/ingresar");
  if (!roles.includes(perfil.rol)) redirect("/panel");

  // El admin está obligado a usar dos pasos. La base tampoco le da permisos
  // de admin sin ellos (ver es_admin()), esto solo lo lleva a la pantalla correcta.
  if (perfil.rol === "admin") {
    const { activa, verificada } = await dosPasos();
    if (!activa) redirect("/seguridad/activar?volver=/admin");
    if (!verificada) redirect("/seguridad/verificar?volver=/admin");
  }
  return perfil;
}
