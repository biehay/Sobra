"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { crearClienteServidor } from "@/lib/supabase/server";
import { mensajeParaUsuario } from "@/lib/errores";
import { obtenerPerfil } from "@/lib/sesion";
import { notificar } from "@/lib/email/notificar";
import { MOTIVOS_DENUNCIA, type MotivoDenuncia } from "@/lib/denuncias";

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
    redirect(`/lotes/${loteId}?error=${encodeURIComponent(datos.error.issues[0].message)}#aviso`);
  }

  const perfil = await obtenerPerfil();
  if (!perfil) redirect(`/ingresar?volver=/lotes/${loteId}`);

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from("ofertas").insert({
    lote_id: datos.data.loteId,
    comprador_id: perfil.id,
    monto: datos.data.monto,
    mensaje: datos.data.mensaje,
    retiro: datos.data.retiro,
  }).select("id").single();

  if (error) {
    const mensaje = error.code === "23505" ? "Ya tenés una oferta pendiente para este lote" : error.message;
    redirect(`/lotes/${loteId}?error=${encodeURIComponent(mensajeParaUsuario(mensaje))}#aviso`);
  }

  notificar.nuevaOferta(data.id);
  revalidatePath("/panel/comprador");
  // #aviso: en el celular la pantalla queda en el mensaje, no arriba de todo en las fotos.
  redirect(`/lotes/${loteId}?ok=${encodeURIComponent("¡Oferta enviada! Te avisamos cuando el vendedor responda.")}#aviso`);
}

const esquemaDenuncia = z.object({
  loteId: z.uuid(),
  motivo: z.enum(Object.keys(MOTIVOS_DENUNCIA) as [MotivoDenuncia, ...MotivoDenuncia[]], "Elegí el motivo de la denuncia"),
  detalle: z.string().trim().max(500, "Contalo en menos de 500 caracteres").default(""),
});

// Denunciar una publicación. La base registra una denuncia por persona y lote, y
// con varias personas lo pausa sola hasta que lo revise el admin.
export async function denunciar(formData: FormData) {
  const loteId = String(formData.get("loteId") ?? "");
  const volver = (tipo: "ok" | "error", mensaje: string): never =>
    redirect(`/lotes/${loteId}?${tipo}=${encodeURIComponent(mensaje)}${tipo === "ok" ? "#denunciar" : "#aviso"}`);
  const datos = esquemaDenuncia.safeParse(Object.fromEntries(formData));
  if (!datos.success) return volver("error", datos.error.issues[0].message);
  const perfil = await obtenerPerfil();
  if (!perfil) redirect(`/ingresar?volver=/lotes/${loteId}`);

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("denunciar_lote", { p_lote: loteId, p_motivo: datos.data.motivo, p_detalle: datos.data.detalle });
  if (error) volver("error", mensajeParaUsuario(error.message));
  if (data === "ya_denunciada") volver("ok", "Ya habías denunciado esta publicación. La estamos revisando.");
  const resultado = data === "pausado" || data === "baja" ? data : "denunciada";
  notificar.denuncia(loteId, MOTIVOS_DENUNCIA[datos.data.motivo], resultado);
  if (resultado === "baja") notificar.loteDadoDeBaja(loteId);
  if (resultado !== "denunciada") revalidatePath("/lotes");
  volver("ok", "Gracias por avisarnos. Vamos a revisar la publicación; quien la publicó no sabe quién la denunció.");
}
