import type { Metadata } from "next";
import Link from "next/link";
import { Aviso } from "@/components/aviso";
import { BotonEnviar } from "@/components/boton-enviar";
import { recuperarClave } from "../acciones";

export const metadata: Metadata = { title: "Recuperar contraseña" };

export default async function Recuperar({ searchParams }: PageProps<"/recuperar">) {
  const { error } = await searchParams;

  return (
    <div className="contenedor max-w-md py-16">
      <h1 className="text-3xl font-bold">Recuperar contraseña</h1>
      <p className="mt-1 text-stone-600">Te enviamos un link para crear una nueva.</p>
      <div className="mt-6">
        <Aviso error={error} />
      </div>
      <form action={recuperarClave} className="tarjeta mt-4 space-y-4 p-6">
        <div>
          <label htmlFor="email" className="etiqueta">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" required className="campo" />
        </div>
        <BotonEnviar className="btn w-full">Enviar link</BotonEnviar>
      </form>
      <p className="mt-6 text-center text-sm">
        <Link href="/ingresar" className="font-semibold text-marca hover:underline">Volver a ingresar</Link>
      </p>
    </div>
  );
}
