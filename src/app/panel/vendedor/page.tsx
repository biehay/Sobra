import type { Metadata } from "next";
import Link from "next/link";
import { Aviso } from "@/components/aviso";
import { EtiquetaEstado } from "@/components/etiqueta-estado";
import { DatosOperacion } from "@/components/datos-operacion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { exigirRol } from "@/lib/sesion";
import { MODOS_RETIRO, pesos, type Lote, type Oferta } from "@/lib/datos";
import { cambiarEstadoLote, responderOferta } from "../acciones";

export const metadata: Metadata = { title: "Panel del vendedor" };

export default async function PanelVendedor({ searchParams }: PageProps<"/panel/vendedor">) {
  const perfil = await exigirRol("vendedor");
  const { ok, error } = await searchParams;
  const supabase = await crearClienteServidor();

  const { data: lotesData } = await supabase
    .from("lotes")
    .select("*")
    .eq("vendedor_id", perfil.id)
    .order("created_at", { ascending: false });
  const lotes = (lotesData ?? []) as Lote[];
  const titulos = new Map(lotes.map((l) => [l.id, l.titulo]));

  const { data: ofertasData } = lotes.length
    ? await supabase
        .from("ofertas")
        .select("*")
        .in("lote_id", lotes.map((l) => l.id))
        .in("estado", ["pendiente", "aceptada", "pagada", "completada"])
        .order("created_at", { ascending: false })
    : { data: [] };
  const ofertas = (ofertasData ?? []) as Oferta[];

  return (
    <div className="contenedor py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Hola, {perfil.nombre.split(" ")[0]}</h1>
          <p className="text-stone-600">{perfil.empresa}</p>
        </div>
        <Link href="/panel/vendedor/lotes/nuevo" className="btn">+ Publicar lote</Link>
      </div>

      <div className="mt-6">
        <Aviso ok={ok} error={error} />
      </div>

      <section className="mt-8">
        <h2 className="mb-4 text-xl font-bold">Ofertas recibidas</h2>
        {ofertas.length ? (
          <div className="space-y-3">
            {ofertas.map((oferta) => (
              <div key={oferta.id} className="tarjeta space-y-3 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{titulos.get(oferta.lote_id)}</p>
                    <p className="text-2xl font-bold">{pesos(oferta.monto)}</p>
                    <p className="text-sm text-stone-500">
                      Comprador verificado · {MODOS_RETIRO[oferta.retiro]}
                      {oferta.comision != null && ` · Recibís ${pesos(oferta.monto - oferta.comision)} (comisión ${pesos(oferta.comision)})`}
                    </p>
                    {oferta.mensaje && <p className="mt-2 text-sm italic text-stone-600">“{oferta.mensaje}”</p>}
                  </div>
                  <EtiquetaEstado estado={oferta.estado} tipo="oferta" />
                </div>
                {oferta.estado === "pendiente" && (
                  <form action={responderOferta} className="flex gap-2">
                    <input type="hidden" name="id" value={oferta.id} />
                    <button name="aceptar" value="si" className="btn">Aceptar</button>
                    <button name="aceptar" value="no" className="btn-sec">Rechazar</button>
                  </form>
                )}
                {oferta.estado === "aceptada" && (
                  <p className="text-sm text-stone-600">Esperando el pago del comprador. Te avisamos cuando esté acreditado.</p>
                )}
                {(oferta.estado === "pagada" || oferta.estado === "completada") && (
                  <DatosOperacion ofertaId={oferta.id} vista="vendedor" />
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="tarjeta p-6 text-stone-500">Todavía no recibiste ofertas.</p>
        )}
      </section>

      <section className="mt-10">
        <h2 className="mb-4 text-xl font-bold">Mis lotes</h2>
        {lotes.length ? (
          <div className="tarjeta divide-y divide-stone-100">
            {lotes.map((lote) => (
              <div key={lote.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{lote.titulo}</p>
                  <p className="text-sm text-stone-500">
                    Pedís {pesos(lote.precio_pedido)}
                    {lote.precio_publicado != null && ` · Publicado a ${pesos(lote.precio_publicado)}`}
                  </p>
                  {lote.estado === "rechazado" && lote.nota_admin && (
                    <p className="text-sm text-amber-800">Observaciones: {lote.nota_admin}</p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <EtiquetaEstado estado={lote.estado} tipo="lote" />
                  {lote.estado === "publicado" && (
                    <Link href={`/lotes/${lote.id}`} className="btn-sec px-3 py-1.5">Ver</Link>
                  )}
                  {!["reservado", "vendido"].includes(lote.estado) && (
                    <Link href={`/panel/vendedor/lotes/${lote.id}`} className="btn-sec px-3 py-1.5">Editar</Link>
                  )}
                  {lote.estado === "publicado" && <BotonEstado id={lote.id} estado="pausado" texto="Pausar" />}
                  {lote.estado === "pausado" && <BotonEstado id={lote.id} estado="en_revision" texto="Reactivar" />}
                  {["borrador", "rechazado"].includes(lote.estado) && (
                    <BotonEstado id={lote.id} estado="eliminar" texto="Eliminar" peligro />
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="tarjeta p-8 text-center">
            <p className="text-stone-600">Todavía no cargaste ningún lote.</p>
            <Link href="/panel/vendedor/lotes/nuevo" className="btn mt-4">Publicar mi primer lote</Link>
          </div>
        )}
      </section>
    </div>
  );
}

function BotonEstado({ id, estado, texto, peligro }: { id: string; estado: string; texto: string; peligro?: boolean }) {
  return (
    <form action={cambiarEstadoLote}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="estado" value={estado} />
      <button className={`${peligro ? "btn-peligro" : "btn-sec"} px-3 py-1.5`}>{texto}</button>
    </form>
  );
}
