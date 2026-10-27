import "server-only";
import { after } from "next/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { enviarEmail } from "./enviar";
import { plantillas } from "./plantillas";

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
      await enviarEmail({ para: await emailDe(admin, o.compradorId), ...plantillas.pagoConfirmadoComprador(o.titulo) });
      await enviarEmail({ para: await emailDe(admin, o.vendedorId), ...plantillas.pagoConfirmadoVendedor(o.titulo, o.neto) });
    });
  },

  retiroConfirmado(ofertaId: string) {
    enSegundoPlano("retiro confirmado", async (admin) => {
      const o = await datosOferta(admin, ofertaId);
      await enviarEmail({ para: await emailDe(admin, o.vendedorId), ...plantillas.retiroConfirmado(o.titulo, o.neto) });
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

  compradorVerificado(usuarioId: string) {
    enSegundoPlano("comprador verificado", async (admin) => {
      await enviarEmail({ para: await emailDe(admin, usuarioId), ...plantillas.compradorVerificado() });
    });
  },

  nuevoUsuario(nombre: string, rol: string) {
    enSegundoPlano("nuevo usuario", async () => {
      await enviarEmail({ para: emailsAdmin(), ...plantillas.adminNuevoUsuario(nombre, rol) });
    });
  },
};
