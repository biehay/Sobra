import type { Metadata } from "next";
import Link from "next/link";
import { Aviso } from "@/components/aviso";
import { BotonEnviar } from "@/components/boton-enviar";
import { EtiquetaEstado } from "@/components/etiqueta-estado";
import { crearClienteServidor } from "@/lib/supabase/server";
import { exigirRol } from "@/lib/sesion";
import { CONDICIONES, linkWhatsapp, pesos, precioSugerido, urlFoto, type Lote, type Oferta, type Perfil, MOTIVOS_RECLAMO, type Reclamo } from "@/lib/datos";
import { adjuntarComprobante, avanzarOperacion, liquidar, resolverReclamo, revisarLote, verificarUsuario } from "./acciones";

export const metadata: Metadata = { title: "Admin" };

type Contacto = Pick<Perfil, "nombre" | "empresa" | "telefono">;
type LoteConVendedor = Lote & { perfiles: Contacto | null };
type OfertaConDatos = Oferta & { lotes: { titulo: string } | null; perfiles: Contacto | null };

export default async function Admin({ searchParams }: PageProps<"/admin">) {
  await exigirRol("admin");
  const { ok, error } = await searchParams;
  const supabase = await crearClienteServidor();

  const [{ data: lotesData }, { data: ofertasData }, { data: perfilesData }, { data: reclamosData }] = await Promise.all([
    supabase.from("lotes").select("*, perfiles(nombre, empresa, telefono)").order("created_at", { ascending: false }),
    supabase
      .from("ofertas")
      .select("*, lotes(titulo), perfiles(nombre, empresa, telefono)")
      .order("updated_at", { ascending: false }),
    supabase.from("perfiles").select("*").order("created_at", { ascending: false }),
    supabase.from("reclamos").select("*").eq("estado", "abierto").order("created_at"),
  ]);
  const lotes = (lotesData ?? []) as LoteConVendedor[];
  const ofertas = (ofertasData ?? []) as OfertaConDatos[];
  const perfiles = (perfilesData ?? []) as Perfil[];
  const reclamos = (reclamosData ?? []) as Reclamo[];
  const perfilPorId = new Map(perfiles.map((p) => [p.id, p]));
  const ofertaPorId = new Map(ofertas.map((o) => [o.id, o]));
  const vendedorDeLote = new Map(lotes.map((l) => [l.id, l.vendedor_id]));
  const conReclamo = new Set(reclamos.map((r) => r.oferta_id));

  const enRevision = lotes.filter((l) => l.estado === "en_revision");
  const operaciones = ofertas.filter((o) => o.estado === "aceptada" || o.estado === "pagada");
  const sinVerificar = perfiles.filter((p) => p.rol !== "admin" && !p.verificado);
  const aLiquidar = ofertas.filter((o) => o.estado === "completada" && !o.liquidada_at);
  const sinComprobante = ofertas.filter((o) => o.liquidada_at && !o.comprobante);
  const vendedorDe = new Map(lotes.map((l) => [l.id, l.perfiles]));

  // Métricas clave del Lean Canvas.
  const publicadosAlgunaVez = lotes.filter((l) => l.publicado_at).length;
  const vendidos = lotes.filter((l) => l.estado === "vendido").length;
  const completadas = ofertas.filter((o) => o.estado === "completada");
  const volumen = completadas.reduce((total, o) => total + Number(o.monto), 0);
  const comisiones = completadas.reduce((total, o) => total + Number(o.comision ?? 0), 0);
  const metricas = [
    ["Lotes publicados", publicadosAlgunaVez],
    ["% vendidos", publicadosAlgunaVez ? `${Math.round((vendidos / publicadosAlgunaVez) * 100)}%` : "-"],
    ["Volumen transaccionado", pesos(volumen)],
    ["Comisiones", pesos(comisiones)],
    ["Usuarios que publicaron", new Set(lotes.map((l) => l.vendedor_id)).size],
    ["Usuarios verificados", perfiles.filter((p) => p.rol === "usuario" && p.verificado).length],
  ];

  return (
    <div className="contenedor space-y-10 py-10">
      <div>
        <h1 className="text-3xl font-bold">Administración</h1>
        <div className="mt-4">
          <Aviso ok={ok} error={error} />
        </div>
      </div>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {metricas.map(([titulo, valor]) => (
          <div key={titulo} className="tarjeta p-4">
            <p className="text-xs text-stone-500">{titulo}</p>
            <p className="mt-1 text-xl font-bold">{valor}</p>
          </div>
        ))}
      </section>

      {reclamos.length > 0 && (
        <section>
          <h2 className="mb-4 text-xl font-bold text-red-700">Reclamos abiertos ({reclamos.length})</h2>
          <div className="space-y-4">
            {reclamos.map((r) => {
              const o = ofertaPorId.get(r.oferta_id);
              const comprador = o ? perfilPorId.get(o.comprador_id) : undefined;
              const vendedor = o ? perfilPorId.get(vendedorDeLote.get(o.lote_id) ?? "") : undefined;
              const autor = r.autor_id === o?.comprador_id ? "comprador" : "vendedor";
              return (
                <div key={r.id} className="tarjeta grid gap-5 border-red-200 p-5 lg:grid-cols-[3fr_2fr]">
                  <div className="space-y-2 text-sm">
                    <p className="text-lg font-semibold">{o?.lotes?.titulo}</p>
                    <p>
                      <strong>Abierto por el {autor}:</strong> {MOTIVOS_RECLAMO[r.motivo]} ·{" "}
                      {new Date(r.created_at).toLocaleDateString("es-AR")}
                    </p>
                    <p className="whitespace-pre-line rounded-lg bg-stone-50 p-3 italic text-stone-700">{r.detalle}</p>
                    <p>Operación: {pesos(o?.monto)} · comisión {pesos(o?.comision)}</p>
                    <div className="flex flex-wrap gap-4">
                      {[
                        ["Comprador", comprador],
                        ["Vendedor", vendedor],
                      ].map(([rol, p]) => {
                        const persona = p as Perfil | undefined;
                        return (
                          <p key={rol as string}>
                            {rol as string}: {persona?.empresa || persona?.nombre}
                            {persona?.telefono && (
                              <a
                                href={linkWhatsapp(`Hola, te escribo de Sobrá por el reclamo de "${o?.lotes?.titulo}".`, persona.telefono)}
                                target="_blank"
                                rel="noreferrer"
                                className="ml-2 font-semibold text-marca hover:underline"
                              >
                                WhatsApp
                              </a>
                            )}
                          </p>
                        );
                      })}
                    </div>
                  </div>
                  <form action={resolverReclamo} className="space-y-2">
                    <input type="hidden" name="id" value={r.id} />
                    <label htmlFor={`resolucion-${r.id}`} className="etiqueta">Resolución (la ven las dos partes)</label>
                    <textarea id={`resolucion-${r.id}`} name="resolucion" rows={3} required className="campo" />
                    <div className="grid gap-2">
                      <BotonEnviar name="resultado" value="devolver" className="btn-peligro" pendiente="Resolviendo..." confirmar="¿Devolvés el pago al comprador? El lote queda pausado.">
                        Devolver el pago al comprador
                      </BotonEnviar>
                      <BotonEnviar name="resultado" value="completar" className="btn" pendiente="Resolviendo..." confirmar="¿Completás la venta? El lote queda vendido.">
                        Completar la venta
                      </BotonEnviar>
                      <BotonEnviar name="resultado" value="sin_cambios" className="btn-sec" pendiente="Resolviendo..." confirmar="¿Cerrás el reclamo sin cambios? La operación sigue esperando el retiro.">
                        Cerrar sin cambios (sigue el retiro)
                      </BotonEnviar>
                    </div>
                  </form>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-4 text-xl font-bold">Lotes para revisar ({enRevision.length})</h2>
        {enRevision.length ? (
          <div className="space-y-4">
            {enRevision.map((lote) => {
              const sugerido = precioSugerido(lote.precio_lista, lote.condicion);
              return (
                <div key={lote.id} className="tarjeta grid gap-5 p-5 lg:grid-cols-[2fr_1fr]">
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-stone-500">{lote.categoria} · {lote.zona}{lote.localidad && `, ${lote.localidad}`}</p>
                      <p className="text-lg font-semibold">{lote.titulo}</p>
                      <p className="text-sm text-stone-600">
                        {CONDICIONES[lote.condicion]} · {lote.perfiles?.empresa ?? lote.perfiles?.nombre}
                        {lote.perfiles?.telefono && (
                          <a href={linkWhatsapp(`Hola, te escribo de Sobrá por el lote "${lote.titulo}".`, lote.perfiles.telefono)} target="_blank" rel="noreferrer" className="ml-2 font-semibold text-marca hover:underline">
                            WhatsApp
                          </a>
                        )}
                      </p>
                    </div>
                    <div className="flex gap-2 overflow-x-auto">
                      {lote.fotos.map((foto) => (
                        <a key={foto} href={urlFoto(foto)} target="_blank" rel="noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={urlFoto(foto)} alt="" className="h-24 w-24 rounded-lg border border-stone-200 object-cover" />
                        </a>
                      ))}
                    </div>
                    {lote.items.length > 0 && (
                      <ul className="text-sm text-stone-700">
                        {lote.items.map((item, i) => (
                          <li key={i}>• {item.nombre}: {item.cantidad} {item.unidad}</li>
                        ))}
                      </ul>
                    )}
                    {lote.descripcion && <p className="whitespace-pre-line text-sm text-stone-600">{lote.descripcion}</p>}
                  </div>
                  <div className="space-y-3">
                    <dl className="grid grid-cols-2 gap-2 text-sm">
                      <dt className="text-stone-500">Precio de lista</dt>
                      <dd className="text-right">{pesos(lote.precio_lista)}</dd>
                      <dt className="text-stone-500">Pide</dt>
                      <dd className="text-right font-semibold">{pesos(lote.precio_pedido)}</dd>
                      <dt className="text-stone-500">Sugerido</dt>
                      <dd className="text-right">{pesos(sugerido)}</dd>
                    </dl>
                    <form action={revisarLote} className="space-y-2">
                      <input type="hidden" name="id" value={lote.id} />
                      <input type="hidden" name="precio_sugerido" value={sugerido ?? ""} />
                      <label htmlFor={`precio-${lote.id}`} className="etiqueta">Precio de publicación</label>
                      <input id={`precio-${lote.id}`} name="precio_publicado" type="number" min={1} defaultValue={lote.precio_pedido} className="campo" />
                      <label htmlFor={`peso-${lote.id}`} className="etiqueta">Peso aproximado (kg)</label>
                      <input id={`peso-${lote.id}`} name="peso_kg" type="number" min={1} step="any" required defaultValue={lote.peso_kg ?? ""} placeholder="Revisalo con las fotos" className="campo" />
                      <BotonEnviar name="decision" value="aprobar" className="btn w-full" pendiente="Publicando...">Aprobar y publicar</BotonEnviar>
                    </form>
                    <form action={revisarLote} className="space-y-2">
                      <input type="hidden" name="id" value={lote.id} />
                      <textarea name="nota" rows={2} className="campo" placeholder="Qué tiene que corregir (fotos, precio, datos...)" />
                      <BotonEnviar name="decision" value="rechazar" className="btn-sec w-full">Devolver con observaciones</BotonEnviar>
                    </form>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="tarjeta p-6 text-stone-500">No hay lotes pendientes de revisión.</p>
        )}
      </section>

      <section>
        <h2 className="mb-4 text-xl font-bold">Operaciones en curso ({operaciones.length})</h2>
        {operaciones.length ? (
          <div className="tarjeta divide-y divide-stone-100">
            {operaciones.map((o) => (
              <div key={o.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <Link href={`/lotes/${o.lote_id}`} className="font-semibold hover:text-marca">{o.lotes?.titulo}</Link>
                  <p className="text-sm text-stone-600">
                    {pesos(o.monto)} · comisión {pesos(o.comision)} · a liquidar {pesos(o.monto - (o.comision ?? 0))}
                  </p>
                  <p className="text-sm text-stone-500">
                    Comprador: {o.perfiles?.nombre}
                    {o.perfiles?.telefono && (
                      <a href={linkWhatsapp(`Hola, te escribo de Sobrá por tu compra "${o.lotes?.titulo}".`, o.perfiles.telefono)} target="_blank" rel="noreferrer" className="ml-2 font-semibold text-marca hover:underline">
                        WhatsApp
                      </a>
                    )}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <EtiquetaEstado estado={o.estado} tipo="oferta" />
                  <form action={avanzarOperacion} className="flex gap-2">
                    <input type="hidden" name="id" value={o.id} />
                    {o.estado === "aceptada" ? (
                      <>
                        <BotonEnviar name="paso" value="pago" className="btn px-3 py-1.5" pendiente="..." confirmar={`¿Confirmás que recibiste ${pesos(o.monto)}? El comprador y el vendedor van a ver los datos del otro.`}>
                          Confirmar pago
                        </BotonEnviar>
                        <BotonEnviar name="paso" value="cancelar" className="btn-peligro px-3 py-1.5" pendiente="..." confirmar="¿Cancelás la operación? El lote vuelve a publicarse.">
                          Cancelar
                        </BotonEnviar>
                      </>
                    ) : conReclamo.has(o.id) ? (
                      <span className="text-sm font-semibold text-red-700">Con reclamo abierto</span>
                    ) : (
                      <BotonEnviar name="paso" value="completar" className="btn-sec px-3 py-1.5" pendiente="..." confirmar="¿Confirmás el retiro sin el código? Usalo solo si el vendedor no pudo cargarlo.">
                        Confirmar retiro
                      </BotonEnviar>
                    )}
                  </form>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="tarjeta p-6 text-stone-500">No hay operaciones en curso.</p>
        )}
      </section>

      <section>
        <h2 className="mb-4 text-xl font-bold">Liquidaciones pendientes ({aLiquidar.length})</h2>
        {aLiquidar.length ? (
          <div className="tarjeta divide-y divide-stone-100">
            {aLiquidar.map((o) => {
              const vendedor = vendedorDe.get(o.lote_id);
              return (
                <div key={o.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div>
                    <p className="font-semibold">{o.lotes?.titulo}</p>
                    <p className="text-sm text-stone-600">
                      Transferir <strong>{pesos(o.monto - (o.comision ?? 0))}</strong> a {vendedor?.empresa ?? vendedor?.nombre}
                      {o.completada_at && ` · retirado el ${new Date(o.completada_at).toLocaleDateString("es-AR")}`}
                    </p>
                  </div>
                  <form action={liquidar} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="id" value={o.id} />
                    <label className="text-sm text-stone-600">
                      <span className="sr-only">Comprobante de la transferencia</span>
                      <input name="comprobante" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="max-w-56 text-xs file:mr-2 file:rounded-md file:border file:border-stone-300 file:bg-white file:px-2 file:py-1" />
                    </label>
                    <BotonEnviar className="btn px-3 py-1.5" pendiente="Registrando..." confirmar={`¿Ya le transferiste ${pesos(o.monto - (o.comision ?? 0))} al vendedor?`}>
                      Marcar transferido
                    </BotonEnviar>
                  </form>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="tarjeta p-6 text-stone-500">No hay liquidaciones pendientes.</p>
        )}
        <p className="mt-2 text-sm text-stone-500">
          Adjuntá el comprobante de la transferencia (PDF o imagen, hasta 5 MB): el vendedor lo ve y lo descarga en Cobros.
        </p>
      </section>

      {sinComprobante.length > 0 && (
        <section>
          <h2 className="mb-4 text-xl font-bold">Transferencias sin comprobante ({sinComprobante.length})</h2>
          <div className="tarjeta divide-y divide-stone-100">
            {sinComprobante.map((o) => (
              <div key={o.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-semibold">{o.lotes?.titulo}</p>
                  <p className="text-sm text-stone-600">
                    {pesos(o.monto - (o.comision ?? 0))} transferidos el {new Date(o.liquidada_at!).toLocaleDateString("es-AR")}
                  </p>
                </div>
                <form action={adjuntarComprobante} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="id" value={o.id} />
                  <input name="comprobante" type="file" required aria-label="Comprobante de la transferencia" accept="application/pdf,image/jpeg,image/png,image/webp" className="max-w-56 text-xs file:mr-2 file:rounded-md file:border file:border-stone-300 file:bg-white file:px-2 file:py-1" />
                  <BotonEnviar className="btn-sec px-3 py-1.5" pendiente="Subiendo...">Adjuntar</BotonEnviar>
                </form>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-4 text-xl font-bold">Usuarios ({perfiles.length}) · {sinVerificar.length} sin verificar</h2>
        <div className="tarjeta overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-left text-stone-500">
                <th className="p-3 font-medium">Nombre</th>
                <th className="p-3 font-medium">Rol</th>
                <th className="p-3 font-medium">Empresa / CUIT</th>
                <th className="p-3 font-medium">Zona</th>
                <th className="p-3 font-medium">Contacto</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {perfiles.map((p) => (
                <tr key={p.id} className="border-b border-stone-100 last:border-0">
                  <td className="p-3 font-medium">{p.nombre}</td>
                  <td className="p-3 capitalize">{p.rol}</td>
                  <td className="p-3">{[p.empresa, p.cuit].filter(Boolean).join(" · ") || "-"}</td>
                  <td className="p-3">{p.zona ?? "-"}</td>
                  <td className="p-3">
                    {p.telefono ? (
                      <a href={linkWhatsapp("Hola, te escribo de Sobrá.", p.telefono)} target="_blank" rel="noreferrer" className="text-marca hover:underline">
                        {p.telefono}
                      </a>
                    ) : "-"}
                  </td>
                  <td className="p-3 text-right">
                    {p.rol !== "admin" && (
                      <form action={verificarUsuario}>
                        <input type="hidden" name="id" value={p.id} />
                        {p.verificado ? (
                          <BotonEnviar name="verificado" value="no" className="text-xs text-stone-500 underline" pendiente="..." confirmar={`¿Le quitás la verificación a ${p.nombre}?`}>
                            Quitar verificación
                          </BotonEnviar>
                        ) : (
                          <BotonEnviar name="verificado" value="si" className="btn px-3 py-1.5" pendiente="...">Verificar</BotonEnviar>
                        )}
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
