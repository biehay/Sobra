import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { after } from "next/server";
import { BotonFavorito } from "@/components/boton-favorito";
import { estadoFavorito, idsFavoritos } from "@/lib/favoritos";
import { registrarVisita, visitasDeMisLotes } from "@/lib/visitas";
import { recomendacionesDeLote, registrarVista } from "@/lib/recomendaciones";
import { asegurarFicha } from "@/lib/recomendaciones/fichas";
import { TarjetaLote } from "@/components/tarjeta-lote";
import { RecordarVista } from "@/components/recordar-vista";
import { reputacionDe } from "@/lib/reputacion";
import { TarjetaReputacion } from "@/components/reputacion";
import { Aviso } from "@/components/aviso";
import { DenunciarPublicacion } from "@/components/denunciar-publicacion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { obtenerPerfil, sesionVerificada } from "@/lib/sesion";
import { CONDICIONES, MODOS_RETIRO, descuento, proximaBaja, pesos, urlFoto, type Lote } from "@/lib/datos";
import type { Metadata } from "next";
import { MenuCompartir } from "@/components/boton-compartir";
import { rutaParaCompartir, textoParaCompartir } from "@/lib/compartir";
import { BotonEnviar } from "@/components/boton-enviar";
import { ofertar } from "./acciones";
import { DETALLES } from "@/lib/depreciacion";

// Título y descripción al compartir el link (la imagen la arma opengraph-image.tsx).
export async function generateMetadata({ params }: PageProps<"/lotes/[id]">): Promise<Metadata> {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return {};
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("lotes").select("titulo, categoria, zona, localidad, precio_publicado, precio_pedido, precio_lista, estado").eq("id", id).maybeSingle();
  if (!data) return {};
  const precio = data.precio_publicado ?? data.precio_pedido;
  const off = descuento(precio, data.precio_lista);
  const descripcion = [
    `${pesos(precio)}${off ? ` (${off}% menos que nuevo)` : ""}`,
    `Retiro en ${data.localidad ? `${data.zona}, ${data.localidad}` : data.zona}`,
    "Pago protegido: el vendedor cobra cuando retirás.",
  ].join(" · ");
  return {
    title: data.titulo,
    description: descripcion,
    alternates: { canonical: `/lotes/${id}` },
    openGraph: { siteName: "Sobrá", locale: "es_AR", type: "website", title: `${data.titulo} · ${pesos(precio)}`, description: descripcion, url: `/lotes/${id}` },
  };
}

export default async function DetalleLote({ params, searchParams }: PageProps<"/lotes/[id]">) {
  const { id } = await params;
  const { ok, error, ref } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();

  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("lotes").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const lote = data as Lote;
  const perfil = await obtenerPerfil();

  const precio = lote.precio_publicado ?? lote.precio_pedido;
  const detallesDelLote = DETALLES.filter((d) => lote.detalles?.includes(d.id));
  const off = descuento(precio, lote.precio_lista);
  const disponible = lote.estado === "publicado";
  const esMio = perfil?.id === lote.vendedor_id;
  const favorito = estadoFavorito(await idsFavoritos(), lote);
  const { data: vendedorVerificado } = await supabase.rpc("vendedor_verificado", { p_usuario: lote.vendedor_id });
  // ¿Ya lo denunció? (cada uno ve solo sus denuncias)
  const { count: misDenuncias } = perfil
    ? await supabase.from("denuncias").select("id", { count: "exact", head: true }).eq("lote_id", lote.id).eq("autor_id", perfil.id)
    : { count: 0 };

  // Se cuenta la visita después de responder (no demora la página). No cuentan
  // las del propio vendedor ni las del admin.
  if (["publicado", "reservado"].includes(lote.estado) && !esMio && perfil?.rol !== "admin") {
    const h = await headers();
    const visitante = {
      usuarioId: perfil?.id,
      ip: h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip") || "",
      navegador: h.get("user-agent") ?? "",
      compartido: ref === "compartido",
    };
    after(() => registrarVisita(lote.id, visitante));
  }
  const visitas = esMio ? (await visitasDeMisLotes([lote.id])).get(lote.id) : undefined;
  // Historial para recomendar (solo con cuenta; sin cuenta queda en el navegador).
  if (perfil && !esMio && perfil.rol === "usuario") await registrarVista(lote.id, typeof ref === "string" ? ref : null);
  const { parecidos, complementos } = await recomendacionesDeLote(lote, perfil?.id ?? null, perfil?.zona ?? null);
  // Si el lote todavía no tiene ficha técnica (lotes anteriores), se arma ahora en segundo plano.
  if (["publicado", "reservado"].includes(lote.estado)) after(() => asegurarFicha(lote));
  const favoritos = await idsFavoritos();
  const reputacionVendedor = await reputacionDe(lote.vendedor_id);

  return (
    <div className="contenedor py-10">
      <Link href="/lotes" className="text-sm text-stone-500 hover:text-stone-800">
        ← Volver a los lotes
      </Link>

      {/* En el celular el orden es: fotos (carrusel), precio y oferta, qué incluye.
          En la compu: fotos y qué incluye a la izquierda, precio y oferta a la derecha. */}
      <div className="mt-4 grid gap-6 lg:grid-cols-[3fr_2fr] lg:gap-8">
        <div className="contents lg:block lg:space-y-6">
          <div data-galeria className="order-1 -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0">
            {lote.fotos.length ? (
              lote.fotos.map((foto, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={foto}
                  src={urlFoto(foto)}
                  alt={`${lote.titulo}, foto ${i + 1}`}
                  className={`aspect-[4/3] shrink-0 snap-center rounded-xl border border-stone-200 object-cover sm:w-full ${lote.fotos.length === 1 ? "w-full" : "w-[88%]"} ${i === 0 ? "sm:col-span-2" : "sm:aspect-square"}`}
                />
              ))
            ) : (
              <div className="flex aspect-[4/3] w-full items-center justify-center rounded-xl bg-stone-100 text-stone-400 sm:col-span-2">
                Sin fotos
              </div>
            )}
          </div>
          {lote.fotos.length > 1 && (
            <p className="order-1 -mt-3 text-center text-xs text-stone-500 sm:hidden">← Deslizá para ver las {lote.fotos.length} fotos →</p>
          )}

          <section className="tarjeta order-3 p-6">
            <h2 className="mb-3 text-lg font-bold">Qué incluye el lote</h2>
            {lote.items.length ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-200 text-left text-stone-500">
                    <th className="py-2 font-medium">Material</th>
                    <th className="py-2 text-right font-medium">Cantidad</th>
                  </tr>
                </thead>
                <tbody>
                  {lote.items.map((item, i) => (
                    <tr key={i} className="border-b border-stone-100 last:border-0">
                      <td className="py-2">
                        {item.nombre}
                        {item.marca && <span className="ml-1 text-stone-500">· {item.marca}</span>}
                      </td>
                      <td className="py-2 text-right">
                        {item.cantidad} {item.unidad}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-stone-500">Ver descripción.</p>
            )}
            {lote.descripcion && <p className="mt-4 whitespace-pre-line text-stone-700">{lote.descripcion}</p>}
          </section>
        </div>

        <aside className="contents lg:block lg:space-y-4">
          <div className="tarjeta order-2 space-y-4 p-6">
            <p className="text-xs font-medium uppercase tracking-wide text-stone-500">{lote.categoria}</p>
            <h1 className="text-2xl font-bold leading-snug">{lote.titulo}</h1>
            <div>
              <p className="text-3xl font-extrabold">{pesos(precio)}</p>
              {off && (
                <p className="text-sm text-stone-500">
                  <span className="line-through">{pesos(lote.precio_lista)}</span> precio de lista ·{" "}
                  <span className="font-semibold text-marca">{off}% menos</span>
                </p>
              )}
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-stone-500">Estado</dt>
                <dd className="font-medium">{CONDICIONES[lote.condicion]}</dd>
              </div>
              <div>
                <dt className="text-stone-500">Retiro en</dt>
                <dd className="font-medium">
                  {lote.zona}
                  {lote.localidad && `, ${lote.localidad}`}
                </dd>
              </div>
            </dl>
            {detallesDelLote.length > 0 && (
              <div data-detalles-lote className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                <p className="font-semibold">Para tener en cuenta</p>
                <ul className="mt-0.5 list-disc pl-5">
                  {detallesDelLote.map((d) => (
                    <li key={d.id}>{d.texto}</li>
                  ))}
                </ul>
              </div>
            )}
            <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
              {vendedorVerificado ? "✓ Vendedor verificado · " : "✓ "}Pago protegido: revisás el material al retirarlo y el vendedor cobra recién ahí
            </p>
            {disponible && proximaBaja(lote) && (
              <p className="rounded-lg bg-celeste-claro px-3 py-2 text-sm text-petroleo">
                ↓ <strong>Precio en baja:</strong> si no se vende, baja {lote.baja_semanal_pct}% cada semana. Guardalo en
                favoritos y te avisamos en cada baja.
              </p>
            )}
            {/* Se guardan lotes publicados o reservados; uno vendido solo se puede quitar. */}
            {favorito !== undefined ? (
              (favorito || ["publicado", "reservado"].includes(lote.estado)) && (
                <BotonFavorito loteId={lote.id} guardado={favorito} volver={`/lotes/${lote.id}`} conTexto />
              )
            ) : (
              !perfil && disponible && (
                <Link href={`/ingresar?volver=/lotes/${lote.id}`} className="btn-sec w-full">
                  Guardar en favoritos
                </Link>
              )
            )}
            {/* Compartir (WhatsApp y demás) y denunciar, a la vista: debajo de favoritos. */}
            {["publicado", "reservado"].includes(lote.estado) && (
              <MenuCompartir variante="boton" ruta={rutaParaCompartir(lote.id)} texto={textoParaCompartir(lote.titulo, precio, off)} />
            )}
            {["publicado", "reservado"].includes(lote.estado) && !esMio && (
              <DenunciarPublicacion loteId={lote.id} conCuenta={!!perfil} yaDenuncio={(misDenuncias ?? 0) > 0} soloVista={perfil?.rol === "admin"} />
            )}
            {esMio && visitas && (
              <p className="text-sm text-stone-600">
                Tu lote tuvo <strong>{visitas.semana}</strong> {visitas.semana === 1 ? "visita" : "visitas"} en los últimos 7 días ({visitas.total} en total).
              </p>
            )}
          </div>

          <div id="aviso" className="order-4 scroll-mt-32 empty:hidden">
            <Aviso ok={ok} error={error} />
          </div>

          <div className="order-4">
          {!disponible ? (
            <div className="tarjeta p-6 text-center">
              <p className="font-semibold text-stone-600">Este lote está {lote.estado === "vendido" ? "vendido" : "reservado"}.</p>
              {parecidos.length > 0 && (
                <a href="#parecidos" className="mt-2 inline-block text-sm font-semibold text-marca hover:underline">
                  Ver parecidos disponibles ↓
                </a>
              )}
            </div>
          ) : !perfil ? (
            <div className="tarjeta space-y-3 p-6">
              <p className="font-semibold">¿Te interesa este lote?</p>
              <p className="text-sm text-stone-600">Creá tu cuenta para hacer una oferta. Con la misma cuenta también podés vender.</p>
              <Link href={`/registro?volver=/lotes/${lote.id}`} className="btn w-full">
                Quiero ofertar
              </Link>
              <Link href={`/ingresar?volver=/lotes/${lote.id}`} className="btn-sec w-full">
                Ya tengo cuenta
              </Link>
            </div>
          ) : perfil.id === lote.vendedor_id ? (
            <p className="tarjeta p-6 text-sm text-stone-600">
              Este es tu lote. Vas a ver las ofertas en{" "}
              <Link href="/panel/vendedor" className="font-semibold text-marca hover:underline">Mis ventas</Link>.
            </p>
          ) : perfil.rol === "admin" ? (
            <p className="tarjeta p-6 text-sm text-stone-600">Las cuentas de administración no ofertan.</p>
          ) : !(await sesionVerificada()) ? (
            <div className="tarjeta space-y-3 p-6">
              <p className="font-semibold">Confirmá que sos vos</p>
              <p className="text-sm text-stone-600">Para ofertar, ingresá el código que te mandamos por email.</p>
              <Link href={`/seguridad/verificar?volver=/lotes/${lote.id}`} className="btn w-full">Ingresar el código</Link>
            </div>
          ) : (
            <form action={ofertar} className="tarjeta space-y-4 p-6">
              <input type="hidden" name="loteId" value={lote.id} />
              <p className="font-semibold">Hacé tu oferta por el lote completo</p>
              <div>
                <label htmlFor="monto" className="etiqueta">
                  Monto (ARS)
                </label>
                <input id="monto" name="monto" type="number" min={1} step={1} defaultValue={precio} required className="campo" />
              </div>
              <div>
                <label htmlFor="retiro" className="etiqueta">
                  Retiro
                </label>
                <select id="retiro" name="retiro" className="campo">
                  {Object.entries(MODOS_RETIRO).map(([valor, texto]) => (
                    <option key={valor} value={valor}>
                      {texto}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="mensaje" className="etiqueta">
                  Mensaje (opcional)
                </label>
                <textarea id="mensaje" name="mensaje" rows={3} maxLength={500} className="campo" placeholder="Ej.: puedo retirar esta semana" />
              </div>
              <BotonEnviar className="btn w-full">Enviar oferta</BotonEnviar>
              <p className="text-xs text-stone-500">
                Si el vendedor acepta, te pasamos los datos de pago. Retenemos tu dinero hasta que retirás el material.
                {!perfil.verificado && " Como cuenta nueva, podés tener hasta 3 ofertas abiertas a la vez."}
              </p>
            </form>
          )}

          </div>

          {/* El vendedor va después de la compra: lo primero que se ve es cómo ofertar. */}
          <div className="tarjeta order-5 p-6">
            <p className="mb-3 text-sm font-semibold text-stone-500">Sobre el vendedor</p>
            <TarjetaReputacion r={reputacionVendedor} como="vendedor" />
          </div>
        </aside>
      </div>

      {complementos.length > 0 && (
        <section className="mt-14">
          <h2 className="text-2xl font-bold">Para completar la obra</h2>
          <p className="mb-5 text-sm text-stone-600">Lo que suele hacer falta junto con este material.</p>
          <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3">
            {complementos.map((r) => (
              <TarjetaLote key={r.lote.id} lote={r.lote} motivo={r.motivo.texto} origen={`rec-${r.motivo.tipo}`} favorito={estadoFavorito(favoritos, r.lote)} volver={`/lotes/${lote.id}`} />
            ))}
          </div>
        </section>
      )}

      {parecidos.length > 0 && (
        <section id="parecidos" className="mt-14 scroll-mt-24">
          <h2 className="mb-5 text-2xl font-bold">{disponible ? "También te puede interesar" : "Parecidos disponibles"}</h2>
          <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3">
            {parecidos.map((r) => (
              <TarjetaLote key={r.lote.id} lote={r.lote} motivo={r.motivo.texto} origen={`rec-${r.motivo.tipo}`} favorito={estadoFavorito(favoritos, r.lote)} volver={`/lotes/${lote.id}`} />
            ))}
          </div>
        </section>
      )}
      <RecordarVista loteId={lote.id} />
    </div>
  );
}
