// Sanciones escalonadas según las faltas de los últimos 180 días. Las aplica la
// base (supabase/migrations/20261115000000_sanciones_y_muestreo.sql); acá solo se
// explican, igual para el vendedor, el admin y los emails.
export const DIAS_DE_FALTA = 180;

export function consecuencia(faltas: number, suspendidoHasta: string | null): string {
  if (faltas <= 0) return "";
  if (suspendidoHasta === "infinity") return "No podés publicar hasta que revisemos tu cuenta. Escribinos para resolverlo.";
  if (suspendidoHasta) {
    const fecha = new Date(suspendidoHasta).toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });
    return `No podés publicar hasta el ${fecha}.`;
  }
  if (faltas >= 2) return "Tus publicaciones las revisa una persona antes de publicarlas (ya no salen al instante).";
  return "Es una advertencia: con otra falta, tus publicaciones dejan de salir al instante.";
}
