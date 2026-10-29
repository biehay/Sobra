"use server";

import { redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/server";
import { mensajeParaUsuario } from "@/lib/errores";
import { exigirRol } from "@/lib/sesion";

export async function emitirConstancia(formData: FormData) {
  await exigirRol("usuario");
  const anio = Number(formData.get("anio"));
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("emitir_constancia", { p_anio: anio });
  if (error) redirect(`/panel/impacto?error=${encodeURIComponent(mensajeParaUsuario(error.message))}`);
  redirect(`/constancia/${data}`);
}
