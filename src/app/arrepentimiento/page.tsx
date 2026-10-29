import type { Metadata } from "next";
import Link from "next/link";
import { Aviso } from "@/components/aviso";
import { BotonEnviar } from "@/components/boton-enviar";
import { pedirArrepentimiento } from "./acciones";

export const metadata: Metadata = { title: "Botón de arrepentimiento" };

export default async function Arrepentimiento({ searchParams }: PageProps<"/arrepentimiento">) {
  const { ok, error } = await searchParams;
  return (
    <div className="contenedor max-w-xl py-12">
      <h1 className="text-3xl font-bold">Botón de arrepentimiento</h1>
      <p className="mt-2 text-stone-600">
        Si sos consumidor final, podés revocar tu compra dentro de los 10 días corridos, sin dar motivos y sin costo. Completá
        este formulario: te damos un código de trámite y te contactamos para coordinar la devolución. Más información en la{" "}
        <Link href="/devoluciones#arrepentimiento" className="font-semibold text-marca hover:underline">
          Política de devoluciones
        </Link>
        .
      </p>
      <div className="mt-6">
        <Aviso ok={ok} error={error} />
      </div>
      {!ok && (
        <form action={pedirArrepentimiento} className="tarjeta mt-4 grid gap-4 p-6">
          <div>
            <label htmlFor="nombre" className="etiqueta">Nombre y apellido</label>
            <input id="nombre" name="nombre" required maxLength={120} autoComplete="name" className="campo" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="email" className="etiqueta">Email</label>
              <input id="email" name="email" type="email" required autoComplete="email" className="campo" />
            </div>
            <div>
              <label htmlFor="telefono" className="etiqueta">Teléfono (opcional)</label>
              <input id="telefono" name="telefono" type="tel" maxLength={40} autoComplete="tel" className="campo" />
            </div>
          </div>
          <div>
            <label htmlFor="operacion" className="etiqueta">¿Qué compra querés revocar?</label>
            <input id="operacion" name="operacion" required maxLength={300} placeholder="Ej.: Porcelanato 60x60 gris, pagado el 20/10" className="campo" />
          </div>
          <div>
            <label htmlFor="detalle" className="etiqueta">Comentarios (opcional)</label>
            <textarea id="detalle" name="detalle" rows={3} maxLength={1000} className="campo" />
          </div>
          <input name="web" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" />
          <BotonEnviar className="btn" pendiente="Enviando...">Revocar mi compra</BotonEnviar>
        </form>
      )}
    </div>
  );
}
