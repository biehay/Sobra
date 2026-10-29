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
  if (!perfil) redirect(`/ingresar?volver=${encodeURIComponent(volver)}`);
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
