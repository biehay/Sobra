import { NextResponse } from "next/server";
import { recomendacionesParaVisitante } from "@/lib/recomendaciones";

// Recomendaciones para quien no tiene cuenta, según los lotes que vio en este
// navegador (los manda el navegador; no se guardan).
export async function GET(request: Request) {
  const ids = (new URL(request.url).searchParams.get("vistos") ?? "").split(",").filter(Boolean);
  const recs = await recomendacionesParaVisitante(ids, 6);
  return NextResponse.json(
    { lotes: recs.map((r) => ({ lote: r.lote, motivo: r.motivo.texto })) },
    { headers: { "Cache-Control": "private, max-age=60" } },
  );
}
