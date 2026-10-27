import "server-only";
import { createClient } from "@supabase/supabase-js";

// Cliente con la service role: saltea los permisos de la base. Solo se usa en el
// servidor para leer los emails de los destinatarios de las notificaciones.
export function crearClienteAdmin() {
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!clave) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, clave, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
