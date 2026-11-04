"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { guardarReporte, quienReporta } from "@/lib/precios-reportados";
import { cantidadPrincipal } from "@/lib/precio-comparables";
import { z } from "zod";
import { crearClienteServidor } from "@/lib/supabase/server";
import { mensajeParaUsuario } from "@/lib/errores";
import { exigirRol } from "@/lib/sesion";
import { CATEGORIAS, CONDICIONES, ZONAS, normalizarTelefono, cuitValido, formatearCuit, type Condicion } from "@/lib/datos";
import { detallesPara } from "@/lib/depreciacion";
import { notificar } from "@/lib/email/notificar";
import { asegurarFichaPorId } from "@/lib/recomendaciones/fichas";
import { moderarLote } from "@/lib/moderacion";
import { crearClienteAdmin } from "@/lib/supabase/admin";

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
  marca: z.string().trim().max(60).optional(),
});

const esquemaLote = z.object({
  titulo: z.string().trim().min(5, "El título debe tener al menos 5 caracteres").max(120),
  descripcion: z.string().trim().max(3000).default(""),
  categoria: z.enum(CATEGORIAS, "Elegí una categoría"),
  condicion: z.enum(Object.keys(CONDICIONES) as [Condicion, ...Condicion[]], "Elegí el estado del material"),
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
  detalles: z.preprocess(json, z.array(z.string()).max(10)).default([]),
  direccion: z.string().trim().max(200).default(""),
  horarios: z.string().trim().max(200).default(""),
  indicaciones: z.string().trim().max(500).default(""),
});

// Por qué un lote no se publicó al instante (lo que devuelve publicar_automatico).
// Por qué un lote queda en revisión manual, contado al vendedor. Lo que encontró
// el moderador (por ejemplo, posible material robado) no se le cuenta: lo mira el admin.
const MOTIVOS_REVISION: Record<string, string> = {
  sin_peso: "para publicarlo al instante, cargá el peso aproximado",
  contacto: "tiene datos de contacto en el texto: los compartimos recién cuando el comprador paga",
  precio: "el precio es mayor al precio de lista",
  primera_publicacion: "es tu primera publicación: la revisamos nosotros",
};

export async function guardarLote(formData: FormData) {
  const perfil = await exigirRol("usuario");
  const id = String(formData.get("id") ?? "");
  const enviar = formData.get("intencion") === "revision";
  const rutaForm = id ? `${PANEL_VENDEDOR}/lotes/${id}` : `${PANEL_VENDEDOR}/lotes/nuevo`;

  const datos = esquemaLote.safeParse(Object.fromEntries(formData));
  if (!datos.success) volverCon(rutaForm, "error", datos.error.issues[0].message);

  const { direccion, horarios, indicaciones, precio_minimo, ...lote } = datos.data;
  // Solo los detalles que corresponden a la categoría elegida.
  const validos = new Set(detallesPara(lote.categoria).map((d) => d.id));
  lote.detalles = lote.detalles.filter((d) => validos.has(d));
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

  // Moderación: reglas fijas + IA revisan el lote, y la base aplica la decisión con
  // sus propios controles (solo el servidor puede llamarla). Aprobado: se publica al
  // instante. Dudoso: revisión manual. Rechazado: vuelve al vendedor explicando por qué.
  let aplicado = "";
  let motivoRechazo = "";
  if (pasoARevision) {
    const moderacion = await moderarLote(lote, lote.fotos);
    const admin = crearClienteAdmin();
    const { data, error } = admin
      ? await admin.rpc("moderar_lote", { p_lote: loteId, p_resultado: moderacion.resultado, p_motivos: moderacion.motivos, p_mensaje: moderacion.mensaje })
      : { data: null, error: { message: "Falta SUPABASE_SERVICE_ROLE_KEY en el servidor" } };
    if (error) console.error("[Sobrá] No se pudo aplicar la moderación; queda en revisión manual:", error.message);
    aplicado = error ? "error" : String(data);
    motivoRechazo = moderacion.mensaje;
  }
  const publicadoAlInstante = aplicado === "publicado";
  const motivoRevision = MOTIVOS_REVISION[aplicado] ?? "";
  if (aplicado === "rechazado") {
    notificar.loteRevisado(loteId);
    revalidatePath(PANEL_VENDEDOR);
    volverCon(PANEL_VENDEDOR, "error", `No pudimos publicar tu lote: ${motivoRechazo || "no cumple las reglas de publicación"}. Si creés que es un error, escribinos.`);
  }
  if (publicadoAlInstante) {
    notificar.loteRevisado(loteId);
    notificar.publicadoAutomatico(loteId);
    notificar.bajaDePrecio(loteId);
    notificar.coincidencias(loteId);
    after(() => asegurarFichaPorId(loteId, true));
  } else if (pasoARevision) {
    notificar.loteEnRevision(loteId);
  }
  // El precio de lista que cargó el vendedor queda de referencia (sin sus datos) para
  // tasar el mismo producto la próxima vez. Solo al enviarlo, no en borradores.
  const principal = cantidadPrincipal(lote.titulo, lote.items);
  if (enviar && lote.precio_lista && principal) {
    const unico = lote.items.length === 1 ? lote.items[0] : null;
    after(() =>
      guardarReporte({
        texto: unico?.nombre ?? lote.titulo,
        marca: lote.items.find((i) => i.marca)?.marca,
        cantidad: principal.cantidad,
        unidad: principal.unidad,
        precioTotalArs: lote.precio_lista!,
        quien: quienReporta(perfil.id),
        origen: "publicacion",
      }),
    );
  }
  revalidatePath(PANEL_VENDEDOR);
  volverCon(
    PANEL_VENDEDOR,
    "ok",
    publicadoAlInstante
      ? "¡Listo! Tu lote ya está publicado."
      : enviar
        ? `Lote enviado a revisión${motivoRevision ? ` (${motivoRevision})` : ""}. Te avisamos cuando esté publicado.`
        : "Borrador guardado.",
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
