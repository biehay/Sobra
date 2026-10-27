import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { dosPasos, obtenerPerfil } from "@/lib/sesion";
import { Activar, Desactivar } from "../dos-pasos";

export const metadata: Metadata = { title: "Verificación en dos pasos" };

export default async function ActivarDosPasos({ searchParams }: PageProps<"/seguridad/activar">) {
  const { volver: volverParam } = await searchParams;
  const volver = typeof volverParam === "string" ? volverParam : "/panel/perfil";
  const perfil = await obtenerPerfil();
  if (!perfil) redirect(`/ingresar?volver=${encodeURIComponent("/seguridad/activar")}`);

  const { activa, verificada } = await dosPasos();
  if (activa && !verificada) redirect(`/seguridad/verificar?volver=${encodeURIComponent(volver)}`);
  const esAdmin = perfil.rol === "admin";

  return (
    <div className="contenedor max-w-md py-16">
      <h1 className="text-3xl font-bold">Verificación en dos pasos</h1>
      <p className="mt-2 text-stone-600">
        Además de la contraseña, para entrar vas a necesitar un código que genera una app en tu celular. Si alguien
        consigue tu contraseña, igual no puede entrar.
      </p>
      {esAdmin && !activa && (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Las cuentas de administración tienen que activarla para entrar al panel de admin.
        </p>
      )}

      <div className="mt-6">
        {activa ? (
          <div className="tarjeta space-y-4 p-6">
            <p className="font-semibold text-green-700">✓ La verificación en dos pasos está activada.</p>
            <Link href={volver} className="btn w-full">Continuar</Link>
            {/* El admin no puede desactivarla: es obligatoria para su rol. */}
            {!esAdmin && <Desactivar />}
          </div>
        ) : (
          <Activar volver={volver} />
        )}
      </div>
    </div>
  );
}
