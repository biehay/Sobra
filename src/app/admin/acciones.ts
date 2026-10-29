"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { crearClienteServidor } from "@/lib/supabase/server";
import { mensajeParaUsuario } from "@/lib/errores";
import { exigirRol } from "@/lib/sesion";
import { notificar } from "@/lib/email/notificar";

function volver(tipo: "ok" | "error", mensaje: string): never {
  revalidatePath("/admin");
  revalidatePath("/lotes");
  redirect(`/admin?${tipo}=${encodeURIComponent(tipo === "error" ? mensajeParaUsuario(mensaje) : mensaje)}`);
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
    const peso = Number(formData.get("peso_kg"));
    if (!(peso > 0)) volver("error", "Confirmá el peso aproximado del lote: se usa para el impacto ambiental");
    const { error } = await supabase
      .from("lotes")
      .update({
        estado: "publicado",
        precio_publicado: precio,
        peso_kg: peso,
        precio_sugerido: sugerido > 0 ? sugerido : null,
        nota_admin: null,
      })
      .eq("id", id);
    if (error) volver("error", error.message);
    notificar.loteRevisado(id);
    notificar.bajaDePrecio(id);
    notificar.coincidencias(id);
    volver("ok", "Lote publicado.");
  }

  const nota = String(formData.get("nota") ?? "").trim();
  if (!nota) volver("error", "Escribí qué tiene que corregir el vendedor");
  const { error } = await supabase.from("lotes").update({ estado: "rechazado", nota_admin: nota }).eq("id", id);
  if (error) volver("error", error.message);
  notificar.loteRevisado(id);
  volver("ok", "Lote devuelto al vendedor con observaciones.");
}

export async function verificarUsuario(formData: FormData) {
  await exigirRol("admin");
  const id = String(formData.get("id"));
  const verificado = formData.get("verificado") === "si";
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from("perfiles").update({ verificado }).eq("id", id).select("rol").single();
  if (error) volver("error", error.message);
  if (verificado && data.rol === "usuario") notificar.compradorVerificado(id);
  volver("ok", "Usuario actualizado.");
}

export async function resolverReclamo(formData: FormData) {
  await exigirRol("admin");
  const id = String(formData.get("id"));
  const resultado = String(formData.get("resultado"));
  if (!["devolver", "completar", "sin_cambios"].includes(resultado)) volver("error", "Acción inválida");
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("resolver_reclamo", {
    p_reclamo: id,
    p_resultado: resultado,
    p_resolucion: String(formData.get("resolucion") ?? ""),
  });
  if (error) volver("error", error.message);
  notificar.reclamoResuelto(id);
  volver(
    "ok",
    resultado === "devolver"
      ? "Reclamo resuelto. Recordá devolverle el pago al comprador."
      : "Reclamo resuelto.",
  );
}

const OPERACIONES = {
  pago: { rpc: "confirmar_pago", ok: "Pago confirmado. Comprador y vendedor ya ven los datos de retiro.", aviso: notificar.pagoConfirmado },
  completar: { rpc: "completar_operacion", ok: "Operación completada. Recordá liquidarle al vendedor.", aviso: notificar.retiroConfirmado },
  cancelar: { rpc: "cancelar_oferta", ok: "Operación cancelada y lote republicado.", aviso: notificar.compraCancelada },
} as const;

export async function avanzarOperacion(formData: FormData) {
  await exigirRol("admin");
  const paso = OPERACIONES[formData.get("paso") as keyof typeof OPERACIONES];
  if (!paso) volver("error", "Acción inválida");
  const supabase = await crearClienteServidor();
  const ofertaId = String(formData.get("id"));
  const { error } = await supabase.rpc(paso.rpc, { p_oferta: ofertaId });
  if (error) volver("error", error.message);
  paso.aviso(ofertaId);
  volver("ok", paso.ok);
}

// Comprobantes de la transferencia al vendedor: PDF o imagen de hasta 5 MB, en
// el bucket privado "comprobantes", dentro de la carpeta del vendedor.
const TIPOS_COMPROBANTE: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const MAX_COMPROBANTE = 5 * 1024 * 1024;

async function subirComprobante(supabase: Awaited<ReturnType<typeof crearClienteServidor>>, ofertaId: string, archivo: FormDataEntryValue | null) {
  if (!(archivo instanceof File) || archivo.size === 0) return null;
  const extension = TIPOS_COMPROBANTE[archivo.type];
  if (!extension) volver("error", "El comprobante tiene que ser un PDF o una imagen (JPG, PNG o WEBP)");
  if (archivo.size > MAX_COMPROBANTE) volver("error", "El comprobante puede pesar hasta 5 MB");
  const { data, error } = await supabase.from("ofertas").select("lotes(vendedor_id)").eq("id", ofertaId).single();
  if (error) volver("error", error.message);
  const vendedorId = (data.lotes as unknown as { vendedor_id: string }).vendedor_id;
  const ruta = `${vendedorId}/${ofertaId}-${randomUUID()}.${extension}`;
  const { error: errorSubida } = await supabase.storage.from("comprobantes").upload(ruta, archivo, { contentType: archivo.type });
  if (errorSubida) volver("error", `No se pudo subir el comprobante: ${errorSubida.message}`);
  return ruta;
}

export async function liquidar(formData: FormData) {
  await exigirRol("admin");
  const ofertaId = String(formData.get("id"));
  const supabase = await crearClienteServidor();
  const comprobante = await subirComprobante(supabase, ofertaId, formData.get("comprobante"));
  const { error } = await supabase.rpc("marcar_liquidada", { p_oferta: ofertaId, p_comprobante: comprobante });
  if (error) {
    if (comprobante) await supabase.storage.from("comprobantes").remove([comprobante]);
    volver("error", error.message);
  }
  notificar.liquidada(ofertaId);
  volver("ok", comprobante ? "Transferencia registrada con su comprobante." : "Transferencia registrada. Podés sumar el comprobante después.");
}

export async function adjuntarComprobante(formData: FormData) {
  await exigirRol("admin");
  const ofertaId = String(formData.get("id"));
  const supabase = await crearClienteServidor();
  const comprobante = await subirComprobante(supabase, ofertaId, formData.get("comprobante"));
  if (!comprobante) volver("error", "Elegí el archivo del comprobante");
  const { error } = await supabase.rpc("adjuntar_comprobante", { p_oferta: ofertaId, p_comprobante: comprobante });
  if (error) {
    await supabase.storage.from("comprobantes").remove([comprobante]);
    volver("error", error.message);
  }
  volver("ok", "Comprobante agregado. El vendedor ya lo ve en Cobros.");
}
