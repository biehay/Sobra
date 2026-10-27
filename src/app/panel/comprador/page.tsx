import type { Metadata } from "next";
import Link from "next/link";
import { Aviso } from "@/components/aviso";
import { EtiquetaEstado } from "@/components/etiqueta-estado";
import { DatosOperacion } from "@/components/datos-operacion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { exigirRol } from "@/lib/sesion";
import { MODOS_RETIRO, linkWhatsapp, pesos, type Oferta } from "@/lib/datos";
import { cancelarOferta } from "../acciones";

export const metadata: Metadata = { title: "Mis compras" };

type OfertaConLote = Oferta & { lotes: { titulo: string } | null };

export default async function PanelComprador({ searchParams }: PageProps<"/panel/comprador">) {
  const perfil = await exigirRol("comprador");
  const { ok, error } = await searchParams;
  const supabase = await crearClienteServidor();
  const { data } = await supabase
    .from("ofertas")
    .select("*, lotes(titulo)")
    .eq("comprador_id", perfil.id)
    .order("created_at", { ascending: false });
  const ofertas = (data ?? []) as OfertaConLote[];

  return (
    <div className="contenedor py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-3xl font-bold">Mis compras</h1>
        <Link href="/lotes" className="btn">Buscar lotes</Link>
      </div>

      <div className="mt-6 space-y-3">
        <Aviso ok={ok} error={error} />
        {!perfil.verificado && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <strong>Tu cuenta está en verificación.</strong> Cuando esté lista vas a poder ofertar.{" "}
            <a
              href={linkWhatsapp(`Hola, soy ${perfil.nombre} y quiero verificar mi cuenta de comprador en Sobrá.`)}
              target="_blank"
              rel="noreferrer"
              className="font-semibold underline"
            >
              Escribinos para acelerarlo
            </a>
            .
          </div>
        )}
      </div>

      <section className="mt-8 space-y-3">
        {ofertas.length ? (
          ofertas.map((oferta) => (
            <div key={oferta.id} className="tarjeta space-y-3 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Link href={`/lotes/${oferta.lote_id}`} className="font-semibold hover:text-marca">
                    {oferta.lotes?.titulo ?? "Lote"}
                  </Link>
                  <p className="text-2xl font-bold">{pesos(oferta.monto)}</p>
                  <p className="text-sm text-stone-500">{MODOS_RETIRO[oferta.retiro]}</p>
                </div>
                <EtiquetaEstado estado={oferta.estado} tipo="oferta" />
              </div>

              {oferta.estado === "aceptada" && (
                <div className="rounded-lg bg-blue-50 p-4 text-sm text-blue-900">
                  <p className="font-semibold">¡El vendedor aceptó tu oferta! Falta el pago.</p>
                  <p className="mt-1">
                    Transferí {pesos(oferta.monto)} a: <strong>{process.env.NEXT_PUBLIC_DATOS_TRANSFERENCIA}</strong>. Retenemos el
                    dinero hasta que retirás el material. Cuando lo acreditemos te mostramos la dirección y el contacto.
                  </p>
                  <a
                    href={linkWhatsapp(`Hola, transferí ${pesos(oferta.monto)} por el lote "${oferta.lotes?.titulo}". Te paso el comprobante.`)}
                    target="_blank"
                    rel="noreferrer"
                    className="btn mt-3"
                  >
                    Enviar comprobante por WhatsApp
                  </a>
                </div>
              )}

              {(oferta.estado === "pagada" || oferta.estado === "completada") && (
                <DatosOperacion ofertaId={oferta.id} vista="comprador" />
              )}

              {(oferta.estado === "pendiente" || oferta.estado === "aceptada") && (
                <form action={cancelarOferta}>
                  <input type="hidden" name="id" value={oferta.id} />
                  <button className="text-sm text-stone-500 underline hover:text-red-700">Cancelar oferta</button>
                </form>
              )}
            </div>
          ))
        ) : (
          <p className="tarjeta p-8 text-center text-stone-500">
            Todavía no hiciste ofertas.{" "}
            <Link href="/lotes" className="font-semibold text-marca hover:underline">Mirá los lotes disponibles</Link>.
          </p>
        )}
      </section>
    </div>
  );
}
