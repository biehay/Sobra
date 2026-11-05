"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { crearClienteServidor } from "@/lib/supabase/server";
import { mensajeParaUsuario } from "@/lib/errores";
import { obtenerPerfil, sesionVerificada } from "@/lib/sesion";

const esquema = z.object({
  loteId: z.uuid(),
  guardar: z.enum(["si", "no"]),
  // Solo rutas internas, para no redirigir a otro sitio.
  volver: z.string().regex(/^\/(?!\/)/).catch("/lotes"),
});

function conAviso(ruta: string, tipo: "ok" | "error", mensaje: string) {
  const [camino] = ruta.split("?");
  return `${camino}?${tipo}=${encodeURIComponent(mensaje)}`;
}

export async function cambiarFavorito(formData: FormData) {
  const datos = esquema.safeParse(Object.fromEntries(formData));
  if (!datos.success) redirect("/lotes");
  const { loteId, guardar, volver } = datos.data;

  const perfil = await obtenerPerfil();
  if (!perfil) redirect(`/registro?motivo=favorito&volver=${encodeURIComponent(volver)}`);
  if (!(await sesionVerificada())) redirect(`/seguridad/verificar?volver=${encodeURIComponent(volver)}`);

  const supabase = await crearClienteServidor();
  const { error } =
    guardar === "si"
      ? await supabase.from("favoritos").upsert({ lote_id: loteId }, { onConflict: "usuario_id,lote_id", ignoreDuplicates: true })
      : await supabase.from("favoritos").delete().eq("lote_id", loteId);
  if (error) redirect(conAviso(volver, "error", mensajeParaUsuario(error.message)));

  revalidatePath("/panel/favoritos");
  redirect(volver);
}

// Lo mismo, pero sin recargar la página (lo usa el corazón cuando hay JavaScript):
// así la pantalla no salta arriba de todo. Si hace falta cuenta o el código del
// email, devuelve adónde ir.
export async function alternarFavorito(
  loteId: unknown,
  guardar: unknown,
  volver: unknown,
): Promise<{ ok: true } | { ok: false; ir?: string; error?: string }> {
  const datos = esquema.safeParse({ loteId, guardar, volver });
  if (!datos.success) return { ok: false, error: "No se pudo guardar." };
  const perfil = await obtenerPerfil();
  if (!perfil) return { ok: false, ir: `/registro?motivo=favorito&volver=${encodeURIComponent(datos.data.volver)}` };
  if (!(await sesionVerificada())) return { ok: false, ir: `/seguridad/verificar?volver=${encodeURIComponent(datos.data.volver)}` };
  const supabase = await crearClienteServidor();
  const { error } =
    datos.data.guardar === "si"
      ? await supabase.from("favoritos").upsert({ lote_id: datos.data.loteId }, { onConflict: "usuario_id,lote_id", ignoreDuplicates: true })
      : await supabase.from("favoritos").delete().eq("lote_id", datos.data.loteId);
  if (error) return { ok: false, error: mensajeParaUsuario(error.message) };
  // Sin revalidatePath: haría redibujar la página actual (y en "Para vos" las tarjetas
  // se reacomodan). La lista de Favoritos se arma en el momento, no hace falta.
  return { ok: true };
}
