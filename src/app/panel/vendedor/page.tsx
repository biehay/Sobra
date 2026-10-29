import type { Metadata } from "next";
import Link from "next/link";
import { Aviso } from "@/components/aviso";
import { PestanasPanel } from "@/components/pestanas-panel";
import { EtiquetaEstado } from "@/components/etiqueta-estado";
import { DatosOperacion } from "@/components/datos-operacion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { exigirRol } from "@/lib/sesion";
import { visitasDeMisLotes } from "@/lib/visitas";
import { busquedasPublicas } from "@/lib/busquedas";
import { reputacionDe } from "@/lib/reputacion";
import { TarjetaReputacion } from "@/components/reputacion";
import { BotonEnviar } from "@/components/boton-enviar";
import { EstadoReclamo, FormReclamo } from "@/components/reclamo";
import { MODOS_RETIRO, pesos, proximaBaja, type Lote, type Oferta, type Reclamo } from "@/lib/datos";
import { cambiarEstadoLote, confirmarRetiro, responderOferta } from "../acciones";

export const metadata: Metadata = { title: "Mis ventas" };

export default async function PanelVendedor({ searchParams }: PageProps<"/panel/vendedor">) {
  const perfil = await exigirRol("usuario");
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
        .in("estado", ["pendiente", "aceptada", "pagada", "completada", "reembolsada"])
        .order("created_at", { ascending: false })
    : { data: [] };
  const ofertas = (ofertasData ?? []) as Oferta[];

  const { data: reclamosData } = ofertas.length
    ? await supabase.from("reclamos").select("*").in("oferta_id", ofertas.map((o) => o.id)).order("created_at", { ascending: false })
    : { data: [] };
  const [visitas, demanda] = await Promise.all([visitasDeMisLotes(lotes.map((l) => l.id)), busquedasPublicas()]);
  const compradores = [...new Set(ofertas.filter((o) => o.estado === "pendiente").map((o) => o.comprador_id))];
  const reputaciones = new Map(await Promise.all(compradores.map(async (id) => [id, await reputacionDe(id)] as const)));
  const lotesConOfertas = new Set(ofertas.map((o) => o.lote_id));
  const reclamos = new Map<string, Reclamo>();
  for (const r of (reclamosData ?? []) as Reclamo[]) if (!reclamos.has(r.oferta_id)) reclamos.set(r.oferta_id, r);

  return (
    <div className="contenedor py-10">
      <PestanasPanel activa="ventas" />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Mis ventas</h1>
          <p className="text-stone-600">
            Hola, {perfil.nombre.split(" ")[0]}
            {perfil.empresa && ` · ${perfil.empresa}`}
          </p>
        </div>
        <Link href="/panel/vendedor/lotes/nuevo" className="btn">+ Publicar lote</Link>
      </div>

      <div className="mt-6">
        <Aviso ok={ok} error={error} />
      </div>

      {demanda.length > 0 && (
        <section className="mt-6 rounded-xl bg-celeste-claro p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-bold text-petroleo">Lo que se está buscando</h2>
            <Link href="/buscados" className="text-sm font-semibold text-celeste-oscuro hover:underline">Ver todo →</Link>
          </div>
          <p className="text-sm text-petroleo/80">Si te sobró algo de esto, publicalo: a quien lo busca le avisamos apenas se publica.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {demanda.slice(0, 8).map((b, i) => (
              <span key={i} className="rounded-full bg-white px-3 py-1 text-sm text-petroleo">
                {b.texto}
                {b.zona && <span className="text-stone-500"> · {b.zona}</span>}
              </span>
            ))}
          </div>
        </section>
      )}

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
                      Recibida el {new Date(oferta.created_at).toLocaleDateString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · Comprador verificado · {MODOS_RETIRO[oferta.retiro]}
                      {oferta.comision != null && ` · Recibís ${pesos(oferta.monto - oferta.comision)} (comisión ${pesos(oferta.comision)})`}
                    </p>
                    {oferta.mensaje && <p className="mt-2 text-sm italic text-stone-600">“{oferta.mensaje}”</p>}
                    {reputaciones.get(oferta.comprador_id) && (
                      <div className="mt-2">
                        <TarjetaReputacion r={reputaciones.get(oferta.comprador_id)!} como="comprador" compacta />
                      </div>
                    )}
                  </div>
                  <EtiquetaEstado estado={oferta.estado} tipo="oferta" />
                </div>
                {oferta.estado === "pendiente" && (
                  <form action={responderOferta} className="flex gap-2">
                    <input type="hidden" name="id" value={oferta.id} />
                    <BotonEnviar
                      name="aceptar"
                      value="si"
                      className="btn"
                      pendiente="Aceptando..."
                      confirmar={`¿Aceptás ${pesos(oferta.monto)}? El lote queda reservado para este comprador y se rechazan las demás ofertas.`}
                    >
                      Aceptar
                    </BotonEnviar>
                    <BotonEnviar name="aceptar" value="no" className="btn-sec" pendiente="Rechazando..." confirmar="¿Rechazás esta oferta?">
                      Rechazar
                    </BotonEnviar>
                  </form>
                )}
                {oferta.estado === "aceptada" && (
                  <p className="text-sm text-stone-600">Esperando el pago del comprador. Te avisamos cuando esté acreditado.</p>
                )}
                {(oferta.estado === "pagada" || oferta.estado === "completada") && (
                  <DatosOperacion ofertaId={oferta.id} vista="vendedor" />
                )}
                {reclamos.get(oferta.id) && <EstadoReclamo reclamo={reclamos.get(oferta.id)!} />}
                {oferta.estado === "pagada" && reclamos.get(oferta.id)?.estado !== "abierto" && (
                  <>
                    <form action={confirmarRetiro} className="rounded-lg border border-stone-200 p-4">
                      <input type="hidden" name="id" value={oferta.id} />
                      <label htmlFor={`codigo-${oferta.id}`} className="etiqueta">Código de retiro</label>
                      <p className="mb-2 text-sm text-stone-600">
                        Cuando el comprador revise el material, te da un código de 6 dígitos. Cargalo para completar la venta.
                      </p>
                      <div className="flex gap-2">
                        <input
                          id={`codigo-${oferta.id}`}
                          name="codigo"
                          required
                          inputMode="numeric"
                          autoComplete="off"
                          pattern="[0-9 ]{6,8}"
                          maxLength={8}
                          placeholder="123456"
                          className="campo max-w-40 text-center font-mono text-lg tracking-widest"
                        />
                        <BotonEnviar className="btn" pendiente="Verificando...">Confirmar retiro</BotonEnviar>
                      </div>
                    </form>
                    <FormReclamo ofertaId={oferta.id} motivos={["no_se_presento", "otro"]} desde="ventas" />
                  </>
                )}
                {oferta.estado === "completada" && (
                  <p className="text-sm text-stone-600">
                    {oferta.liquidada_at
                      ? `Te transferimos ${pesos(oferta.monto - (oferta.comision ?? 0))} el ${new Date(oferta.liquidada_at).toLocaleDateString("es-AR")}.`
                      : `Retiro confirmado. Te transferimos ${pesos(oferta.monto - (oferta.comision ?? 0))} en los próximos días hábiles.`}
                    {oferta.comprobante && (
                      <>
                        {" "}
                        <a href={`/panel/cobros/comprobante/${oferta.id}`} target="_blank" rel="noreferrer" className="font-semibold text-marca hover:underline">
                          Ver comprobante
                        </a>
                      </>
                    )}
                  </p>
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
                  <LineaVisitas lote={lote} visitas={visitas.get(lote.id)} tieneOfertas={lotesConOfertas.has(lote.id)} />
                  {lote.baja_semanal_pct != null && lote.estado === "publicado" && (
                    <p className="text-sm text-celeste-oscuro">
                      ↓ Baja {lote.baja_semanal_pct}% por semana
                      {proximaBaja(lote) && ` · próxima baja el ${proximaBaja(lote)!.toLocaleDateString("es-AR")}`}
                    </p>
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
      <BotonEnviar
        className={`${peligro ? "btn-peligro" : "btn-sec"} px-3 py-1.5`}
        pendiente="..."
        confirmar={estado === "eliminar" ? "¿Eliminás este lote? No se puede deshacer." : undefined}
      >
        {texto}
      </BotonEnviar>
    </form>
  );
}

function diasDesde(fecha: string | null) {
  return fecha ? (Date.now() - new Date(fecha).getTime()) / 86_400_000 : 0;
}

// Visitas del lote y, si lo miran pero nadie oferta, una sugerencia de precio.
function LineaVisitas({ lote, visitas, tieneOfertas }: { lote: Lote; visitas?: { semana: number; total: number }; tieneOfertas: boolean }) {
  if (!["publicado", "reservado", "vendido"].includes(lote.estado)) return null;
  const semana = visitas?.semana ?? 0;
  const diasPublicado = diasDesde(lote.publicado_at);
  const sugerirBaja = lote.estado === "publicado" && !tieneOfertas && diasPublicado >= 7 && semana >= 15;
  return (
    <>
      <p className="text-sm text-stone-500">
        👁 {semana} {semana === 1 ? "visita" : "visitas"} en los últimos 7 días · {visitas?.total ?? 0} en total
      </p>
      {sugerirBaja && (
        <p className="text-sm text-amber-800">
          Lo miran, pero nadie ofertó todavía: quizás conviene bajar un poco el precio. Escribinos y lo ajustamos.
        </p>
      )}
    </>
  );
}
