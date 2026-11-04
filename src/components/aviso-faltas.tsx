import { crearClienteServidor } from "@/lib/supabase/server";
import { consecuencia, DIAS_DE_FALTA } from "@/lib/sanciones";

// Las faltas del vendedor (últimos 180 días) y qué sanción le corresponde. Solo
// las ve él (y el admin); no se muestran a los compradores.
export async function AvisoFaltas({ usuarioId }: { usuarioId: string }) {
  const supabase = await crearClienteServidor();
  const desde = new Date(Date.parse(new Date().toISOString()) - DIAS_DE_FALTA * 86_400_000).toISOString();
  const [{ data: faltas }, { data: hasta }] = await Promise.all([
    supabase.from("faltas").select("id, detalle, created_at").eq("usuario_id", usuarioId).eq("anulada", false).gte("created_at", desde).order("created_at"),
    supabase.rpc("suspendido_hasta", { p_usuario: usuarioId }),
  ]);
  if (!faltas?.length) return null;
  const suspendida = !!hasta;
  return (
    <div data-aviso-faltas className={`rounded-lg border px-4 py-3 text-sm ${suspendida ? "border-marca/40 bg-marca-claro text-marca-oscuro" : "border-amber-300 bg-amber-50 text-amber-900"}`}>
      <p className="font-semibold">
        Tenés {faltas.length === 1 ? "1 falta" : `${faltas.length} faltas`} en los últimos 6 meses. {consecuencia(faltas.length, (hasta as string | null) ?? null)}
      </p>
      <ul className="mt-1 list-inside list-disc">
        {faltas.map((f) => (
          <li key={f.id}>
            {new Date(f.created_at).toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}: {f.detalle}
          </li>
        ))}
      </ul>
      <p className="mt-1 text-xs">Las faltas vencen a los 6 meses. Si creés que alguna es un error, escribinos.</p>
    </div>
  );
}
