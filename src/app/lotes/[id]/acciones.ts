"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { crearClienteServidor } from "@/lib/supabase/server";
import { obtenerPerfil } from "@/lib/sesion";

const esquemaOferta = z.object({
  loteId: z.uuid(),
  monto: z.coerce.number().positive("Ingresá un monto válido"),
  mensaje: z.string().max(500).default(""),
  retiro: z.enum(["retira_comprador", "flete_sobra"]),
});

export async function ofertar(formData: FormData) {
  const datos = esquemaOferta.safeParse(Object.fromEntries(formData));
  const loteId = String(formData.get("loteId") ?? "");
  if (!datos.success) {
    redirect(`/lotes/${loteId}?error=${encodeURIComponent(datos.error.issues[0].message)}`);
  }

  const perfil = await obtenerPerfil();
  if (!perfil) redirect(`/ingresar?volver=/lotes/${loteId}`);

  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("ofertas").insert({
    lote_id: datos.data.loteId,
    comprador_id: perfil.id,
    monto: datos.data.monto,
    mensaje: datos.data.mensaje,
    retiro: datos.data.retiro,
  });

  if (error) {
    const mensaje = error.code === "23505" ? "Ya tenés una oferta pendiente para este lote" : error.message;
    redirect(`/lotes/${loteId}?error=${encodeURIComponent(mensaje)}`);
  }

  revalidatePath("/panel/comprador");
  redirect(`/lotes/${loteId}?ok=${encodeURIComponent("¡Oferta enviada! Te avisamos cuando el vendedor responda.")}`);
}
