import { redirect } from "next/navigation";
import { obtenerPerfil } from "@/lib/sesion";

export default async function Panel({ searchParams }: PageProps<"/panel">) {
  const perfil = await obtenerPerfil();
  if (!perfil) redirect("/ingresar");
  // Mantiene el aviso (?ok=...) al redirigir al panel de cada rol.
  const { ok } = await searchParams;
  const aviso = typeof ok === "string" ? `?ok=${encodeURIComponent(ok)}` : "";
  redirect(perfil.rol === "admin" ? `/admin${aviso}` : `/panel/${perfil.rol}${aviso}`);
}
