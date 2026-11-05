"use server";

import { randomInt } from "node:crypto";
import { headers } from "next/headers";
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

// Límites para que nadie use el formulario para mandar emails "de Sobrá" a cualquiera:
// por conexión, por email de destino y un tope diario para todo el sitio.
const POR_CONEXION_POR_HORA = 3;
const POR_EMAIL_POR_DIA = 2;
const TOPE_DIARIO = 100;
const usos = new Map<string, number[]>();
function superaLimite(clave: string, maximo: number, ventanaMs: number) {
  const ahora = Date.now();
  const recientes = (usos.get(clave) ?? []).filter((t) => ahora - t < ventanaMs);
  if (recientes.length >= maximo) return true;
  usos.set(clave, [...recientes, ahora]);
  return false;
}

function volver(tipo: "ok" | "error", mensaje: string): never {
  redirect(`/arrepentimiento?${tipo}=${encodeURIComponent(mensaje)}`);
}

// Botón de arrepentimiento: no hace falta tener cuenta. Le damos al consumidor
// un código de trámite y le avisamos a Sobrá para que lo contacte.
export async function pedirArrepentimiento(formData: FormData) {
  const datos = esquema.safeParse(Object.fromEntries(formData));
  if (!datos.success) volver("error", datos.error.issues[0].message);
  const d = datos.data;
  const h = await headers();
  const conexion = h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip") || "sin-ip";
  if (
    superaLimite(`ip:${conexion}`, POR_CONEXION_POR_HORA, 3_600_000) ||
    superaLimite(`email:${d.email.toLowerCase()}`, POR_EMAIL_POR_DIA, 86_400_000) ||
    superaLimite("total", TOPE_DIARIO, 86_400_000)
  ) {
    volver("error", `Ya recibimos varios pedidos. Si necesitás algo más, escribinos a ${EMAIL_CONTACTO}.`);
  }
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
