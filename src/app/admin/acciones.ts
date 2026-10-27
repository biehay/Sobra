"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { crearClienteServidor } from "@/lib/supabase/server";
import { exigirRol } from "@/lib/sesion";

function volver(tipo: "ok" | "error", mensaje: string): never {
  revalidatePath("/admin");
  revalidatePath("/lotes");
  redirect(`/admin?${tipo}=${encodeURIComponent(mensaje)}`);
}

export async function revisarLote(formData: FormData) {
  await exigirRol("admin");
  const id = String(formData.get("id"));
  const aprobar = formData.get("decision") === "aprobar";
  const supabase = await crearClienteServidor();

  if (aprobar) {
    const precio = Number(formData.get("precio_publicado"));
    if (!(precio > 0)) volver("error", "Ingresá el precio de publicación");
    const sugerido = Number(formData.get("precio_sugerido"));
    const { error } = await supabase
      .from("lotes")
      .update({
        estado: "publicado",
        precio_publicado: precio,
        precio_sugerido: sugerido > 0 ? sugerido : null,
        nota_admin: null,
      })
      .eq("id", id);
    if (error) volver("error", error.message);
    volver("ok", "Lote publicado.");
  }

  const nota = String(formData.get("nota") ?? "").trim();
  if (!nota) volver("error", "Escribí qué tiene que corregir el vendedor");
  const { error } = await supabase.from("lotes").update({ estado: "rechazado", nota_admin: nota }).eq("id", id);
  if (error) volver("error", error.message);
  volver("ok", "Lote devuelto al vendedor con observaciones.");
}

export async function verificarUsuario(formData: FormData) {
  await exigirRol("admin");
  const supabase = await crearClienteServidor();
  const { error } = await supabase
    .from("perfiles")
    .update({ verificado: formData.get("verificado") === "si" })
    .eq("id", String(formData.get("id")));
  if (error) volver("error", error.message);
  volver("ok", "Usuario actualizado.");
}

const OPERACIONES = {
  pago: { rpc: "confirmar_pago", ok: "Pago confirmado. Comprador y vendedor ya ven los datos de retiro." },
  completar: { rpc: "completar_operacion", ok: "Operación completada. Recordá liquidarle al vendedor." },
  cancelar: { rpc: "cancelar_oferta", ok: "Operación cancelada y lote republicado." },
  liquidar: { rpc: "marcar_liquidada", ok: "Liquidación al vendedor registrada." },
} as const;

export async function avanzarOperacion(formData: FormData) {
  await exigirRol("admin");
  const paso = OPERACIONES[formData.get("paso") as keyof typeof OPERACIONES];
  if (!paso) volver("error", "Acción inválida");
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc(paso.rpc, { p_oferta: String(formData.get("id")) });
  if (error) volver("error", error.message);
  volver("ok", paso.ok);
}
