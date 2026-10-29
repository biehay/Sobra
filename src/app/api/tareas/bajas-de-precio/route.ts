import { NextResponse } from "next/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { notificar } from "@/lib/email/notificar";

// Tarea diaria: baja el precio de los lotes con baja automática que pasaron una
// semana sin venderse. La llama el programador de tareas (Vercel Cron, ver
// vercel.json) con la clave CRON_SECRET; sin esa clave no hace nada.
export async function GET(request: Request) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto || request.headers.get("authorization") !== `Bearer ${secreto}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const admin = crearClienteAdmin();
  if (!admin) return NextResponse.json({ error: "Falta SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });

  const { data, error } = await admin.rpc("aplicar_bajas_de_precio");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // A quienes lo guardaron y a quienes ahora les entra en su precio máximo.
  for (const { lote_id } of (data ?? []) as { lote_id: string }[]) {
    notificar.bajaDePrecio(lote_id);
    notificar.coincidencias(lote_id);
  }
  return NextResponse.json({ bajaron: data?.length ?? 0 });
}
