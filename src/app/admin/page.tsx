import { nombreConMarca } from "@/lib/datos";
import type { Metadata } from "next";
import Link from "next/link";
import { Aviso } from "@/components/aviso";
import { BotonEnviar } from "@/components/boton-enviar";
import { EtiquetaEstado } from "@/components/etiqueta-estado";
import { crearClienteServidor } from "@/lib/supabase/server";
import { exigirRol } from "@/lib/sesion";
import { CONDICIONES, linkWhatsapp, pesos, precioSugerido, urlFoto, type Lote, type Oferta, type Perfil, MOTIVOS_RECLAMO, type Reclamo } from "@/lib/datos";
import { adjuntarComprobante, anularFalta, auditarMuestra, avanzarOperacion, devolverPublicado, liquidar, reabrirRechazado, resolverDenuncias, resolverReclamo, revisarLote, verificarUsuario } from "./acciones";
import { DIAS_DE_FALTA } from "@/lib/sanciones";
import { DENUNCIAS_PARA_BAJA, DENUNCIAS_PARA_PAUSAR, MOTIVOS_DENUNCIA, type MotivoDenuncia } from "@/lib/denuncias";
import { NOMBRE_MOTIVO, type Motivo } from "@/lib/moderacion-reglas";

export const metadata: Metadata = { title: "Admin" };

type Contacto = Pick<Perfil, "nombre" | "empresa" | "telefono">;
type LoteConVendedor = Lote & { perfiles: Contacto | null };
type OfertaConDatos = Oferta & { lotes: { titulo: string } | null; perfiles: Contacto | null };
type Denuncia = { id: string; lote_id: string | null; motivo: MotivoDenuncia; detalle: string; created_at: string };
type Moderacion = { lote_id: string; resultado: string; motivos: Motivo[]; aplicado: string; created_at: string; muestreo: boolean; auditoria: "acierto" | "error" | null };
type Falta = { id: string; usuario_id: string; origen: string; detalle: string; created_at: string };

// Qué hizo la moderación automática con el lote, para el admin.
const APLICADO: Record<string, string> = {
  dudoso: "La IA encontró algo para que lo mires",
  primera_publicacion: "Es la primera publicación del vendedor",
  limite_diario: "El vendedor pasó las 3 publicaciones automáticas del día",
  sin_fotos: "Aprobado por la IA, pero no tiene fotos",
  sin_peso: "Aprobado por la IA, pero falta el peso",
  sin_retiro: "Aprobado por la IA, pero falta la dirección de retiro",
  contacto: "Aprobado por la IA, pero tiene datos de contacto",
  precio: "Aprobado por la IA, pero pide más que el precio de lista",
};

function CajaModeracion({ m }: { m?: Moderacion }) {
  if (!m) return null;
  return (
    <div data-moderacion className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
      <p className="font-semibold">🤖 {APLICADO[m.aplicado] ?? "Moderación automática"}</p>
      {m.motivos.length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {m.motivos.map((x, i) => (
            <li key={i}>• <strong>{NOMBRE_MOTIVO[x.tipo] ?? x.tipo}:</strong> {x.detalle}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default async function Admin({ searchParams }: PageProps<"/admin">) {
  await exigirRol("admin");
  const { ok, error } = await searchParams;
  const supabase = await crearClienteServidor();

  const ahora = Date.parse(new Date().toISOString());
  const [{ data: lotesData }, { data: ofertasData }, { data: perfilesData }, { data: reclamosData }, { data: moderacionesData }, { data: denunciasData }, { data: faltasData }] = await Promise.all([
    supabase.from("lotes").select("*, perfiles(nombre, empresa, telefono)").order("created_at", { ascending: false }),
    supabase
      .from("ofertas")
      .select("*, lotes(titulo), perfiles(nombre, empresa, telefono)")
      .order("updated_at", { ascending: false }),
    supabase.from("perfiles").select("*").order("created_at", { ascending: false }),
    supabase.from("reclamos").select("*").eq("estado", "abierto").order("created_at"),
    supabase
      .from("moderaciones")
      .select("lote_id, resultado, motivos, aplicado, created_at, muestreo, auditoria")
      .gte("created_at", new Date(ahora - 90 * 86_400_000).toISOString())
      .order("created_at", { ascending: false })
      .limit(1000),
    supabase.from("denuncias").select("id, lote_id, motivo, detalle, created_at, estado").in("estado", ["abierta", "desestimada"]).order("created_at"),
    supabase
      .from("faltas")
      .select("id, usuario_id, origen, detalle, created_at")
      .eq("anulada", false)
      .gte("created_at", new Date(ahora - DIAS_DE_FALTA * 86_400_000).toISOString())
      .order("created_at"),
  ]);
  const faltasDe = new Map<string, Falta[]>();
  for (const f of (faltasData ?? []) as Falta[]) faltasDe.set(f.usuario_id, [...(faltasDe.get(f.usuario_id) ?? []), f]);
  // Control de la moderación: lo publicado al instante que salió sorteado para revisar, y cuánto acierta.
  const moderaciones = (moderacionesData ?? []) as Moderacion[];
  const auditadas = moderaciones.filter((m) => m.auditoria);
  const aciertos = auditadas.filter((m) => m.auditoria === "acierto").length;
  const sorteados = new Set(moderaciones.filter((m) => m.muestreo && !m.auditoria).map((m) => m.lote_id));
  // Cuántas denuncias de cada lote ya desestimó el admin (cuentan para la baja automática).
  const desestimadas = new Map<string, number>();
  for (const d of (denunciasData ?? []) as (Denuncia & { estado: string })[]) {
    if (d.lote_id && d.estado === "desestimada") desestimadas.set(d.lote_id, (desestimadas.get(d.lote_id) ?? 0) + 1);
  }
  // Denuncias abiertas, agrupadas por lote.
  const denunciasPorLote = new Map<string, Denuncia[]>();
  for (const d of (denunciasData ?? []) as (Denuncia & { estado: string })[]) {
    if (d.lote_id && d.estado === "abierta") denunciasPorLote.set(d.lote_id, [...(denunciasPorLote.get(d.lote_id) ?? []), d]);
  }
  // La última decisión de la moderación automática para cada lote.
  const moderacionDe = new Map<string, Moderacion>();
  for (const m of (moderacionesData ?? []) as Moderacion[]) if (!moderacionDe.has(m.lote_id)) moderacionDe.set(m.lote_id, m);
  const lotes = (lotesData ?? []) as LoteConVendedor[];
  const muestrasPendientes = lotes.filter((l) => sorteados.has(l.id) && l.estado === "publicado");
  const ofertas = (ofertasData ?? []) as OfertaConDatos[];
  const perfiles = (perfilesData ?? []) as Perfil[];
  const reclamos = (reclamosData ?? []) as Reclamo[];
  const perfilPorId = new Map(perfiles.map((p) => [p.id, p]));
  const ofertaPorId = new Map(ofertas.map((o) => [o.id, o]));
  const vendedorDeLote = new Map(lotes.map((l) => [l.id, l.vendedor_id]));
  const conReclamo = new Set(reclamos.map((r) => r.oferta_id));

  const enRevision = lotes.filter((l) => l.estado === "en_revision");
  // Rechazados por la moderación automática en la última semana: por si se equivocó.
  const rechazadosIA = lotes.filter((l) => {
    const m = moderacionDe.get(l.id);
    return l.estado === "rechazado" && m?.aplicado === "rechazado" && Date.parse(m.created_at) > ahora - 7 * 86_400_000;
  });
  // Publicados al instante por la moderación automática, de la última semana: para mirarlos después.
  const automaticos = lotes.filter(
    (l) => l.publicado_automatico && l.estado === "publicado" && l.publicado_at && Date.parse(l.publicado_at) > Date.parse(new Date().toISOString()) - 7 * 86_400_000,
  );
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
  // Cuánto mueve el boca a boca: visitas que llegaron por un link compartido (últimos 30 días).
  const { count: visitasCompartidas } = await supabase
    .from("visitas_lote")
    .select("lote_id", { count: "exact", head: true })
    .eq("compartido", true)
    .gte("dia", new Date(ahora - 30 * 86_400_000).toISOString().slice(0, 10));
  metricas.push(["Visitas por links compartidos (30 días)", visitasCompartidas ?? 0]);

  // Qué tipo de recomendación lleva a la gente a abrir lotes (últimos 30 días).
  const { data: recsData } = await supabase.rpc("metricas_recomendaciones");
  const recs = (recsData ?? []) as { origen: string; visitas: number }[];
  const totalVisitas = recs.reduce((t, r) => t + Number(r.visitas), 0);
  const NOMBRES_ORIGEN: Record<string, string> = {
    directo: "Llegaron solos (catálogo, búsqueda, links)",
    "rec-complemento": "Para completar la obra",
    "rec-busqueda": "Coincide con lo que busca",
    "rec-etapa": "Próxima etapa de la obra",
    "rec-viaje": "Mismo viaje de retiro",
    "rec-colectiva": "Quienes vieron esto también vieron",
    "rec-parecido": "Porque vio algo parecido",
    "rec-zona": "Cerca suyo",
    "rec-descuento": "Por descuento",
    "rec-descubrir": "Para descubrir",
    "rec-nuevo": "Recién publicado",
  };

  return (
    <div className="contenedor space-y-10 py-10">
      <div>
        <h1 className="text-3xl font-bold">Administración</h1>
        <div className="mt-4">
          <Aviso ok={ok} error={error} />
        </div>
      </div>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {metricas.map(([titulo, valor]) => (
          <div key={titulo} className="tarjeta p-4">
            <p className="text-xs text-stone-500">{titulo}</p>
            <p className="mt-1 text-xl font-bold">{valor}</p>
          </div>
        ))}
      </section>

      {totalVisitas > 0 && (
        <details className="tarjeta p-5">
          <summary className="cursor-pointer font-bold">Recomendaciones: de dónde llegan las visitas (últimos 30 días)</summary>
          <p className="mt-2 text-sm text-stone-500">Solo usuarios con cuenta. Sirve para ver qué tipo de recomendación funciona.</p>
          <ul className="mt-3 space-y-2 text-sm">
            {recs.map((r) => (
              <li key={r.origen} className="flex items-center gap-3">
                <span className="w-64 shrink-0">{NOMBRES_ORIGEN[r.origen] ?? r.origen}</span>
                <span className="h-2 rounded-full bg-celeste" style={{ width: `${Math.max(2, (Number(r.visitas) / totalVisitas) * 100)}%` }} />
                <span className="shrink-0 text-stone-600">{r.visitas} ({Math.round((Number(r.visitas) / totalVisitas) * 100)}%)</span>
              </li>
            ))}
          </ul>
        </details>
      )}

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
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="falta" value="si" className="accent-marca" />
                      Fue culpa del vendedor: sumarle una falta
                    </label>
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

      {automaticos.length > 0 && (
        <section data-publicados-al-instante>
          <h2 className="mb-1 text-xl font-bold">Publicados al instante ({automaticos.length})</h2>
          <p className="mb-4 text-sm text-stone-600">
            Los aprobó la moderación automática (IA y controles fijos) en la última semana. Mirá algunos de vez en cuando para controlar que no se equivoque; si algo no va, devolvelo con observaciones.
          </p>
          <div className="space-y-3">
            {automaticos.map((lote) => (
              <details key={lote.id} className="tarjeta p-4">
                <summary className="cursor-pointer">
                  <Link href={`/lotes/${lote.id}`} className="font-semibold hover:text-marca">{lote.titulo}</Link>
                  <span className="ml-2 text-sm text-stone-500">
                    {lote.perfiles?.empresa ?? lote.perfiles?.nombre} · {pesos(lote.precio_publicado ?? lote.precio_pedido)}
                  </span>
                </summary>
                <form action={devolverPublicado} className="mt-3 space-y-2">
                  <input type="hidden" name="id" value={lote.id} />
                  <textarea name="nota" required rows={2} className="campo" placeholder="Qué tiene que corregir el vendedor" />
                  <BotonEnviar className="btn-sec" pendiente="Devolviendo..." confirmar="¿Lo sacás de la publicación y se lo devolvés al vendedor?">
                    Devolver con observaciones
                  </BotonEnviar>
                </form>
              </details>
            ))}
          </div>
        </section>
      )}

      <section data-control-moderacion>
        <h2 className="mb-1 text-xl font-bold">Control de la moderación</h2>
        <p className="mb-4 text-sm text-stone-600">
          1 de cada 20 lotes que se publican al instante sale sorteado para que lo revises. Así medimos cuánto se equivoca la IA.
          {auditadas.length > 0 && (
            <>
              {" "}En los últimos 90 días acertó en <strong data-aciertos>{aciertos} de {auditadas.length}</strong> revisados
              ({Math.round((aciertos / auditadas.length) * 100)}%), contando los rechazos que pasaste a revisión manual como errores.
            </>
          )}
        </p>
        {muestrasPendientes.length ? (
          <div className="space-y-3">
            {muestrasPendientes.map((lote) => (
              <div key={lote.id} data-muestra className="tarjeta grid gap-4 p-4 lg:grid-cols-[2fr_1fr]">
                <div className="space-y-2">
                  <p>
                    <Link href={`/lotes/${lote.id}`} className="font-semibold hover:text-marca">{lote.titulo}</Link>
                    <span className="ml-2 text-sm text-stone-500">{lote.perfiles?.empresa ?? lote.perfiles?.nombre} · {pesos(lote.precio_publicado ?? lote.precio_pedido)}</span>
                  </p>
                  <div className="flex gap-2 overflow-x-auto">
                    {lote.fotos.map((foto) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={foto} src={urlFoto(foto)} alt="" className="h-20 w-20 rounded-lg border border-stone-200 object-cover" />
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <form action={auditarMuestra}>
                    <input type="hidden" name="id" value={lote.id} />
                    <BotonEnviar name="decision" value="acierto" className="btn-sec w-full" pendiente="Guardando...">Estuvo bien publicado</BotonEnviar>
                  </form>
                  <form action={auditarMuestra} className="space-y-2">
                    <input type="hidden" name="id" value={lote.id} />
                    <textarea name="nota" required rows={2} className="campo" placeholder="Qué estuvo mal (se lo mandamos al vendedor)" />
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="falta" value="si" className="accent-marca" />
                      Sumarle una falta al vendedor
                    </label>
                    <BotonEnviar name="decision" value="error" className="btn w-full" pendiente="Devolviendo..." confirmar="¿Lo sacás de la publicación?">
                      No debió publicarse
                    </BotonEnviar>
                  </form>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="tarjeta p-4 text-sm text-stone-500">No hay lotes sorteados para revisar.</p>
        )}
      </section>

      {denunciasPorLote.size > 0 && (
        <section id="denuncias" data-denuncias className="scroll-mt-24">
          <h2 className="mb-1 text-xl font-bold">Denuncias ({denunciasPorLote.size})</h2>
          <p className="mb-4 text-sm text-stone-600">
            Lotes denunciados por usuarios. Una denuncia sola no da de baja nada: la revisás vos. Con {DENUNCIAS_PARA_PAUSAR} personas el
            lote se pausa hasta que lo revises, y si ya desestimaste denuncias y llega a {DENUNCIAS_PARA_BAJA} personas en total, se da de
            baja solo. Respondé rápido: si una denuncia es cierta y no actuamos, Sobrá puede ser responsable.
          </p>
          <div className="space-y-3">
            {[...denunciasPorLote].map(([loteId, denuncias]) => {
              const lote = lotes.find((l) => l.id === loteId);
              if (!lote) return null;
              return (
                <div key={loteId} className="tarjeta grid gap-4 p-4 lg:grid-cols-[2fr_1fr]">
                  <div className="space-y-2">
                    <p>
                      <Link href={`/lotes/${lote.id}`} className="font-semibold hover:text-marca">{lote.titulo}</Link>
                      <span className="ml-2 text-sm text-stone-500">{lote.perfiles?.empresa ?? lote.perfiles?.nombre}</span>
                      {lote.pausado_por_denuncias && <span className="ml-2 rounded bg-marca-claro px-1.5 py-0.5 text-xs font-semibold text-marca-oscuro">Pausado</span>}
                    </p>
                    <ul className="space-y-1 text-sm">
                      {denuncias.map((d) => (
                        <li key={d.id}>
                          • <strong>{MOTIVOS_DENUNCIA[d.motivo] ?? d.motivo}</strong>
                          {d.detalle && <span className="text-stone-600">: “{d.detalle}”</span>}
                        </li>
                      ))}
                    </ul>
                    {(desestimadas.get(loteId) ?? 0) > 0 && (
                      <p className="text-sm text-amber-800">
                        Ya desestimaste {desestimadas.get(loteId)} {desestimadas.get(loteId) === 1 ? "denuncia" : "denuncias"} de este lote. Con{" "}
                        {DENUNCIAS_PARA_BAJA} personas en total se da de baja solo.
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <form action={resolverDenuncias}>
                      <input type="hidden" name="id" value={lote.id} />
                      <BotonEnviar name="decision" value="desestimar" className="btn-sec w-full" pendiente="Guardando...">
                        {lote.pausado_por_denuncias ? "Desestimar y volver a publicar" : "Desestimar"}
                      </BotonEnviar>
                    </form>
                    <form action={resolverDenuncias} className="space-y-2">
                      <input type="hidden" name="id" value={lote.id} />
                      <textarea name="nota" required rows={2} className="campo" placeholder="Por qué se da de baja (se lo mandamos al vendedor)" />
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" name="falta" value="si" defaultChecked className="accent-marca" />
                        Sumarle una falta al vendedor
                      </label>
                      <BotonEnviar name="decision" value="baja" className="btn w-full" pendiente="Dando de baja..." confirmar="¿Das de baja este lote?">
                        Dar de baja
                      </BotonEnviar>
                    </form>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {rechazadosIA.length > 0 && (
        <section data-rechazados-ia>
          <h2 className="mb-1 text-xl font-bold">Rechazados por la moderación ({rechazadosIA.length})</h2>
          <p className="mb-4 text-sm text-stone-600">
            En la última semana. Si la IA se equivocó, pasalo a revisión manual y aprobalo vos.
          </p>
          <div className="space-y-3">
            {rechazadosIA.map((lote) => (
              <div key={lote.id} className="tarjeta space-y-2 p-4">
                <p>
                  <span className="font-semibold">{lote.titulo}</span>
                  <span className="ml-2 text-sm text-stone-500">{lote.perfiles?.empresa ?? lote.perfiles?.nombre}</span>
                </p>
                <CajaModeracion m={moderacionDe.get(lote.id)} />
                <form action={reabrirRechazado}>
                  <input type="hidden" name="id" value={lote.id} />
                  <BotonEnviar className="btn-sec" pendiente="Pasando...">Pasar a revisión manual</BotonEnviar>
                </form>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-4 text-xl font-bold">Lotes para revisar ({enRevision.length})</h2>
        {enRevision.length ? (
          <div className="space-y-4">
            {enRevision.map((lote) => {
              const sugerido = precioSugerido(lote.precio_lista, lote.condicion, lote.categoria, lote.detalles, `${lote.titulo} ${lote.items.map((i) => nombreConMarca(i)).join(" ")}`);
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
                          <li key={i}>• {item.nombre}{item.marca ? ` (${item.marca})` : ""}: {item.cantidad} {item.unidad}</li>
                        ))}
                      </ul>
                    )}
                    {lote.descripcion && <p className="whitespace-pre-line text-sm text-stone-600">{lote.descripcion}</p>}
                    <CajaModeracion m={moderacionDe.get(lote.id)} />
                  </div>
                  <div className="space-y-3">
                    <dl className="grid grid-cols-2 gap-2 text-sm">
                      <dt className="text-stone-500">Precio de lista</dt>
                      <dd className="text-right">{pesos(lote.precio_lista)}</dd>
                      <dt className="text-stone-500">Pide</dt>
                      <dd className="text-right font-semibold">{pesos(lote.precio_pedido)}</dd>
                      <dt className="text-stone-500">Sugerido</dt>
                      <dd className="text-right">{pesos(sugerido)}</dd>
                      {lote.baja_semanal_pct != null && (
                        <>
                          <dt className="text-stone-500">Baja automática</dt>
                          <dd className="text-right">{lote.baja_semanal_pct}% por semana</dd>
                        </>
                      )}
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
                <th className="p-3 font-medium">Faltas</th>
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
                  <td className="p-3" data-faltas-de={p.nombre}>
                    {(faltasDe.get(p.id) ?? []).length ? (
                      <details>
                        <summary className="cursor-pointer font-semibold text-marca-oscuro">{faltasDe.get(p.id)!.length}</summary>
                        <ul className="mt-1 space-y-1">
                          {faltasDe.get(p.id)!.map((f) => (
                            <li key={f.id} className="text-xs">
                              {f.detalle}
                              <form action={anularFalta} className="inline">
                                <input type="hidden" name="id" value={f.id} />
                                <BotonEnviar className="ml-1 text-stone-500 underline" pendiente="...">Anular</BotonEnviar>
                              </form>
                            </li>
                          ))}
                        </ul>
                      </details>
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
