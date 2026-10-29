"use server";

import { redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/server";
import { enviarCodigoAcceso } from "@/lib/codigo-acceso";
import { mensajeParaUsuario } from "@/lib/errores";

function rutaSegura(valor: FormDataEntryValue | null) {
  const ruta = typeof valor === "string" ? valor : "";
  return ruta.startsWith("/") && !ruta.startsWith("//") ? ruta : "/panel";
}

function pantalla(volver: string, tipo: "ok" | "error", mensaje: string): never {
  redirect(`/seguridad/verificar?volver=${encodeURIComponent(volver)}&${tipo}=${encodeURIComponent(mensaje)}`);
}

export async function pedirCodigo(formData: FormData) {
  const volver = rutaSegura(formData.get("volver"));
  const { error, soloEnTerminal } = await enviarCodigoAcceso();
  if (error) pantalla(volver, "error", error);
  if (soloEnTerminal) redirect(`/seguridad/verificar?volver=${encodeURIComponent(volver)}&envio=terminal`);
  pantalla(volver, "ok", "Te mandamos un código nuevo.");
}

export async function confirmarCodigo(formData: FormData) {
  const volver = rutaSegura(formData.get("volver"));
  const codigo = String(formData.get("codigo") ?? "").replace(/\D/g, "");
  if (codigo.length !== 6) pantalla(volver, "error", "Completá los 6 números del código");

  const supabase = await crearClienteServidor();
  const { data: correcto, error } = await supabase.rpc("verificar_codigo_acceso", { p_codigo: codigo });
  if (error) pantalla(volver, "error", mensajeParaUsuario(error.message));
  if (!correcto) pantalla(volver, "error", "El código no es correcto. Revisalo en el email que te mandamos.");
  redirect(volver);
}
