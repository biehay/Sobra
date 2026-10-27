import type { Metadata } from "next";
import Link from "next/link";
import { Aviso } from "@/components/aviso";
import { ZONAS } from "@/lib/datos";
import { BotonEnviar } from "@/components/boton-enviar";
import { registrarse } from "../acciones";

export const metadata: Metadata = { title: "Crear cuenta" };

export default async function Registro({ searchParams }: PageProps<"/registro">) {
  const { rol: rolParam, volver, error } = await searchParams;
  const rol = rolParam === "comprador" ? "comprador" : "vendedor";
  const esVendedor = rol === "vendedor";

  return (
    <div className="contenedor max-w-lg py-16">
      <div className="mb-6 grid grid-cols-2 rounded-lg border border-stone-200 bg-white p-1 text-center text-sm font-semibold">
        <Link
          href="/registro?rol=vendedor"
          className={`rounded-md py-2 ${esVendedor ? "bg-marca text-white" : "text-stone-600"}`}
        >
          Quiero vender
        </Link>
        <Link
          href="/registro?rol=comprador"
          className={`rounded-md py-2 ${!esVendedor ? "bg-marca text-white" : "text-stone-600"}`}
        >
          Quiero comprar
        </Link>
      </div>

      <h1 className="text-3xl font-bold">{esVendedor ? "Publicá tu sobrante" : "Comprá materiales con descuento"}</h1>
      <p className="mt-1 text-stone-600">
        {esVendedor
          ? "Para constructoras, corralones, distribuidores y empresas con stock sin uso. Publicar es gratis."
          : "Para contratistas, arquitectos, cooperativas y particulares. Verificamos tu cuenta antes de tu primera oferta."}
      </p>

      <div className="mt-6">
        <Aviso error={error} />
      </div>

      <form action={registrarse} className="tarjeta mt-4 grid gap-4 p-6 sm:grid-cols-2">
        <input type="hidden" name="rol" value={rol} />
        <input type="hidden" name="volver" value={typeof volver === "string" ? volver : "/panel"} />
        <div className="sm:col-span-2">
          <label htmlFor="nombre" className="etiqueta">Nombre y apellido</label>
          <input id="nombre" name="nombre" required autoComplete="name" className="campo" />
        </div>
        <div>
          <label htmlFor="empresa" className="etiqueta">Empresa {esVendedor ? "" : "(opcional)"}</label>
          <input id="empresa" name="empresa" required={esVendedor} autoComplete="organization" className="campo" />
        </div>
        <div>
          <label htmlFor="cuit" className="etiqueta">CUIT (opcional)</label>
          <input id="cuit" name="cuit" inputMode="numeric" className="campo" placeholder="30-12345678-9" />
        </div>
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
      </form>

      <p className="mt-6 text-center text-sm text-stone-600">
        ¿Ya tenés cuenta?{" "}
        <Link href="/ingresar" className="font-semibold text-marca hover:underline">Ingresá</Link>
      </p>
    </div>
  );
}
