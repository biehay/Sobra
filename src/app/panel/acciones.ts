"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { crearClienteServidor } from "@/lib/supabase/server";
import { exigirRol } from "@/lib/sesion";
import { CATEGORIAS, ZONAS } from "@/lib/datos";
import { notificar } from "@/lib/email/notificar";

const PANEL_VENDEDOR = "/panel/vendedor";
const PANEL_COMPRADOR = "/panel/comprador";

function volverCon(ruta: string, tipo: "ok" | "error", mensaje: string): never {
  redirect(`${ruta}?${tipo}=${encodeURIComponent(mensaje)}`);
}

// Lee un campo JSON del formulario; si no es JSON válido, la validación falla.
function json(valor: unknown) {
  try {
    return JSON.parse(String(valor || "[]"));
  } catch {
    return null;
  }
}

const esquemaItem = z.object({
  nombre: z.string().trim().min(1),
  cantidad: z.number().positive(),
  unidad: z.string().trim().max(20),
});

const esquemaLote = z.object({
  titulo: z.string().trim().min(5, "El título debe tener al menos 5 caracteres").max(120),
  descripcion: z.string().trim().max(3000).default(""),
  categoria: z.enum(CATEGORIAS, "Elegí una categoría"),
  condicion: z.enum(["nuevo", "sin_uso", "usado_buen_estado"], "Elegí el estado del material"),
  zona: z.enum(ZONAS, "Elegí la zona de retiro"),
  localidad: z.string().trim().max(80).default(""),
  precio_lista: z.preprocess(
    (v) => (v === "" || v == null ? null : Number(v)),
    z.number("Precio de lista inválido").positive("Precio de lista inválido").nullable(),
  ),
  precio_pedido: z.coerce.number().positive("Ingresá cuánto querés recuperar"),
  items: z.preprocess(json, z.array(esquemaItem).max(100)),
  fotos: z.preprocess(json, z.array(z.string()).max(10)),
  direccion: z.string().trim().max(200).default(""),
  horarios: z.string().trim().max(200).default(""),
  indicaciones: z.string().trim().max(500).default(""),
});

export async function guardarLote(formData: FormData) {
  const perfil = await exigirRol("vendedor");
  const id = String(formData.get("id") ?? "");
  const enviar = formData.get("intencion") === "revision";
  const rutaForm = id ? `${PANEL_VENDEDOR}/lotes/${id}` : `${PANEL_VENDEDOR}/lotes/nuevo`;

  const datos = esquemaLote.safeParse(Object.fromEntries(formData));
  if (!datos.success) volverCon(rutaForm, "error", datos.error.issues[0].message);

  const { direccion, horarios, indicaciones, ...lote } = datos.data;
  // Las fotos tienen que estar en la carpeta del vendedor (la base también lo exige al subirlas).
  if (lote.fotos.some((f) => !f.startsWith(`${perfil.id}/`))) volverCon(rutaForm, "error", "Foto inválida");
  if (enviar && lote.fotos.length === 0) volverCon(rutaForm, "error", "Subí al menos una foto para enviarlo a revisión");

  const supabase = await crearClienteServidor();
  let loteId = id;
  let pasoARevision = false;

  if (id) {
    const { data: actual } = await supabase.from("lotes").select("estado").eq("id", id).single();
    const cambios: Record<string, unknown> = { ...lote };
    if (enviar && actual && ["borrador", "rechazado", "pausado"].includes(actual.estado)) {
      cambios.estado = "en_revision";
    }
    // Editar un lote publicado también lo vuelve a revisión (lo decide la base).
    const { data, error } = await supabase.from("lotes").update(cambios).eq("id", id).select("estado").single();
    if (error) volverCon(rutaForm, "error", error.message);
    pasoARevision = data.estado === "en_revision" && actual?.estado !== "en_revision";
  } else {
    const { data, error } = await supabase
      .from("lotes")
      .insert({ ...lote, vendedor_id: perfil.id, estado: enviar ? "en_revision" : "borrador" })
      .select("id")
      .single();
    if (error) volverCon(rutaForm, "error", error.message);
    loteId = data.id;
    pasoARevision = enviar;
  }

  const { error: errorRetiro } = await supabase
    .from("lote_retiro")
    .upsert({ lote_id: loteId, direccion, horarios, indicaciones });
  if (errorRetiro) volverCon(rutaForm, "error", errorRetiro.message);

  if (pasoARevision) notificar.loteEnRevision(loteId);
  revalidatePath(PANEL_VENDEDOR);
  volverCon(
    PANEL_VENDEDOR,
    "ok",
    enviar ? "Lote enviado a revisión. Te avisamos cuando esté publicado." : "Borrador guardado.",
  );
}

export async function cambiarEstadoLote(formData: FormData) {
  await exigirRol("vendedor");
  const id = String(formData.get("id"));
  const estado = String(formData.get("estado"));
  const supabase = await crearClienteServidor();
  const { error } =
    estado === "eliminar"
      ? await supabase.from("lotes").delete().eq("id", id)
      : await supabase.from("lotes").update({ estado }).eq("id", id);
  if (error) volverCon(PANEL_VENDEDOR, "error", error.message);
  if (estado === "en_revision") notificar.loteEnRevision(id);
  revalidatePath(PANEL_VENDEDOR);
  revalidatePath("/lotes");
  volverCon(PANEL_VENDEDOR, "ok", "Lote actualizado.");
}

export async function responderOferta(formData: FormData) {
  await exigirRol("vendedor");
  const ofertaId = String(formData.get("id"));
  const aceptar = formData.get("aceptar") === "si";
  const supabase = await crearClienteServidor();

  // Al aceptar, la base rechaza las demás ofertas pendientes del lote: se
  // anotan antes para avisarles a esos compradores.
  let otrosCompradores: string[] = [];
  if (aceptar) {
    const { data: oferta } = await supabase.from("ofertas").select("lote_id").eq("id", ofertaId).single();
    const { data: otras } = await supabase
      .from("ofertas")
      .select("comprador_id")
      .eq("lote_id", oferta?.lote_id ?? "")
      .eq("estado", "pendiente")
      .neq("id", ofertaId);
    otrosCompradores = (otras ?? []).map((o) => o.comprador_id);
  }

  const { error } = await supabase.rpc("responder_oferta", { p_oferta: ofertaId, p_aceptar: aceptar });
  if (error) volverCon(PANEL_VENDEDOR, "error", error.message);
  notificar.ofertaRespondida(ofertaId, aceptar, otrosCompradores);
  revalidatePath(PANEL_VENDEDOR);
  revalidatePath("/lotes");
  volverCon(
    PANEL_VENDEDOR,
    "ok",
    aceptar ? "Oferta aceptada. Le pedimos el pago al comprador y te avisamos para coordinar el retiro." : "Oferta rechazada.",
  );
}

export async function cancelarOferta(formData: FormData) {
  await exigirRol("comprador");
  const ofertaId = String(formData.get("id"));
  const supabase = await crearClienteServidor();
  const { data: oferta } = await supabase.from("ofertas").select("estado").eq("id", ofertaId).single();
  const { error } = await supabase.rpc("cancelar_oferta", { p_oferta: ofertaId });
  if (error) volverCon(PANEL_COMPRADOR, "error", error.message);
  // Si ya estaba aceptada, el lote estaba reservado: hay que avisarle al vendedor.
  if (oferta?.estado === "aceptada") notificar.compraCancelada(ofertaId);
  revalidatePath(PANEL_COMPRADOR);
  volverCon(PANEL_COMPRADOR, "ok", "Oferta cancelada.");
}

const esquemaPerfil = z.object({
  nombre: z.string().trim().min(2, "Ingresá tu nombre"),
  empresa: z.string().trim().max(120).default(""),
  cuit: z.string().trim().max(20).default(""),
  telefono: z.string().trim().min(8, "Ingresá un teléfono de WhatsApp válido"),
  zona: z.enum(ZONAS, "Elegí tu zona"),
});

export async function actualizarPerfil(formData: FormData) {
  const perfil = await exigirRol("vendedor", "comprador", "admin");
  const datos = esquemaPerfil.safeParse(Object.fromEntries(formData));
  if (!datos.success) volverCon("/panel/perfil", "error", datos.error.issues[0].message);
  if (perfil.rol === "vendedor" && !datos.data.empresa) volverCon("/panel/perfil", "error", "Ingresá el nombre de la empresa");

  const supabase = await crearClienteServidor();
  const { error } = await supabase
    .from("perfiles")
    .update({ ...datos.data, empresa: datos.data.empresa || null, cuit: datos.data.cuit || null })
    .eq("id", perfil.id);
  if (error) volverCon("/panel/perfil", "error", error.message);
  revalidatePath("/", "layout");
  volverCon("/panel/perfil", "ok", "Datos actualizados.");
}
