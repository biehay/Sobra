import { pesos } from "@/lib/datos";
import type { Resumen } from "@/lib/resumen-semanal";

// Plantillas de los emails de aviso. Devuelven asunto y HTML; los textos que
// vienen de los usuarios (títulos, observaciones) se escapan.

type Plantilla = { asunto: string; html: string };

function escapar(texto: string) {
  return texto.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function urlSitio(ruta = "/") {
  return `${(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "")}${ruta}`;
}

function plantilla({ titulo, parrafos, boton }: { titulo: string; parrafos: string[]; boton?: { texto: string; ruta: string } }) {
  const cuerpo = parrafos.map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#44403c">${p}</p>`).join("");
  const accion = boton
    ? `<p style="margin:24px 0 8px"><a href="${urlSitio(boton.ruta)}" style="display:inline-block;background:#e10600;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:8px">${boton.texto}</a></p>`
    : "";
  return `<!doctype html><html lang="es"><body style="margin:0;background:#fafaf9;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fafaf9;padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e7e5e4;border-radius:12px">
<tr><td style="padding:28px 32px 8px;font-size:22px;font-weight:800;color:#062a3a">Sobr<span style="color:#e10600">á</span></td></tr>
<tr><td style="padding:8px 32px 28px">
<h1 style="margin:0 0 16px;font-size:20px;color:#062a3a">${titulo}</h1>${cuerpo}${accion}
</td></tr></table>
<p style="margin:16px 0 0;font-size:12px;color:#a8a29e">Sobrá · Marketplace de sobrantes de obra del AMBA</p>
</td></tr></table></body></html>`;
}

export const plantillas = {
  codigoAcceso: (codigo: string): Plantilla => ({
    asunto: `Tu código de Sobrá: ${codigo}`,
    html: plantilla({
      titulo: "Tu código para ingresar",
      parrafos: [
        "Escribí este código en Sobrá para confirmar que sos vos:",
        `<span style="display:block;padding:16px;background:#e6f8fc;border-radius:8px;text-align:center;font-family:'Courier New',monospace;font-size:32px;font-weight:700;letter-spacing:8px;color:#062a3a">${escapar(codigo)}</span>`,
        "Vence en 10 minutos. Si no fuiste vos, ignorá este email y cambiá tu contraseña: alguien la está usando.",
      ],
    }),
  }),

  nuevaOferta: (lote: string, monto: number): Plantilla => ({
    asunto: `Nueva oferta por "${lote}"`,
    html: plantilla({
      titulo: "Recibiste una oferta",
      parrafos: [
        `Un comprador verificado ofreció <strong>${pesos(monto)}</strong> por tu lote <strong>${escapar(lote)}</strong>.`,
        "Entrá a tu panel para aceptarla o rechazarla. Mientras más rápido respondas, más chances de cerrar la venta.",
      ],
      boton: { texto: "Ver la oferta", ruta: "/panel/vendedor" },
    }),
  }),

  ofertaAceptada: (lote: string, monto: number): Plantilla => ({
    asunto: `¡Aceptaron tu oferta por "${lote}"!`,
    html: plantilla({
      titulo: "El vendedor aceptó tu oferta",
      parrafos: [
        `Tu oferta de <strong>${pesos(monto)}</strong> por <strong>${escapar(lote)}</strong> fue aceptada y el lote quedó reservado para vos.`,
        process.env.NEXT_PUBLIC_DATOS_TRANSFERENCIA
          ? `Para completar la compra transferí a: <strong>${escapar(process.env.NEXT_PUBLIC_DATOS_TRANSFERENCIA)}</strong>. Retenemos el dinero hasta que retirás el material.`
          : "Te escribimos por WhatsApp con los datos para transferir. Retenemos el dinero hasta que retirás el material.",
        "Cuando acreditemos el pago te mostramos la dirección de retiro y el contacto del vendedor.",
      ],
      boton: { texto: "Ver mi compra", ruta: "/panel/comprador" },
    }),
  }),

  ofertaRechazada: (lote: string): Plantilla => ({
    asunto: `Tu oferta por "${lote}" no fue aceptada`,
    html: plantilla({
      titulo: "Tu oferta no fue aceptada",
      parrafos: [
        `El vendedor no aceptó tu oferta por <strong>${escapar(lote)}</strong>, o el lote se reservó para otro comprador.`,
        "Hay más lotes publicados que te pueden servir.",
      ],
      boton: { texto: "Ver lotes disponibles", ruta: "/lotes" },
    }),
  }),

  ofertaCancelada: (lote: string): Plantilla => ({
    asunto: `Se canceló la compra de "${lote}"`,
    html: plantilla({
      titulo: "La compra se canceló",
      parrafos: [`La operación por <strong>${escapar(lote)}</strong> se canceló y el lote volvió a estar publicado.`],
      boton: { texto: "Ir a mi panel", ruta: "/panel/vendedor" },
    }),
  }),

  pagoConfirmadoComprador: (lote: string, codigo: string): Plantilla => ({
    asunto: `Pago acreditado: ya podés retirar "${lote}"`,
    html: plantilla({
      titulo: "Acreditamos tu pago",
      parrafos: [
        `Ya podés coordinar el retiro de <strong>${escapar(lote)}</strong>. En tu panel están la dirección, los horarios y el WhatsApp del vendedor.`,
        `Tu código de retiro es <strong style="font-family:'Courier New',monospace;font-size:20px;letter-spacing:3px">${escapar(codigo)}</strong>.`,
        "Revisá el material en el retiro y dale el código al vendedor <strong>solo si está todo bien</strong>: con ese código se completa la venta. Si algo no coincide, no se lo des y abrí un reclamo desde tu panel.",
      ],
      boton: { texto: "Ver datos de retiro", ruta: "/panel/comprador" },
    }),
  }),

  pagoConfirmadoVendedor: (lote: string, neto: number): Plantilla => ({
    asunto: `Vendiste "${lote}": coordiná el retiro`,
    html: plantilla({
      titulo: "El comprador ya pagó",
      parrafos: [
        `Acreditamos el pago por <strong>${escapar(lote)}</strong>. El comprador te va a contactar para retirarlo; en tu panel tenés sus datos.`,
        "En el retiro, el comprador revisa el material y te da un <strong>código de 6 dígitos</strong>. Cargalo en tu panel para completar la venta.",
        `Cuando confirmemos el retiro te transferimos <strong>${pesos(neto)}</strong> (monto menos la comisión de Sobrá).`,
      ],
      boton: { texto: "Ver datos del comprador", ruta: "/panel/vendedor" },
    }),
  }),

  retiroConfirmado: (lote: string, neto: number): Plantilla => ({
    asunto: `Retiro confirmado de "${lote}"`,
    html: plantilla({
      titulo: "Operación completada",
      parrafos: [
        `Confirmamos el retiro de <strong>${escapar(lote)}</strong>. Te transferimos <strong>${pesos(neto)}</strong> en los próximos días hábiles.`,
      ],
      boton: { texto: "Ir a mi panel", ruta: "/panel/vendedor" },
    }),
  }),

  compraCompletada: (lote: string): Plantilla => ({
    asunto: `Compra completada: "${lote}"`,
    html: plantilla({
      titulo: "¡Gracias por comprar en Sobrá!",
      parrafos: [
        `Se confirmó el retiro de <strong>${escapar(lote)}</strong> y la compra quedó completa.`,
        "Cada material que reutilizás es uno menos en la basura. Mirá si hay más lotes que te sirvan.",
      ],
      boton: { texto: "Ver lotes", ruta: "/lotes" },
    }),
  }),

  liquidada: (lote: string, neto: number): Plantilla => ({
    asunto: `Te transferimos ${pesos(neto)}`,
    html: plantilla({
      titulo: "Te transferimos el dinero",
      parrafos: [
        `Te transferimos <strong>${pesos(neto)}</strong> por la venta de <strong>${escapar(lote)}</strong>. ¡Gracias por vender en Sobrá!`,
        "El detalle y el comprobante de la transferencia quedan en <strong>Cobros</strong>, en tu panel.",
        "¿Te sobró algo más? Publicarlo es gratis.",
      ],
      boton: { texto: "Ver mis cobros", ruta: "/panel/cobros" },
    }),
  }),

  resumenSemanal: (nombre: string, r: Resumen, linkBaja: string): Plantilla => {
    const link = (l: { id: string; titulo: string; precio_publicado: number | null }) =>
      `<a href="${urlSitio(`/lotes/${l.id}`)}" style="color:#e10600;font-weight:600">${escapar(l.titulo)}</a>${l.precio_publicado ? ` · ${pesos(l.precio_publicado)}` : ""}`;
    const bloques: string[] = [];
    if (r.ofertasPorResponder) bloques.push(`<strong>Tenés ${r.ofertasPorResponder} ${r.ofertasPorResponder === 1 ? "oferta" : "ofertas"} para responder.</strong> No las dejes esperando: el comprador puede irse a otro lote.`);
    if (r.paraTusBusquedas.length) bloques.push(`<strong>Nuevo para lo que buscás:</strong><br>${r.paraTusBusquedas.map(link).join("<br>")}`);
    if (r.favoritosQueBajaron.length) bloques.push(`<strong>Bajaron de precio:</strong><br>${r.favoritosQueBajaron.map((l) => `${link(l)} <span style="text-decoration:line-through;color:#a8a29e">${pesos(l.antes)}</span>`).join("<br>")}`);
    if (r.visitasATusLotes) bloques.push(`Tus lotes tuvieron <strong>${r.visitasATusLotes} ${r.visitasATusLotes === 1 ? "visita" : "visitas"}</strong> esta semana.`);
    if (r.enTuZona.length) bloques.push(`<strong>Recién publicado en tu zona:</strong><br>${r.enTuZona.map(link).join("<br>")}`);
    return {
      asunto: r.ofertasPorResponder ? `Tenés ofertas para responder en Sobrá` : `Lo nuevo en Sobrá para vos, ${nombre}`,
      html: plantilla({
        titulo: `Hola, ${escapar(nombre)}: esto es lo nuevo de tu semana`,
        parrafos: [...bloques, `<span style="font-size:12px;color:#a8a29e">Te lo mandamos una vez por semana y solo si hay algo nuevo. <a href="${linkBaja}" style="color:#a8a29e">No quiero recibirlo más</a>.</span>`],
        boton: { texto: "Entrar a Sobrá", ruta: "/" },
      }),
    };
  },

  loteParaVos: (busqueda: string, lotes: { titulo: string; precio: number | null; id: string }[]): Plantilla => ({
    asunto: lotes.length === 1 ? `Apareció lo que buscabas: ${lotes[0].titulo}` : `Aparecieron ${lotes.length} lotes que buscabas`,
    html: plantilla({
      titulo: "Apareció lo que buscabas",
      parrafos: [
        `Se publicó en Sobrá un lote que coincide con tu búsqueda <strong>“${escapar(busqueda)}”</strong>:`,
        ...lotes.map((l) => `<a href="${urlSitio(`/lotes/${l.id}`)}" style="color:#e10600;font-weight:600">${escapar(l.titulo)}</a>${l.precio ? ` · ${pesos(l.precio)}` : ""}`),
        "Los sobrantes se venden rápido: si te sirve, ofertá cuanto antes.",
      ],
      boton: { texto: "Ver mis búsquedas", ruta: "/panel/busquedas" },
    }),
  }),

  bajaDePrecio: (lote: string, antes: number, ahora: number, loteId: string): Plantilla => ({
    asunto: `Bajó de precio: ${lote}`,
    html: plantilla({
      titulo: "Un lote que guardaste bajó de precio",
      parrafos: [
        `<strong>${escapar(lote)}</strong> pasó de <span style="text-decoration:line-through">${pesos(antes)}</span> a <strong>${pesos(ahora)}</strong>.`,
        "Si te interesa, ofertá antes de que lo reserve otro comprador.",
      ],
      boton: { texto: "Ver el lote", ruta: `/lotes/${loteId}` },
    }),
  }),

  lotePublicado: (lote: string, precio: number | null, loteId: string): Plantilla => ({
    asunto: `Tu lote "${lote}" ya está publicado`,
    html: plantilla({
      titulo: "Publicamos tu lote",
      parrafos: [
        `Revisamos <strong>${escapar(lote)}</strong> y ya está visible para los compradores${precio ? ` a <strong>${pesos(precio)}</strong>` : ""}.`,
        "Te avisamos por email cuando llegue una oferta.",
      ],
      boton: { texto: "Ver el lote", ruta: `/lotes/${loteId}` },
    }),
  }),

  loteObservado: (lote: string, nota: string, loteId: string): Plantilla => ({
    asunto: `Tu lote "${lote}" necesita cambios`,
    html: plantilla({
      titulo: "Revisamos tu lote",
      parrafos: [
        `Antes de publicar <strong>${escapar(lote)}</strong> necesitamos que corrijas lo siguiente:`,
        `<em>${escapar(nota)}</em>`,
        "Editalo y volvé a enviarlo a revisión.",
      ],
      boton: { texto: "Editar el lote", ruta: `/panel/vendedor/lotes/${loteId}` },
    }),
  }),

  compradorVerificado: (): Plantilla => ({
    asunto: "Tu cuenta está verificada: ya podés comprar",
    html: plantilla({
      titulo: "¡Ya podés ofertar!",
      parrafos: ["Verificamos tu cuenta. Ya podés hacer ofertas por los lotes publicados."],
      boton: { texto: "Ver lotes", ruta: "/lotes" },
    }),
  }),

  adminLoteEnRevision: (lote: string, vendedor: string): Plantilla => ({
    asunto: `[Admin] Lote para revisar: "${lote}"`,
    html: plantilla({
      titulo: "Hay un lote para revisar",
      parrafos: [`<strong>${escapar(vendedor)}</strong> envió <strong>${escapar(lote)}</strong> a revisión.`],
      boton: { texto: "Revisar", ruta: "/admin" },
    }),
  }),

  arrepentimientoRecibido: (nombre: string, codigo: string): Plantilla => ({
    asunto: `Recibimos tu pedido de arrepentimiento (${codigo})`,
    html: plantilla({
      titulo: "Recibimos tu pedido",
      parrafos: [
        `Hola, ${escapar(nombre)}. Recibimos tu pedido para revocar la compra.`,
        `Tu código de trámite es <strong>${escapar(codigo)}</strong>. Guardalo por cualquier consulta.`,
        "Te contactamos dentro de las 24 horas hábiles para coordinar la devolución del material y del dinero.",
      ],
    }),
  }),

  adminArrepentimiento: (codigo: string, nombre: string, email: string, telefono: string, operacion: string, detalle: string): Plantilla => ({
    asunto: `[Admin] Pedido de arrepentimiento ${codigo}`,
    html: plantilla({
      titulo: "Pedido de arrepentimiento",
      parrafos: [
        `Código: <strong>${escapar(codigo)}</strong>`,
        `${escapar(nombre)} · ${escapar(email)}${telefono ? ` · ${escapar(telefono)}` : ""}`,
        `Compra: ${escapar(operacion)}`,
        ...(detalle ? [`Comentarios: ${escapar(detalle)}`] : []),
        "La ley pide responder dentro de las 24 horas con el código de trámite (ya se lo mandamos) y coordinar la devolución.",
      ],
    }),
  }),

  adminNuevoUsuario: (nombre: string): Plantilla => ({
    asunto: `[Admin] Nuevo usuario: ${nombre}`,
    html: plantilla({
      titulo: "Se registró un usuario",
      parrafos: [
        `<strong>${escapar(nombre)}</strong> se registró. Ya puede publicar lotes; verificá su cuenta para que también pueda ofertar.`,
      ],
      boton: { texto: "Ver usuarios", ruta: "/admin" },
    }),
  }),

  reclamoAbiertoAdmin: (lote: string, quien: string, motivo: string, detalle: string): Plantilla => ({
    asunto: `[Admin] Reclamo abierto: "${lote}"`,
    html: plantilla({
      titulo: "Se abrió un reclamo",
      parrafos: [
        `El ${escapar(quien)} abrió un reclamo por <strong>${escapar(lote)}</strong>: ${escapar(motivo)}.`,
        `<em>${escapar(detalle)}</em>`,
        "La operación queda en pausa hasta que lo resuelvas.",
      ],
      boton: { texto: "Resolver", ruta: "/admin" },
    }),
  }),

  reclamoAbiertoContraparte: (lote: string, motivo: string, panel: string): Plantilla => ({
    asunto: `Hay un reclamo sobre "${lote}"`,
    html: plantilla({
      titulo: "Se abrió un reclamo sobre tu operación",
      parrafos: [
        `La otra parte reportó un problema con <strong>${escapar(lote)}</strong>: ${escapar(motivo)}.`,
        "Sobrá lo va a revisar y te va a contactar por WhatsApp. Mientras tanto la operación queda en pausa.",
      ],
      boton: { texto: "Ver la operación", ruta: panel },
    }),
  }),

  reclamoResuelto: (lote: string, resultado: string, resolucion: string, panel: string): Plantilla => ({
    asunto: `Resolvimos el reclamo sobre "${lote}"`,
    html: plantilla({
      titulo: "Reclamo resuelto",
      parrafos: [`<strong>${escapar(resultado)}.</strong>`, escapar(resolucion)],
      boton: { texto: "Ver la operación", ruta: panel },
    }),
  }),

  adminPagoInformado: (lote: string, monto: number): Plantilla => ({
    asunto: `[Admin] Oferta aceptada: esperar pago de ${pesos(monto)}`,
    html: plantilla({
      titulo: "Se aceptó una oferta",
      parrafos: [`El vendedor aceptó ${pesos(monto)} por <strong>${escapar(lote)}</strong>. Cuando acredite la transferencia, confirmá el pago.`],
      boton: { texto: "Ir al panel", ruta: "/admin" },
    }),
  }),
};
