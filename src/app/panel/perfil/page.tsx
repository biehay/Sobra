import type { Metadata } from "next";
import Link from "next/link";
import { Aviso } from "@/components/aviso";
import { BotonEnviar } from "@/components/boton-enviar";
import { exigirRol } from "@/lib/sesion";
import { ZONAS } from "@/lib/datos";
import { actualizarPerfil } from "../acciones";

export const metadata: Metadata = { title: "Mis datos" };

export default async function Perfil({ searchParams }: PageProps<"/panel/perfil">) {
  const perfil = await exigirRol("vendedor", "comprador", "admin");
  const { ok, error } = await searchParams;

  return (
    <div className="contenedor max-w-lg py-10">
      <Link href="/panel" className="text-sm text-stone-500 hover:text-stone-800">← Mi panel</Link>
      <h1 className="mt-2 text-3xl font-bold">Mis datos</h1>
      <p className="mt-1 text-sm text-stone-600">
        Cuenta de {perfil.rol} ·{" "}
        {perfil.verificado ? (
          <span className="font-semibold text-green-700">Verificada</span>
        ) : (
          <span className="font-semibold text-amber-700">En verificación</span>
        )}
      </p>
      <div className="mt-6">
        <Aviso ok={ok} error={error} />
      </div>

      <form action={actualizarPerfil} className="tarjeta mt-4 grid gap-4 p-6 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="nombre" className="etiqueta">Nombre y apellido</label>
          <input id="nombre" name="nombre" required defaultValue={perfil.nombre} className="campo" />
        </div>
        <div>
          <label htmlFor="empresa" className="etiqueta">Empresa</label>
          <input id="empresa" name="empresa" required={perfil.rol === "vendedor"} defaultValue={perfil.empresa ?? ""} className="campo" />
        </div>
        <div>
          <label htmlFor="cuit" className="etiqueta">CUIT</label>
          <input id="cuit" name="cuit" defaultValue={perfil.cuit ?? ""} className="campo" />
        </div>
        <div>
          <label htmlFor="telefono" className="etiqueta">WhatsApp</label>
          <input id="telefono" name="telefono" type="tel" required defaultValue={perfil.telefono ?? ""} className="campo" />
        </div>
        <div>
          <label htmlFor="zona" className="etiqueta">Zona</label>
          <select id="zona" name="zona" required defaultValue={perfil.zona ?? ""} className="campo">
            <option value="" disabled>Elegí una zona</option>
            {ZONAS.map((z) => (
              <option key={z}>{z}</option>
            ))}
          </select>
        </div>
        <BotonEnviar className="btn sm:col-span-2" pendiente="Guardando...">Guardar cambios</BotonEnviar>
      </form>

      <p className="mt-6 text-center text-sm">
        <Link href="/nueva-clave" className="text-stone-500 hover:text-marca">Cambiar contraseña</Link>
      </p>
    </div>
  );
}
