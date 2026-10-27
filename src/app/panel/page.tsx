import { redirect } from "next/navigation";
import { obtenerPerfil } from "@/lib/sesion";

export default async function Panel() {
  const perfil = await obtenerPerfil();
  if (!perfil) redirect("/ingresar");
  redirect(perfil.rol === "admin" ? "/admin" : `/panel/${perfil.rol}`);
}
