import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Aviso } from "@/components/aviso";
import { BotonEnviar } from "@/components/boton-enviar";
import { CodigoSeisDigitos } from "@/components/codigo-seis-digitos";
import { reenviarCodigo, verificarCodigo } from "../acciones";

export const metadata: Metadata = { title: "Confirmá tu email" };

export default async function Verificar({ searchParams }: PageProps<"/verificar">) {
  const { email, volver, ok, error } = await searchParams;
  if (typeof email !== "string" || !email) redirect("/registro");
  const destino = typeof volver === "string" ? volver : "/panel";

  return (
    <div className="contenedor max-w-md py-16">
      <h1 className="text-3xl font-bold">Confirmá tu email</h1>
      <p className="mt-2 text-stone-600">
        Te enviamos un código a <strong className="text-stone-900">{email}</strong>. Escribilo acá para activar tu cuenta.
      </p>
      <div className="mt-6">
        <Aviso ok={ok} error={error} />
      </div>

      <form action={verificarCodigo} className="tarjeta mt-4 space-y-5 p-6">
        <input type="hidden" name="email" value={email} />
        <input type="hidden" name="volver" value={destino} />
        <CodigoSeisDigitos />
        <BotonEnviar className="btn w-full" pendiente="Verificando...">Confirmar</BotonEnviar>
      </form>

      <form action={reenviarCodigo} className="mt-6 text-center text-sm text-stone-600">
        <input type="hidden" name="email" value={email} />
        <input type="hidden" name="volver" value={destino} />
        ¿No te llegó? Revisá spam o{" "}
        <BotonEnviar className="font-semibold text-marca hover:underline" pendiente="enviando...">
          pedí otro código
        </BotonEnviar>
        .
      </form>
    </div>
  );
}
