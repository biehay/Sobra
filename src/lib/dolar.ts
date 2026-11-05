import "server-only";
import { iaDePrueba } from "@/lib/entorno";

// Dólar oficial (venta) del día, para pasar a pesos los precios que los
// proveedores publican en dólares. Se consulta una fuente pública y se guarda
// unas horas. Si no responde, se devuelve null (y el que llama usa otro dato).
const FUENTE = "https://dolarapi.com/v1/dolares/oficial";
const VIGENCIA = 6 * 3_600_000;
let guardado: { valor: number; hasta: number } | null = null;

export async function dolarDelDia(): Promise<number | null> {
  // En el recorrido de pruebas (sin internet), un valor fijo. Nunca en producción.
  if (iaDePrueba()) return 1000;
  if (guardado && guardado.hasta > Date.now()) return guardado.valor;
  try {
    const r = await fetch(FUENTE, { signal: AbortSignal.timeout(4000), cache: "no-store" });
    if (!r.ok) return null;
    const { venta } = (await r.json()) as { venta?: number };
    if (!venta || venta <= 0) return null;
    guardado = { valor: venta, hasta: Date.now() + VIGENCIA };
    return venta;
  } catch {
    return null;
  }
}
