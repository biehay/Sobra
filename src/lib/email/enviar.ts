import "server-only";

export type Email = { para: string | string[]; asunto: string; html: string };

// Envía un email con Resend (https://resend.com). Sin RESEND_API_KEY, por ejemplo
// en desarrollo, lo muestra en la consola en vez de enviarlo.
export async function enviarEmail({ para, asunto, html }: Email) {
  const destinatarios = (Array.isArray(para) ? para : [para]).filter(Boolean);
  if (!destinatarios.length) return;

  const clave = process.env.RESEND_API_KEY;
  if (!clave) {
    console.info(`[email sin enviar: falta RESEND_API_KEY] Para: ${destinatarios.join(", ")} · ${asunto}`);
    return;
  }

  const respuesta = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${clave}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.EMAIL_REMITENTE ?? "Sobrá <onboarding@resend.dev>",
      to: destinatarios,
      subject: asunto,
      html,
    }),
  });
  if (!respuesta.ok) {
    throw new Error(`Resend respondió ${respuesta.status}: ${await respuesta.text()}`);
  }
}
