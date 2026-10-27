import type { Metadata } from "next";
import Link from "next/link";
import { Aviso } from "@/components/aviso";
import { BotonEnviar } from "@/components/boton-enviar";
import { ingresar } from "../acciones";

export const metadata: Metadata = { title: "Ingresar" };

export default async function Ingresar({ searchParams }: PageProps<"/ingresar">) {
  const { volver, ok, error } = await searchParams;

  return (
    <div className="contenedor max-w-md py-16">
      <h1 className="text-3xl font-bold">Ingresar</h1>
      <p className="mt-1 text-stone-600">Entrá a tu panel de Sobrá.</p>
      <div className="mt-6">
        <Aviso ok={ok} error={error} />
      </div>
      <form action={ingresar} className="tarjeta mt-4 space-y-4 p-6">
        <input type="hidden" name="volver" value={typeof volver === "string" ? volver : "/panel"} />
        <div>
          <label htmlFor="email" className="etiqueta">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" required className="campo" />
        </div>
        <div>
          <div className="flex items-baseline justify-between">
            <label htmlFor="password" className="etiqueta">Contraseña</label>
            <Link href="/recuperar" className="text-xs text-stone-500 hover:text-marca">¿La olvidaste?</Link>
          </div>
          <input id="password" name="password" type="password" autoComplete="current-password" required className="campo" />
        </div>
        <BotonEnviar className="btn w-full" pendiente="Ingresando...">Ingresar</BotonEnviar>
      </form>
      <p className="mt-6 text-center text-sm text-stone-600">
        ¿No tenés cuenta?{" "}
        <Link href="/registro?rol=vendedor" className="font-semibold text-marca hover:underline">Quiero vender</Link>
        {" · "}
        <Link href="/registro?rol=comprador" className="font-semibold text-marca hover:underline">Quiero comprar</Link>
      </p>
    </div>
  );
}
