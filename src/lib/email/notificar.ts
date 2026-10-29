import "server-only";
import { after } from "next/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { enviarEmail } from "./enviar";
import { plantillas } from "./plantillas";
import { MOTIVOS_RECLAMO, RESULTADOS_RECLAMO, type MotivoReclamo, type ResultadoReclamo } from "@/lib/datos";

type Admin = NonNullable<ReturnType<typeof crearClienteAdmin>>;

// Manda los avisos después de responder, para no demorar al usuario. Si un
// email falla se registra en el log, pero la acción que lo originó ya se hizo.
function enSegundoPlano(nombre: string, tarea: (admin: Admin) => Promise<void>) {
  after(async () => {
    const admin = crearClienteAdmin();
    if (!admin) {
      console.info(`[aviso "${nombre}" sin enviar: falta SUPABASE_SERVICE_ROLE_KEY]`);
      return;
    }
    try {
      await tarea(admin);
    } catch (error) {
      console.error(`[aviso "${nombre}" falló]`, error);
    }
  });
}

async function emailDe(admin: Admin, usuarioId: string) {
  const { data } = await admin.auth.admin.getUserById(usuarioId);
  return data.user?.email ?? "";
}

function emailsAdmin() {
  return (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim()).filter(Boolean);
}

async function datosOferta(admin: Admin, ofertaId: string) {
  const { data, error } = await admin
    .from("ofertas")
    .select("monto, comision, comprador_id, lotes(titulo, vendedor_id)")
    .eq("id", ofertaId)
    .single();
  if (error) throw error;
  const lote = data.lotes as unknown as { titulo: string; vendedor_id: string };
  return {
    titulo: lote.titulo,
    vendedorId: lote.vendedor_id,
    compradorId: data.comprador_id as string,
    monto: Number(data.monto),
    neto: Number(data.monto) - Number(data.comision ?? 0),
  };
}

export const notificar = {
  nuevaOferta(ofertaId: string) {
    enSegundoPlano("nueva oferta", async (admin) => {
      const o = await datosOferta(admin, ofertaId);
      await enviarEmail({ para: await emailDe(admin, o.vendedorId), ...plantillas.nuevaOferta(o.titulo, o.monto) });
    });
  },

  // `compradoresRechazados`: al aceptar una oferta, la base rechaza las demás
  // pendientes del lote; la acción pasa sus compradores para avisarles.
  ofertaRespondida(ofertaId: string, aceptada: boolean, compradoresRechazados: string[] = []) {
    enSegundoPlano("oferta respondida", async (admin) => {
      const o = await datosOferta(admin, ofertaId);
      if (!aceptada) {
        await enviarEmail({ para: await emailDe(admin, o.compradorId), ...plantillas.ofertaRechazada(o.titulo) });
        return;
      }
      await enviarEmail({ para: await emailDe(admin, o.compradorId), ...plantillas.ofertaAceptada(o.titulo, o.monto) });
      await enviarEmail({ para: emailsAdmin(), ...plantillas.adminPagoInformado(o.titulo, o.monto) });
      for (const compradorId of compradoresRechazados) {
        await enviarEmail({ para: await emailDe(admin, compradorId), ...plantillas.ofertaRechazada(o.titulo) });
      }
    });
  },

  // Solo interesa avisarle al vendedor si la oferta ya estaba aceptada (el lote estaba reservado).
  compraCancelada(ofertaId: string) {
    enSegundoPlano("compra cancelada", async (admin) => {
      const o = await datosOferta(admin, ofertaId);
      await enviarEmail({ para: [await emailDe(admin, o.vendedorId), ...emailsAdmin()], ...plantillas.ofertaCancelada(o.titulo) });
    });
  },

  pagoConfirmado(ofertaId: string) {
    enSegundoPlano("pago confirmado", async (admin) => {
      const o = await datosOferta(admin, ofertaId);
      const { data: codigo } = await admin.from("codigos_retiro").select("codigo").eq("oferta_id", ofertaId).single();
      await enviarEmail({
        para: await emailDe(admin, o.compradorId),
        ...plantillas.pagoConfirmadoComprador(o.titulo, codigo?.codigo ?? "(lo ves en tu panel)"),
      });
      await enviarEmail({ para: await emailDe(admin, o.vendedorId), ...plantillas.pagoConfirmadoVendedor(o.titulo, o.neto) });
    });
  },

  retiroConfirmado(ofertaId: string) {
    enSegundoPlano("retiro confirmado", async (admin) => {
      const o = await datosOferta(admin, ofertaId);
      await enviarEmail({ para: await emailDe(admin, o.vendedorId), ...plantillas.retiroConfirmado(o.titulo, o.neto) });
      await enviarEmail({ para: await emailDe(admin, o.compradorId), ...plantillas.compraCompletada(o.titulo) });
    });
  },

  liquidada(ofertaId: string) {
    enSegundoPlano("liquidación", async (admin) => {
      const o = await datosOferta(admin, ofertaId);
      await enviarEmail({ para: await emailDe(admin, o.vendedorId), ...plantillas.liquidada(o.titulo, o.neto) });
    });
  },

  loteRevisado(loteId: string) {
    enSegundoPlano("lote revisado", async (admin) => {
      const { data: lote, error } = await admin
        .from("lotes")
        .select("titulo, vendedor_id, estado, precio_publicado, nota_admin")
        .eq("id", loteId)
        .single();
      if (error) throw error;
      const plantilla =
        lote.estado === "publicado"
          ? plantillas.lotePublicado(lote.titulo, lote.precio_publicado, loteId)
          : plantillas.loteObservado(lote.titulo, lote.nota_admin ?? "", loteId);
      await enviarEmail({ para: await emailDe(admin, lote.vendedor_id), ...plantilla });
    });
  },

  // A quienes guardaron el lote, si se publicó más barato que cuando lo guardaron
  // (o que el último aviso). Se avisa una sola vez por cada precio.
  bajaDePrecio(loteId: string) {
    enSegundoPlano("baja de precio", async (admin) => {
      const { data: lote, error } = await admin.from("lotes").select("titulo, estado, precio_publicado").eq("id", loteId).single();
      if (error) throw error;
      const ahora = Number(lote.precio_publicado);
      if (lote.estado !== "publicado" || !(ahora > 0)) return;
      const { data: favoritos } = await admin
        .from("favoritos")
        .select("usuario_id, precio_guardado, precio_avisado")
        .eq("lote_id", loteId);
      for (const f of favoritos ?? []) {
        const antes = Number(f.precio_avisado ?? f.precio_guardado);
        if (!(antes > ahora)) continue;
        await enviarEmail({ para: await emailDe(admin, f.usuario_id), ...plantillas.bajaDePrecio(lote.titulo, antes, ahora, loteId) });
        await admin.from("favoritos").update({ precio_avisado: ahora }).eq("lote_id", loteId).eq("usuario_id", f.usuario_id);
      }
    });
  },

  // A quienes guardaron una búsqueda que coincide con un lote recién publicado
  // (o que bajó de precio y ahora entra en su precio máximo).
  coincidencias(loteId: string) {
    enSegundoPlano("coincidencias de búsquedas", async (admin) => {
      const { data: avisos, error } = await admin.rpc("registrar_coincidencias", { p_lote: loteId });
      if (error) throw error;
      if (!avisos?.length) return;
      const { data: lote } = await admin.from("lotes").select("titulo, precio_publicado").eq("id", loteId).single();
      if (!lote) return;
      const porUsuario = new Map<string, string>();
      for (const a of avisos as { usuario_id: string; texto: string }[]) if (!porUsuario.has(a.usuario_id)) porUsuario.set(a.usuario_id, a.texto);
      for (const [usuarioId, texto] of porUsuario) {
        await enviarEmail({
          para: await emailDe(admin, usuarioId),
          ...plantillas.loteParaVos(texto, [{ titulo: lote.titulo, precio: lote.precio_publicado, id: loteId }]),
        });
      }
    });
  },

  loteEnRevision(loteId: string) {
    enSegundoPlano("lote en revisión", async (admin) => {
      const { data, error } = await admin.from("lotes").select("titulo, perfiles(nombre, empresa)").eq("id", loteId).single();
      if (error) throw error;
      const vendedor = data.perfiles as unknown as { nombre: string; empresa: string | null } | null;
      await enviarEmail({
        para: emailsAdmin(),
        ...plantillas.adminLoteEnRevision(data.titulo, vendedor?.empresa || vendedor?.nombre || "Un vendedor"),
      });
    });
  },

  reclamoAbierto(reclamoId: string) {
    enSegundoPlano("reclamo abierto", async (admin) => {
      const { data: r, error } = await admin.from("reclamos").select("oferta_id, autor_id, motivo, detalle").eq("id", reclamoId).single();
      if (error) throw error;
      const o = await datosOferta(admin, r.oferta_id);
      const motivo = MOTIVOS_RECLAMO[r.motivo as MotivoReclamo];
      const autorEsComprador = r.autor_id === o.compradorId;
      await enviarEmail({
        para: emailsAdmin(),
        ...plantillas.reclamoAbiertoAdmin(o.titulo, autorEsComprador ? "comprador" : "vendedor", motivo, r.detalle),
      });
      // A la otra parte de la operación.
      const contraparte = autorEsComprador ? o.vendedorId : o.compradorId;
      const panel = autorEsComprador ? "/panel/vendedor" : "/panel/comprador";
      await enviarEmail({ para: await emailDe(admin, contraparte), ...plantillas.reclamoAbiertoContraparte(o.titulo, motivo, panel) });
    });
  },

  reclamoResuelto(reclamoId: string) {
    enSegundoPlano("reclamo resuelto", async (admin) => {
      const { data: r, error } = await admin.from("reclamos").select("oferta_id, resultado, resolucion").eq("id", reclamoId).single();
      if (error) throw error;
      const o = await datosOferta(admin, r.oferta_id);
      const resultado = RESULTADOS_RECLAMO[r.resultado as ResultadoReclamo];
      for (const [usuario, panel] of [
        [o.compradorId, "/panel/comprador"],
        [o.vendedorId, "/panel/vendedor"],
      ]) {
        await enviarEmail({ para: await emailDe(admin, usuario), ...plantillas.reclamoResuelto(o.titulo, resultado, r.resolucion ?? "", panel) });
      }
    });
  },

  compradorVerificado(usuarioId: string) {
    enSegundoPlano("comprador verificado", async (admin) => {
      await enviarEmail({ para: await emailDe(admin, usuarioId), ...plantillas.compradorVerificado() });
    });
  },

  nuevoUsuario(nombre: string) {
    enSegundoPlano("nuevo usuario", async () => {
      await enviarEmail({ para: emailsAdmin(), ...plantillas.adminNuevoUsuario(nombre) });
    });
  },
};
