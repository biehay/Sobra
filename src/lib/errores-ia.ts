import "server-only";
import Anthropic from "@anthropic-ai/sdk";

// Traduce un error de la API de Anthropic a algo que se entienda. `detalle` es
// la causa técnica: se muestra solo mientras se desarrolla (no en producción) y
// siempre queda en la terminal.
export function explicarErrorIA(error: unknown): { mensaje: string; detalle?: string } {
  const texto = error instanceof Error ? error.message : String(error);
  console.error("[Sobrá] Error de la IA:", texto);
  const dev = process.env.NODE_ENV !== "production";
  const con = (mensaje: string) => ({ mensaje, detalle: dev ? texto.slice(0, 300) : undefined });

  if (error instanceof Anthropic.AuthenticationError) return con("La clave de la IA no es válida. Revisá ANTHROPIC_API_KEY en .env.local.");
  if (/web.?search/i.test(texto)) {
    return con("La búsqueda web está desactivada en la cuenta de Anthropic. Activala en console.anthropic.com, en la configuración de privacidad de la organización.");
  }
  if (/credit|balance|billing/i.test(texto)) return con("La cuenta de Anthropic no tiene saldo. Cargá crédito en console.anthropic.com.");
  if (error instanceof Anthropic.NotFoundError || /model/i.test(texto) && error instanceof Anthropic.BadRequestError) {
    return con("El modelo de IA no está disponible para esta cuenta de Anthropic.");
  }
  if (error instanceof Anthropic.RateLimitError) return con("La IA está con mucha demanda. Probá de nuevo en un minuto.");
  if (error instanceof Anthropic.APIConnectionTimeoutError || /tard|timeout/i.test(texto)) return con("La búsqueda de precios tardó demasiado. Probá de nuevo.");
  if (error instanceof Anthropic.APIConnectionError) return con("No hay conexión con la IA. Revisá tu internet.");
  return con("No pudimos buscar el precio ahora.");
}
