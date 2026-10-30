"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { crearClienteServidor } from "@/lib/supabase/server";
import { mensajeParaUsuario } from "@/lib/errores";
import { exigirRol } from "@/lib/sesion";
import { CATEGORIAS, ZONAS, normalizarTelefono, cuitValido, formatearCuit } from "@/lib/datos";
import { notificar } from "@/lib/email/notificar";

const PANEL_VENDEDOR = "/panel/vendedor";
const PANEL_COMPRADOR = "/panel/comprador";

function volverCon(ruta: string, tipo: "ok" | "error", mensaje: string): never {
  redirect(`${ruta}?${tipo}=${encodeURIComponent(tipo === "error" ? mensajeParaUsuario(mensaje) : mensaje)}`);
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
  peso_kg: z.preprocess(
    (v) => (v === "" || v == null ? null : Number(v)),
    z.number("Peso inválido").positive("Peso inválido").max(1_000_000, "Revisá el peso").nullable(),
  ),
  baja_semanal_pct: z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().min(1).max(20).nullable()),
  precio_minimo: z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number("Precio mínimo inválido").positive("Precio mínimo inválido").nullable()),
  items: z.preprocess(json, z.array(esquemaItem).max(100)),
  fotos: z.preprocess(json, z.array(z.string()).max(10)),
  direccion: z.string().trim().max(200).default(""),
  horarios: z.string().trim().max(200).default(""),
  indicaciones: z.string().trim().max(500).default(""),
});

export async function guardarLote(formData: FormData) {
  const perfil = await exigirRol("usuario");
  const id = String(formData.get("id") ?? "");
  const enviar = formData.get("intencion") === "revision";
  const rutaForm = id ? `${PANEL_VENDEDOR}/lotes/${id}` : `${PANEL_VENDEDOR}/lotes/nuevo`;

  const datos = esquemaLote.safeParse(Object.fromEntries(formData));
  if (!datos.success) volverCon(rutaForm, "error", datos.error.issues[0].message);

  const { direccion, horarios, indicaciones, precio_minimo, ...lote } = datos.data;
  // Baja automática: van juntos o ninguno, y el mínimo tiene que ser menor al precio.
  if (lote.baja_semanal_pct == null || precio_minimo == null) {
    lote.baja_semanal_pct = null;
  } else if (precio_minimo >= lote.precio_pedido) {
    volverCon(rutaForm, "error", "El precio mínimo tiene que ser menor a lo que querés recuperar");
  }
  // Las fotos tienen que estar en la carpeta del vendedor (la base también lo exige al subirlas).
  if (lote.fotos.some((f) => !f.startsWith(`${perfil.id}/`))) volverCon(rutaForm, "error", "Foto inválida");
  if (enviar && lote.fotos.length === 0) volverCon(rutaForm, "error", "Subí al menos una foto para enviarlo a revisión");
  if (enviar && !direccion) volverCon(rutaForm, "error", "Completá la dirección de retiro: el comprador la necesita después de pagar");

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

  // El precio mínimo va aparte, en una tabla que solo ven el vendedor y el admin.
  const { error: errorMinimo } =
    lote.baja_semanal_pct != null && precio_minimo != null
      ? await supabase.from("lote_precio_minimo").upsert({ lote_id: loteId, precio_minimo })
      : await supabase.from("lote_precio_minimo").delete().eq("lote_id", loteId);
  if (errorMinimo) volverCon(rutaForm, "error", errorMinimo.message);

  if (pasoARevision) notificar.loteEnRevision(loteId);
  revalidatePath(PANEL_VENDEDOR);
  volverCon(
    PANEL_VENDEDOR,
    "ok",
    enviar ? "Lote enviado a revisión. Te avisamos cuando esté publicado." : "Borrador guardado.",
  );
}

export async function cambiarEstadoLote(formData: FormData) {
  await exigirRol("usuario");
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
  await exigirRol("usuario");
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
  await exigirRol("usuario");
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
  cuit: z
    .string()
    .trim()
    .default("")
    .refine((c) => c === "" || cuitValido(c), "Revisá el CUIT: el último número no coincide")
    .transform((c) => (c ? formatearCuit(c) : "")),
  telefono: z
    .string()
    .trim()
    .refine((t) => normalizarTelefono(t) !== null, "Ingresá un celular con código de área, por ejemplo 11 2345 6789"),
  zona: z.enum(ZONAS, "Elegí tu zona"),
});

export async function actualizarPerfil(formData: FormData) {
  const perfil = await exigirRol("usuario", "admin");
  const datos = esquemaPerfil.safeParse(Object.fromEntries(formData));
  if (!datos.success) volverCon("/panel/perfil", "error", datos.error.issues[0].message);

  const supabase = await crearClienteServidor();
  const { error } = await supabase
    .from("perfiles")
    .update({ ...datos.data, empresa: datos.data.empresa || null, cuit: datos.data.cuit || null })
    .eq("id", perfil.id);
  if (error) volverCon("/panel/perfil", "error", error.message);
  revalidatePath("/", "layout");
  volverCon("/panel/perfil", "ok", "Datos actualizados.");
}

export async function confirmarRetiro(formData: FormData) {
  await exigirRol("usuario");
  const ofertaId = String(formData.get("id"));
  const supabase = await crearClienteServidor();
  const { data: correcto, error } = await supabase.rpc("confirmar_retiro", {
    p_oferta: ofertaId,
    p_codigo: String(formData.get("codigo") ?? ""),
  });
  if (error) volverCon(PANEL_VENDEDOR, "error", error.message);
  if (!correcto) {
    volverCon(PANEL_VENDEDOR, "error", "El código no es correcto. Pedile al comprador que lo revise en su panel de Sobrá.");
  }
  notificar.retiroConfirmado(ofertaId);
  revalidatePath(PANEL_VENDEDOR);
  volverCon(PANEL_VENDEDOR, "ok", "¡Retiro confirmado! La venta quedó completa.");
}

const esquemaReclamo = z.object({
  oferta: z.uuid(),
  motivo: z.enum(["no_coincide", "no_se_presento", "otro"]),
  detalle: z.string().trim().min(10, "Contanos un poco más qué pasó (al menos 10 caracteres)").max(2000),
});

export async function abrirReclamo(formData: FormData) {
  await exigirRol("usuario");
  // Desde qué panel se abrió (solo decide a dónde volver; los permisos los controla la base).
  const panel = formData.get("desde") === "ventas" ? PANEL_VENDEDOR : PANEL_COMPRADOR;
  const datos = esquemaReclamo.safeParse(Object.fromEntries(formData));
  if (!datos.success) volverCon(panel, "error", datos.error.issues[0].message);

  const supabase = await crearClienteServidor();
  const { data: reclamoId, error } = await supabase.rpc("abrir_reclamo", {
    p_oferta: datos.data.oferta,
    p_motivo: datos.data.motivo,
    p_detalle: datos.data.detalle,
  });
  if (error) volverCon(panel, "error", error.message);
  notificar.reclamoAbierto(reclamoId as string);
  revalidatePath(panel);
  volverCon(panel, "ok", "Abrimos el reclamo. Te contactamos por WhatsApp para resolverlo.");
}
