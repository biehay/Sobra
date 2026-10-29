"use server";

import { randomInt } from "node:crypto";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { enviarEmail } from "@/lib/email/enviar";
import { plantillas } from "@/lib/email/plantillas";
import { EMAIL_CONTACTO } from "@/components/pagina-legal";

const esquema = z.object({
  nombre: z.string().trim().min(2, "Ingresá tu nombre y apellido").max(120),
  email: z.email("Revisá tu email"),
  telefono: z.string().trim().max(40).default(""),
  operacion: z.string().trim().min(3, "Contanos qué compra querés revocar").max(300),
  detalle: z.string().trim().max(1000).default(""),
  // Campo trampa: las personas no lo ven; si viene completo, es un robot.
  web: z.string().max(0).default(""),
});

function volver(tipo: "ok" | "error", mensaje: string): never {
  redirect(`/arrepentimiento?${tipo}=${encodeURIComponent(mensaje)}`);
}

// Botón de arrepentimiento: no hace falta tener cuenta. Le damos al consumidor
// un código de trámite y le avisamos a Sobrá para que lo contacte.
export async function pedirArrepentimiento(formData: FormData) {
  const datos = esquema.safeParse(Object.fromEntries(formData));
  if (!datos.success) volver("error", datos.error.issues[0].message);
  const d = datos.data;
  const codigo = `ARR-${String(randomInt(0, 1_000_000)).padStart(6, "0")}`;
  const admins = (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim()).filter(Boolean);

  after(async () => {
    try {
      await enviarEmail({ para: d.email, ...plantillas.arrepentimientoRecibido(d.nombre, codigo) });
      await enviarEmail({
        para: admins.length ? admins : EMAIL_CONTACTO,
        ...plantillas.adminArrepentimiento(codigo, d.nombre, d.email, d.telefono, d.operacion, d.detalle),
      });
    } catch (error) {
      console.error(`[Sobrá] No se pudo avisar el pedido de arrepentimiento ${codigo}`, error);
    }
  });
  volver("ok", `Recibimos tu pedido. Tu código de trámite es ${codigo}. Te lo mandamos también por email y te contactamos dentro de las 24 horas hábiles.`);
}
