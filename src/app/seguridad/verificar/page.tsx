import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Aviso } from "@/components/aviso";
import { BotonEnviar } from "@/components/boton-enviar";
import { CodigoSeisDigitos } from "@/components/codigo-seis-digitos";
import { estadoCodigoAcceso } from "@/lib/codigo-acceso";
import { obtenerPerfil, sesionVerificada } from "@/lib/sesion";
import { confirmarCodigo, pedirCodigo } from "../acciones";

export const metadata: Metadata = { title: "Confirmá que sos vos" };

// Segundo paso del ingreso: el código de 6 dígitos que mandamos al email.
export default async function VerificarIngreso({ searchParams }: PageProps<"/seguridad/verificar">) {
  const { volver: volverParam, ok, error } = await searchParams;
  const volver = typeof volverParam === "string" && volverParam.startsWith("/") && !volverParam.startsWith("//") ? volverParam : "/panel";
  if (!(await obtenerPerfil())) redirect(`/ingresar?volver=${encodeURIComponent(volver)}`);
  if (await sesionVerificada()) redirect(volver);
  const { email, hayCodigo, enTerminal } = await estadoCodigoAcceso();

  return (
    <div className="contenedor max-w-md py-16">
      <h1 className="text-3xl font-bold">Confirmá que sos vos</h1>
      <p className="mt-2 text-stone-600">
        {hayCodigo ? "Te mandamos un código de 6 números a " : "Para seguir, te vamos a mandar un código de 6 números a "}
        <strong className="text-stone-900">{email}</strong>.
      </p>
      {enTerminal && (
        <p className="mt-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          <strong>Modo prueba:</strong> todavía no está configurado el envío de emails (Resend), así que el código no
          llega al mail. Buscalo en la terminal donde corre <code>npm run dev</code>: dice
          &quot;Código de acceso para {email}&quot;.
        </p>
      )}
      <div className="mt-6">
        <Aviso ok={ok} error={error} />
      </div>

      {hayCodigo ? (
        <form action={confirmarCodigo} className="tarjeta mt-4 space-y-5 p-6">
          <input type="hidden" name="volver" value={volver} />
          <CodigoSeisDigitos />
          <BotonEnviar className="btn w-full" pendiente="Verificando...">Confirmar</BotonEnviar>
          <p className="text-center text-xs text-stone-500">El código vence en 10 minutos.</p>
        </form>
      ) : (
        <form action={pedirCodigo} className="tarjeta mt-4 p-6">
          <input type="hidden" name="volver" value={volver} />
          <BotonEnviar className="btn w-full" pendiente="Enviando...">Enviarme el código</BotonEnviar>
        </form>
      )}

      <div className="mt-6 flex flex-wrap justify-center gap-x-4 gap-y-2 text-sm text-stone-500">
        {hayCodigo && (
          <form action={pedirCodigo}>
            <input type="hidden" name="volver" value={volver} />
            ¿No te llegó? Revisá spam o{" "}
            <BotonEnviar className="font-semibold text-marca hover:underline" pendiente="enviando...">pedí otro</BotonEnviar>
          </form>
        )}
        <form action="/salir" method="post">
          <button className="hover:text-marca">Salir</button>
        </form>
      </div>
    </div>
  );
}
