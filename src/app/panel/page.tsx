import { redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/server";
import { obtenerPerfil } from "@/lib/sesion";

export default async function Panel({ searchParams }: PageProps<"/panel">) {
  const perfil = await obtenerPerfil();
  if (!perfil) redirect("/ingresar");
  // Mantiene el aviso (?ok=...) al redirigir.
  const { ok } = await searchParams;
  const aviso = typeof ok === "string" ? `?ok=${encodeURIComponent(ok)}` : "";
  if (perfil.rol === "admin") redirect(`/admin${aviso}`);

  // Quien ya publicó algo entra a sus ventas; si no, a sus compras.
  const supabase = await crearClienteServidor();
  const { count } = await supabase.from("lotes").select("id", { count: "exact", head: true }).eq("vendedor_id", perfil.id);
  redirect(`${count ? "/panel/vendedor" : "/panel/comprador"}${aviso}`);
}
