import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { dosPasos, obtenerPerfil } from "@/lib/sesion";
import { linkWhatsapp } from "@/lib/datos";
import { Verificar } from "../dos-pasos";

export const metadata: Metadata = { title: "Ingresá el código" };

export default async function VerificarDosPasos({ searchParams }: PageProps<"/seguridad/verificar">) {
  const { volver: volverParam } = await searchParams;
  const volver = typeof volverParam === "string" ? volverParam : "/panel";
  const perfil = await obtenerPerfil();
  if (!perfil) redirect(`/ingresar?volver=${encodeURIComponent(volver)}`);

  const { activa, verificada } = await dosPasos();
  if (!activa) redirect(`/seguridad/activar?volver=${encodeURIComponent(volver)}`);
  if (verificada) redirect(volver);

  return (
    <div className="contenedor max-w-md py-16">
      <h1 className="text-3xl font-bold">Ingresá el código</h1>
      <p className="mt-2 text-stone-600">Abrí la app autenticadora de tu celular y escribí el código de Sobrá.</p>
      <div className="mt-6">
        <Verificar volver={volver} />
      </div>
      <div className="mt-6 flex justify-center gap-4 text-sm text-stone-500">
        <a
          href={linkWhatsapp(`Hola, soy ${perfil.nombre} y perdí acceso a mi app autenticadora de Sobrá.`)}
          target="_blank"
          rel="noreferrer"
          className="hover:text-marca"
        >
          Perdí el celular
        </a>
        <form action="/salir" method="post">
          <button className="hover:text-marca">Salir</button>
        </form>
      </div>
    </div>
  );
}
