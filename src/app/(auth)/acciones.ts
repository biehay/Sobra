"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { crearClienteServidor } from "@/lib/supabase/server";
import { mensajeParaUsuario } from "@/lib/errores";
import { problemaClave } from "@/lib/clave";
import { normalizarTelefono, cuitValido, formatearCuit } from "@/lib/datos";
import { notificar } from "@/lib/email/notificar";

// Solo rutas internas, para no redirigir a sitios externos.
function rutaSegura(valor: FormDataEntryValue | null, porDefecto = "/panel") {
  const ruta = typeof valor === "string" ? valor : "";
  return ruta.startsWith("/") && !ruta.startsWith("//") ? ruta : porDefecto;
}

function rutaVerificar(email: string, volver: string, aviso?: string) {
  const params = new URLSearchParams({ email, volver });
  if (aviso) params.set("ok", aviso);
  return `/verificar?${params}`;
}

function conError(ruta: string, mensaje: string): never {
  const separador = ruta.includes("?") ? "&" : "?";
  redirect(`${ruta}${separador}error=${encodeURIComponent(mensajeParaUsuario(mensaje))}`);
}

export async function ingresar(formData: FormData) {
  const volver = rutaSegura(formData.get("volver"));
  const supabase = await crearClienteServidor();
  const email = String(formData.get("email") ?? "");
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password: String(formData.get("password") ?? ""),
  });
  if (error?.code === "email_not_confirmed") {
    // Se registró pero no puso el código: le mandamos uno nuevo.
    await supabase.auth.resend({ type: "signup", email });
    redirect(rutaVerificar(email, volver, "Tu email no está confirmado. Te enviamos un código nuevo."));
  }
  if (error) {
    const sinConexion = error.status === 0 || /fetch/i.test(error.message);
    conError(`/ingresar?volver=${encodeURIComponent(volver)}`, sinConexion ? error.message : "Email o contraseña incorrectos");
  }
  const { data: nivel } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (nivel?.nextLevel === "aal2" && nivel.currentLevel !== "aal2") {
    redirect(`/seguridad/verificar?volver=${encodeURIComponent(volver)}`);
  }
  redirect(volver);
}

const esquemaRegistro = z.object({
  nombre: z.string().trim().min(2, "Ingresá tu nombre"),
  empresa: z.string().trim().default(""),
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
  zona: z.string().trim().min(1, "Elegí tu zona"),
  email: z.email("Ingresá un email válido"),
  password: z.string().superRefine((clave, ctx) => {
    const problema = problemaClave(clave);
    if (problema) ctx.addIssue({ code: "custom", message: problema });
  }),
});

export async function registrarse(formData: FormData) {
  const volver = rutaSegura(formData.get("volver"));
  const datos = esquemaRegistro.safeParse(Object.fromEntries(formData));
  const pantalla = `/registro?volver=${encodeURIComponent(volver)}`;
  if (!datos.success) conError(pantalla, datos.error.issues[0].message);

  const { email, password, ...perfil } = datos.data;
  const origen = (await headers()).get("origin") ?? "";
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: perfil,
      emailRedirectTo: `${origen}/auth/confirmar?volver=${encodeURIComponent(volver)}`,
    },
  });
  if (error) {
    const mensaje = error.code === "user_already_exists" ? "Ya existe una cuenta con ese email" : error.message;
    conError(pantalla, mensaje);
  }

  // Con la confirmación de email activada no hay sesión todavía: falta el código.
  if (!data.session) redirect(rutaVerificar(email, volver));
  notificar.nuevoUsuario(perfil.nombre);
  redirect(volver);
}

export async function verificarCodigo(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const volver = rutaSegura(formData.get("volver"));
  const codigo = String(formData.get("codigo") ?? "").replace(/\D/g, "");
  const pantalla = rutaVerificar(email, volver);
  if (codigo.length < 6) conError(pantalla, "Ingresá el código que te enviamos por email");

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.auth.verifyOtp({ email, token: codigo, type: "email" });
  if (error || !data.user) {
    const vencido = error?.code === "otp_expired";
    conError(pantalla, vencido ? "El código venció o no es correcto. Pedí uno nuevo." : "El código no es correcto");
  }

  const meta = data.user.user_metadata as { nombre?: string };
  notificar.nuevoUsuario(meta.nombre ?? email);
  redirect(volver);
}

export async function reenviarCodigo(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const volver = rutaSegura(formData.get("volver"));
  const supabase = await crearClienteServidor();
  const { error } = await supabase.auth.resend({ type: "signup", email });
  if (error) {
    const esperar = error.status === 429 || error.code === "over_email_send_rate_limit";
    conError(rutaVerificar(email, volver), esperar ? "Esperá un minuto antes de pedir otro código." : error.message);
  }
  redirect(rutaVerificar(email, volver, "Te enviamos un código nuevo."));
}

export async function recuperarClave(formData: FormData) {
  const email = z.email().safeParse(formData.get("email"));
  if (!email.success) conError("/recuperar", "Ingresá un email válido");
  const origen = (await headers()).get("origin") ?? "";
  const supabase = await crearClienteServidor();
  await supabase.auth.resetPasswordForEmail(email.data, {
    redirectTo: `${origen}/auth/confirmar?volver=/nueva-clave`,
  });
  // Mismo mensaje exista o no la cuenta, para no revelar qué emails están registrados.
  redirect(`/ingresar?ok=${encodeURIComponent("Si el email está registrado, te enviamos un link para crear una nueva contraseña.")}`);
}

export async function cambiarClave(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const problema = problemaClave(password);
  if (problema) conError("/nueva-clave", problema);
  if (password !== formData.get("confirmacion")) conError("/nueva-clave", "Las contraseñas no coinciden");
  const supabase = await crearClienteServidor();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) conError("/nueva-clave", "No pudimos cambiar la contraseña. Pedí un link nuevo.");
  redirect(`/panel?ok=${encodeURIComponent("Contraseña actualizada.")}`);
}
