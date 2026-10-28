import type { Metadata } from "next";
import Link from "next/link";
import { Aviso } from "@/components/aviso";
import { CampoCuit } from "@/components/campo-cuit";
import { ZONAS } from "@/lib/datos";
import { BotonEnviar } from "@/components/boton-enviar";
import { registrarse } from "../acciones";

export const metadata: Metadata = { title: "Crear cuenta" };

export default async function Registro({ searchParams }: PageProps<"/registro">) {
  const { volver, error } = await searchParams;

  return (
    <div className="contenedor max-w-lg py-16">
      <h1 className="text-3xl font-bold">Creá tu cuenta</h1>
      <p className="mt-1 text-stone-600">
        Con una sola cuenta podés vender lo que te sobró y comprar materiales con descuento.
      </p>
      <ul className="mt-4 grid gap-2 text-sm text-stone-600 sm:grid-cols-2">
        <li className="tarjeta p-3">
          <strong className="text-stone-900">Para vender:</strong> publicás gratis y el pago está protegido. Cada lote lo
          revisamos antes de publicarlo.
        </li>
        <li className="tarjeta p-3">
          <strong className="text-stone-900">Para comprar:</strong> verificamos tu cuenta antes de tu primera oferta, para
          que los vendedores operen tranquilos.
        </li>
      </ul>

      <div className="mt-6">
        <Aviso error={error} />
      </div>

      <form action={registrarse} className="tarjeta mt-4 grid gap-4 p-6 sm:grid-cols-2">
        <input type="hidden" name="volver" value={typeof volver === "string" ? volver : "/panel"} />
        <div className="sm:col-span-2">
          <label htmlFor="nombre" className="etiqueta">Nombre y apellido</label>
          <input id="nombre" name="nombre" required autoComplete="name" className="campo" />
        </div>
        <div>
          <label htmlFor="empresa" className="etiqueta">Empresa (opcional)</label>
          <input id="empresa" name="empresa" autoComplete="organization" className="campo" />
        </div>
        <CampoCuit />
        <div>
          <label htmlFor="telefono" className="etiqueta">WhatsApp</label>
          <input id="telefono" name="telefono" type="tel" required autoComplete="tel" className="campo" placeholder="11 2345 6789" />
        </div>
        <div>
          <label htmlFor="zona" className="etiqueta">Zona</label>
          <select id="zona" name="zona" required className="campo" defaultValue="">
            <option value="" disabled>Elegí una zona</option>
            {ZONAS.map((z) => (
              <option key={z}>{z}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="email" className="etiqueta">Email</label>
          <input id="email" name="email" type="email" required autoComplete="email" className="campo" />
        </div>
        <div>
          <label htmlFor="password" className="etiqueta">Contraseña</label>
          <input id="password" name="password" type="password" minLength={8} required autoComplete="new-password" className="campo" />
        </div>
        <BotonEnviar className="btn sm:col-span-2" pendiente="Creando cuenta...">Crear cuenta</BotonEnviar>
        <p className="text-center text-xs text-stone-500 sm:col-span-2">
          Al crear tu cuenta aceptás los{" "}
          <Link href="/terminos" target="_blank" className="underline hover:text-marca">Términos y condiciones</Link> y la{" "}
          <Link href="/privacidad" target="_blank" className="underline hover:text-marca">Política de privacidad</Link>.
        </p>
      </form>

      <p className="mt-6 text-center text-sm text-stone-600">
        ¿Ya tenés cuenta?{" "}
        <Link href="/ingresar" className="font-semibold text-marca hover:underline">Ingresá</Link>
      </p>
    </div>
  );
}
