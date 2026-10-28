import type { Metadata } from "next";
import { Aviso } from "@/components/aviso";
import { exigirRol } from "@/lib/sesion";
import { FormLote } from "../../form-lote";

export const metadata: Metadata = { title: "Publicar lote" };

export default async function NuevoLote({ searchParams }: PageProps<"/panel/vendedor/lotes/nuevo">) {
  const perfil = await exigirRol("usuario");
  const { error } = await searchParams;

  return (
    <div className="contenedor max-w-3xl py-10">
      <h1 className="text-3xl font-bold">Publicar un lote</h1>
      <p className="mb-6 mt-1 text-stone-600">Lo revisamos antes de publicarlo, normalmente en el día.</p>
      <div className="mb-4">
        <Aviso error={error} />
      </div>
      <FormLote usuarioId={perfil.id} />
    </div>
  );
}
