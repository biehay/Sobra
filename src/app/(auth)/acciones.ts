"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { crearClienteServidor } from "@/lib/supabase/server";

// Solo rutas internas, para no redirigir a sitios externos.
function rutaSegura(valor: FormDataEntryValue | null, porDefecto = "/panel") {
  const ruta = typeof valor === "string" ? valor : "";
  return ruta.startsWith("/") && !ruta.startsWith("//") ? ruta : porDefecto;
}

function conError(ruta: string, mensaje: string): never {
  const separador = ruta.includes("?") ? "&" : "?";
  redirect(`${ruta}${separador}error=${encodeURIComponent(mensaje)}`);
}

export async function ingresar(formData: FormData) {
  const volver = rutaSegura(formData.get("volver"));
  const supabase = await crearClienteServidor();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
  });
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

  // Si el proyecto pide confirmar el email, no hay sesión todavía.
  if (!data.session) {
    redirect(`/ingresar?ok=${encodeURIComponent("Te enviamos un email para confirmar tu cuenta.")}`);
  }
  redirect(volver);
}
