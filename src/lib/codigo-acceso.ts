import "server-only";
import { createHash, randomInt, randomUUID } from "node:crypto";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { crearClienteServidor } from "@/lib/supabase/server";
import { enviarEmail } from "@/lib/email/enviar";
import { plantillas } from "@/lib/email/plantillas";

// Segundo paso del ingreso: un código de 6 dígitos que se manda al email de la
// cuenta. En la base se guarda solo un hash, atado a la sesión actual; lo
// valida la función verificar_codigo_acceso() de la base.

const VIGENCIA_MINUTOS = 10;
const ESPERA_ENTRE_CODIGOS_SEGUNDOS = 60;
const MAXIMO_POR_HORA = 5;

async function sesionActual() {
  const supabase = await crearClienteServidor();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub || !claims.session_id || !claims.email) return null;
  return { usuarioId: claims.sub, sesionId: claims.session_id as string, email: claims.email as string };
}

// Sin Resend, en desarrollo el código se muestra en la terminal de `npm run dev`.
function mostrarEnConsola() {
  return process.env.NODE_ENV === "development" || process.env.SOBRA_CODIGOS_EN_CONSOLA === "1";
}

// `soloEnTerminal`: en desarrollo, Resend no pudo mandarlo y el código quedó en la terminal.
export async function enviarCodigoAcceso(): Promise<{ error?: string; soloEnTerminal?: boolean }> {
  const sesion = await sesionActual();
  if (!sesion) return { error: "Tu sesión venció. Volvé a ingresar." };
  const admin = crearClienteAdmin();
  if (!admin) return { error: "Falta configurar SUPABASE_SERVICE_ROLE_KEY en el servidor." };

  const { data: recientes } = await admin
    .from("codigos_acceso")
    .select("created_at")
    .eq("user_id", sesion.usuarioId)
    .gte("created_at", new Date(Date.now() - 60 * 60_000).toISOString())
    .order("created_at", { ascending: false });
  const ultimo = recientes?.[0] ? new Date(recientes[0].created_at).getTime() : 0;
  if (Date.now() - ultimo < ESPERA_ENTRE_CODIGOS_SEGUNDOS * 1000) {
    return { error: "Ya te mandamos un código hace un momento. Esperá un minuto para pedir otro." };
  }
  if ((recientes?.length ?? 0) >= MAXIMO_POR_HORA) {
    return { error: "Pediste muchos códigos. Probá de nuevo en una hora." };
  }

  const codigo = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const id = randomUUID();
  const { error } = await admin.from("codigos_acceso").insert({
    id,
    user_id: sesion.usuarioId,
    session_id: sesion.sesionId,
    // Mismo cálculo que verificar_codigo_acceso() en la base.
    hash: createHash("sha256").update(id + codigo).digest("hex"),
    expira_at: new Date(Date.now() + VIGENCIA_MINUTOS * 60_000).toISOString(),
  });
  if (error) {
    console.error(
      `[Sobrá] No se pudo guardar el código de acceso: ${error.message}. ` +
        (error.code === "PGRST205" || /codigos_acceso/.test(error.message)
          ? "Falta ejecutar en Supabase la migración supabase/migrations/20261101000000_dos_pasos_para_todos.sql."
          : "Corré `npm run verificar` para revisar la conexión."),
    );
    return { error: "No pudimos generar el código. Probá de nuevo." };
  }

  if (!process.env.RESEND_API_KEY) {
    if (!mostrarEnConsola()) return { error: "No pudimos enviarte el código por email. Escribinos." };
    console.info(`[Sobrá] Código de acceso para ${sesion.email}: ${codigo} (sin RESEND_API_KEY no se envía por email)`);
    return {};
  }
  try {
    await enviarEmail({ para: sesion.email, ...plantillas.codigoAcceso(codigo) });
  } catch (e) {
    const detalle = e instanceof Error ? e.message : String(e);
    console.error(`[Sobrá] Resend no pudo enviar el código a ${sesion.email}: ${detalle}`);
    // Con el remitente de prueba (onboarding@resend.dev) Resend solo envía al
    // email de la cuenta de Resend, hasta que se verifique un dominio propio.
    if (/testing emails|verify a domain|own email/i.test(detalle)) {
      console.error("[Sobrá] Sin dominio verificado en Resend solo se puede enviar al email de tu cuenta de Resend.");
    }
    // En desarrollo, el código sale igual en la terminal.
    if (mostrarEnConsola()) {
      console.info(`[Sobrá] Código de acceso para ${sesion.email}: ${codigo} (Resend no lo pudo enviar)`);
      return { soloEnTerminal: true };
    }
    return { error: "No pudimos enviarte el código por email. Probá de nuevo en un minuto." };
  }
  return {};
}

// Para la pantalla del código: el email de la cuenta y si ya hay un código
// vigente para esta sesión (si no, se muestra el botón para pedirlo).
export async function estadoCodigoAcceso() {
  const sesion = await sesionActual();
  const admin = crearClienteAdmin();
  // Modo prueba: sin Resend, el código no viaja por email sino que sale en la terminal.
  const enTerminal = !process.env.RESEND_API_KEY && mostrarEnConsola();
  if (!sesion || !admin) return { email: sesion?.email ?? "", hayCodigo: false, enTerminal };
  const { count } = await admin
    .from("codigos_acceso")
    .select("id", { count: "exact", head: true })
    .eq("user_id", sesion.usuarioId)
    .eq("session_id", sesion.sesionId)
    .gt("expira_at", new Date().toISOString());
  return { email: sesion.email, hayCodigo: (count ?? 0) > 0, enTerminal };
}

// Cuando la sesión nace de confirmar el email con un código (registro con
// "Confirm email" de Supabase), el email ya quedó probado: se marca verificada.
export async function marcarSesionVerificada() {
  const sesion = await sesionActual();
  const admin = crearClienteAdmin();
  if (!sesion || !admin) return;
  await admin
    .from("sesiones_verificadas")
    .upsert({ session_id: sesion.sesionId, user_id: sesion.usuarioId, verificada_at: new Date().toISOString() });
}
