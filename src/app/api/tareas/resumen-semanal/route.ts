import { NextResponse } from "next/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { enviarEmail } from "@/lib/email/enviar";
import { plantillas, urlSitio } from "@/lib/email/plantillas";
import { armarResumen, firmaBaja } from "@/lib/resumen-semanal";

// Tarea semanal (vercel.json): manda el resumen a quien tenga algo nuevo y no
// lo haya desactivado. Protegida con CRON_SECRET.
export const maxDuration = 300;

export async function GET(request: Request) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto || request.headers.get("authorization") !== `Bearer ${secreto}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const admin = crearClienteAdmin();
  if (!admin) return NextResponse.json({ error: "Falta SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });

  const { data: usuarios, error } = await admin.from("perfiles").select("id, nombre, zona").eq("rol", "usuario").eq("recibe_resumen", true);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let enviados = 0;
  for (const u of usuarios ?? []) {
    try {
      const resumen = await armarResumen(admin, u);
      if (!resumen) continue;
      const { data } = await admin.auth.admin.getUserById(u.id);
      if (!data.user?.email) continue;
      const baja = urlSitio(`/resumen-baja?u=${u.id}&f=${firmaBaja(u.id)}`);
      await enviarEmail({ para: data.user.email, ...plantillas.resumenSemanal(u.nombre.split(" ")[0], resumen, baja) });
      enviados++;
    } catch (e) {
      console.error(`[Sobrá] No se pudo mandar el resumen a ${u.id}`, e);
    }
  }
  return NextResponse.json({ enviados });
}
