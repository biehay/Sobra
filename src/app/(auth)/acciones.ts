"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { crearClienteServidor } from "@/lib/supabase/server";
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
  redirect(`${ruta}${separador}error=${encodeURIComponent(mensaje)}`);
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
    conError(`/ingresar?volver=${encodeURIComponent(volver)}`, "Email o contraseña incorrectos");
  }
  redirect(volver);
}

const esquemaRegistro = z.object({
  rol: z.enum(["vendedor", "comprador"]),
  nombre: z.string().trim().min(2, "Ingresá tu nombre"),
  empresa: z.string().trim().default(""),
  cuit: z.string().trim().default(""),
  telefono: z.string().trim().min(8, "Ingresá un teléfono de WhatsApp válido"),
  zona: z.string().trim().min(1, "Elegí tu zona"),
  email: z.email("Ingresá un email válido"),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
});

export async function registrarse(formData: FormData) {
  const volver = rutaSegura(formData.get("volver"));
  const datos = esquemaRegistro.safeParse(Object.fromEntries(formData));
  const rol = formData.get("rol") === "comprador" ? "comprador" : "vendedor";
  if (!datos.success) {
    conError(`/registro?rol=${rol}&volver=${encodeURIComponent(volver)}`, datos.error.issues[0].message);
  }
  if (datos.data.rol === "vendedor" && !datos.data.empresa) {
    conError(`/registro?rol=vendedor`, "Ingresá el nombre de la empresa");
  }

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
    conError(`/registro?rol=${rol}&volver=${encodeURIComponent(volver)}`, mensaje);
  }

  // Con la confirmación de email activada no hay sesión todavía: falta el código.
  if (!data.session) redirect(rutaVerificar(email, volver));
  notificar.nuevoUsuario(perfil.nombre, perfil.rol);
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

  const meta = data.user.user_metadata as { nombre?: string; rol?: string };
  notificar.nuevoUsuario(meta.nombre ?? email, meta.rol === "vendedor" ? "vendedor" : "comprador");
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
  if (password.length < 8) conError("/nueva-clave", "La contraseña debe tener al menos 8 caracteres");
  if (password !== formData.get("confirmacion")) conError("/nueva-clave", "Las contraseñas no coinciden");
  const supabase = await crearClienteServidor();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) conError("/nueva-clave", "No pudimos cambiar la contraseña. Pedí un link nuevo.");
  redirect(`/panel?ok=${encodeURIComponent("Contraseña actualizada.")}`);
}
