"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { crearClienteServidor } from "@/lib/supabase/server";
import { mensajeParaUsuario } from "@/lib/errores";
import { obtenerPerfil, sesionVerificada } from "@/lib/sesion";
import { CATEGORIAS, ZONAS } from "@/lib/datos";

const RUTA = "/panel/busquedas";

const vacioANull = (v: unknown) => (v === "" || v == null ? null : v);
const esquema = z.object({
  texto: z.string().trim().min(3, "Contanos qué buscás (al menos 3 letras)").max(80, "Usá hasta 80 caracteres"),
  categoria: z.preprocess(vacioANull, z.enum(CATEGORIAS).nullable()),
  zona: z.preprocess(vacioANull, z.enum(ZONAS).nullable()),
  precio_max: z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number("Precio inválido").positive("Precio inválido").nullable()),
});

function volver(tipo: "ok" | "error", mensaje: string): never {
  revalidatePath(RUTA);
  redirect(`${RUTA}?${tipo}=${encodeURIComponent(tipo === "error" ? mensajeParaUsuario(mensaje) : mensaje)}`);
}

async function exigirSesion() {
  if (!(await obtenerPerfil())) redirect(`/ingresar?volver=${RUTA}`);
  if (!(await sesionVerificada())) redirect(`/seguridad/verificar?volver=${RUTA}`);
}

export async function crearBusqueda(formData: FormData) {
  await exigirSesion();
  const datos = esquema.safeParse(Object.fromEntries(formData));
  if (!datos.success) volver("error", datos.error.issues[0].message);
  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("busquedas").insert(datos.data);
  if (error) volver("error", error.message);
  volver("ok", "Listo: te avisamos por email cuando se publique un lote que coincida.");
}

export async function cambiarBusqueda(formData: FormData) {
  await exigirSesion();
  const id = String(formData.get("id"));
  const accion = String(formData.get("accion"));
  const supabase = await crearClienteServidor();
  const { error } =
    accion === "borrar"
      ? await supabase.from("busquedas").delete().eq("id", id)
      : await supabase.from("busquedas").update({ activa: accion === "reactivar" }).eq("id", id);
  if (error) volver("error", error.message);
  volver("ok", accion === "borrar" ? "Búsqueda borrada." : accion === "reactivar" ? "Búsqueda reactivada." : "Búsqueda pausada: no te vamos a avisar hasta que la reactives.");
}
