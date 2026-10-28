import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Aviso } from "@/components/aviso";
import { crearClienteServidor } from "@/lib/supabase/server";
import { exigirRol } from "@/lib/sesion";
import type { Lote } from "@/lib/datos";
import { FormLote } from "../../form-lote";

export const metadata: Metadata = { title: "Editar lote" };

export default async function EditarLote({ params, searchParams }: PageProps<"/panel/vendedor/lotes/[id]">) {
  const perfil = await exigirRol("usuario");
  const { id } = await params;
  const { error } = await searchParams;

  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("lotes").select("*").eq("id", id).eq("vendedor_id", perfil.id).maybeSingle();
  if (!data) notFound();
  const lote = data as Lote;
  const { data: retiro } = await supabase.from("lote_retiro").select("*").eq("lote_id", id).maybeSingle();
  const bloqueado = lote.estado === "reservado" || lote.estado === "vendido";

  return (
    <div className="contenedor max-w-3xl py-10">
      <Link href="/panel/vendedor" className="text-sm text-stone-500 hover:text-stone-800">← Mis ventas</Link>
      <h1 className="mt-2 text-3xl font-bold">Editar lote</h1>
      <div className="my-4 space-y-3">
        <Aviso error={error} />
        {lote.estado === "rechazado" && lote.nota_admin && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <strong>Observaciones de Sobrá:</strong> {lote.nota_admin}
          </p>
        )}
        {lote.estado === "publicado" && (
          <p className="rounded-lg border border-stone-200 bg-white px-4 py-3 text-sm text-stone-600">
            Este lote está publicado. Si lo modificás, vuelve a revisión antes de mostrarse otra vez.
          </p>
        )}
      </div>
      {bloqueado ? (
        <p className="tarjeta p-6 text-stone-600">Este lote tiene una operación en curso y ya no se puede editar.</p>
      ) : (
        <FormLote usuarioId={perfil.id} lote={lote} retiro={retiro} />
      )}
    </div>
  );
}
