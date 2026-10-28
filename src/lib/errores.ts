// Mensajes de error para mostrar al usuario. Cuando la app no logra conectarse
// con Supabase, la librería devuelve "fetch failed", que no le dice nada a nadie.
const SIN_CONEXION = /fetch failed|failed to fetch|network|ECONNREFUSED|ENOTFOUND|getaddrinfo/i;

export function mensajeParaUsuario(mensaje: string): string {
  if (SIN_CONEXION.test(mensaje)) {
    console.error(
      `[Sobrá] No se pudo conectar con Supabase (${mensaje}). Revisá NEXT_PUBLIC_SUPABASE_URL en .env.local ` +
        "y reiniciá `npm run dev`. Para diagnosticarlo corré `npm run verificar`.",
    );
    return "No pudimos conectarnos con el servidor. Probá de nuevo en unos segundos.";
  }
  return mensaje;
}
