import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { firmaBajaValida } from "@/lib/resumen-semanal";

export const metadata: Metadata = { title: "Dejar de recibir el resumen" };

// Baja del resumen semanal desde el link del email, sin ingresar. Pide un clic
// de confirmación: los filtros de spam abren los links solos y no queremos que
// den de baja a nadie sin querer.
async function confirmarBaja(formData: FormData) {
  "use server";
  const u = String(formData.get("u") ?? "");
  const f = String(formData.get("f") ?? "");
  const admin = crearClienteAdmin();
  if (!admin || !firmaBajaValida(u, f)) redirect("/resumen-baja?invalido=1");
  await admin.from("perfiles").update({ recibe_resumen: false }).eq("id", u);
  redirect("/resumen-baja?listo=1");
}

export default async function ResumenBaja({ searchParams }: PageProps<"/resumen-baja">) {
  const { u, f, listo, invalido } = await searchParams;
  return (
    <div className="contenedor max-w-md py-16 text-center">
      <h1 className="text-2xl font-bold">Resumen semanal</h1>
      {listo ? (
        <p className="mt-3 text-stone-600">Listo, no te lo mandamos más. Lo podés volver a activar desde Mis datos.</p>
      ) : invalido || typeof u !== "string" || typeof f !== "string" ? (
        <p className="mt-3 text-stone-600">El link no es válido. Podés desactivar el resumen desde Mis datos.</p>
      ) : (
        <form action={confirmarBaja} className="mt-6">
          <input type="hidden" name="u" value={u} />
          <input type="hidden" name="f" value={f} />
          <p className="text-stone-600">¿Querés dejar de recibir el resumen semanal de Sobrá?</p>
          <button className="btn mt-4">Sí, no me lo manden más</button>
        </form>
      )}
    </div>
  );
}
