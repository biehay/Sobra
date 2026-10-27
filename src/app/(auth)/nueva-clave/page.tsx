import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Aviso } from "@/components/aviso";
import { BotonEnviar } from "@/components/boton-enviar";
import { obtenerPerfil } from "@/lib/sesion";
import { cambiarClave } from "../acciones";

export const metadata: Metadata = { title: "Nueva contraseña" };

// Se llega desde el link del email de recuperación, que ya inició la sesión.
export default async function NuevaClave({ searchParams }: PageProps<"/nueva-clave">) {
  if (!(await obtenerPerfil())) redirect("/recuperar");
  const { error } = await searchParams;

  return (
    <div className="contenedor max-w-md py-16">
      <h1 className="text-3xl font-bold">Nueva contraseña</h1>
      <div className="mt-6">
        <Aviso error={error} />
      </div>
      <form action={cambiarClave} className="tarjeta mt-4 space-y-4 p-6">
        <div>
          <label htmlFor="password" className="etiqueta">Nueva contraseña</label>
          <input id="password" name="password" type="password" minLength={8} required autoComplete="new-password" className="campo" />
        </div>
        <div>
          <label htmlFor="confirmacion" className="etiqueta">Repetila</label>
          <input id="confirmacion" name="confirmacion" type="password" minLength={8} required autoComplete="new-password" className="campo" />
        </div>
        <BotonEnviar className="btn w-full" pendiente="Guardando...">Guardar contraseña</BotonEnviar>
      </form>
    </div>
  );
}
