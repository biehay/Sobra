import type { Metadata } from "next";
import Link from "next/link";
import { Aviso } from "@/components/aviso";
import { CampoCuit } from "@/components/campo-cuit";
import { PestanasPanel } from "@/components/pestanas-panel";
import { BotonEnviar } from "@/components/boton-enviar";
import { exigirRol } from "@/lib/sesion";
import { ZONAS } from "@/lib/datos";
import { reputacionDe } from "@/lib/reputacion";
import { TarjetaReputacion } from "@/components/reputacion";
import { actualizarPerfil } from "../acciones";

export const metadata: Metadata = { title: "Mis datos" };

export default async function Perfil({ searchParams }: PageProps<"/panel/perfil">) {
  const perfil = await exigirRol("usuario", "admin");
  const { ok, error } = await searchParams;
  const reputacion = perfil.rol === "usuario" ? await reputacionDe(perfil.id) : null;

  return (
    <div className="contenedor max-w-lg py-10">
      {perfil.rol === "usuario" ? (
        <PestanasPanel activa="datos" />
      ) : (
        <Link href="/admin" className="text-sm text-stone-500 hover:text-stone-800">← Administración</Link>
      )}
      <h1 className="text-3xl font-bold">Mis datos</h1>
      <p className="mt-1 text-sm text-stone-600">
        {perfil.rol === "admin" ? (
          "Cuenta de administración"
        ) : perfil.verificado ? (
          <span className="font-semibold text-green-700">Cuenta verificada: podés comprar y vender</span>
        ) : (
          <span className="font-semibold text-amber-700">En verificación: ya podés vender; para comprar te tenemos que verificar</span>
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
          <label htmlFor="empresa" className="etiqueta">Empresa (opcional)</label>
          <input id="empresa" name="empresa" defaultValue={perfil.empresa ?? ""} className="campo" />
        </div>
        <CampoCuit defaultValue={perfil.cuit ?? ""} />
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

      {reputacion && (
        <section className="tarjeta mt-6 space-y-5 p-6">
          <div>
            <h2 className="font-bold">Tu reputación</h2>
            <p className="text-sm text-stone-500">
              Se calcula sola con lo que cumplís en cada operación. Los compradores ven la de vendedor en tus lotes; los
              vendedores, la de comprador en tus ofertas.
            </p>
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold text-stone-500">Como vendedor</p>
            <TarjetaReputacion r={reputacion} como="vendedor" />
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold text-stone-500">Como comprador</p>
            <TarjetaReputacion r={reputacion} como="comprador" />
          </div>
        </section>
      )}

      <section className="tarjeta mt-6 space-y-3 p-6">
        <h2 className="font-bold">Seguridad</h2>
        <div>
          <p className="text-sm font-medium">Verificación en dos pasos: <span className="text-green-700">activada</span></p>
          <p className="text-sm text-stone-500">
            Cada vez que ingresás desde un dispositivo nuevo te mandamos un código a tu email para confirmar que sos vos.
          </p>
        </div>
        <Link href="/nueva-clave" className="inline-block text-sm text-stone-500 hover:text-marca">Cambiar contraseña</Link>
      </section>
    </div>
  );
}
