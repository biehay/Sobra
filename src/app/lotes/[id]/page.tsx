import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { after } from "next/server";
import { BotonFavorito } from "@/components/boton-favorito";
import { estadoFavorito, idsFavoritos } from "@/lib/favoritos";
import { registrarVisita, visitasDeMisLotes } from "@/lib/visitas";
import { reputacionDe } from "@/lib/reputacion";
import { TarjetaReputacion } from "@/components/reputacion";
import { Aviso } from "@/components/aviso";
import { crearClienteServidor } from "@/lib/supabase/server";
import { obtenerPerfil, sesionVerificada } from "@/lib/sesion";
import {
  CONDICIONES,
  MODOS_RETIRO,
  descuento,
  linkWhatsapp,
  proximaBaja,
  pesos,
  urlFoto,
  type Lote,
} from "@/lib/datos";
import { BotonEnviar } from "@/components/boton-enviar";
import { ofertar } from "./acciones";

export default async function DetalleLote({ params, searchParams }: PageProps<"/lotes/[id]">) {
  const { id } = await params;
  const { ok, error } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();

  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("lotes").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const lote = data as Lote;
  const perfil = await obtenerPerfil();

  const precio = lote.precio_publicado ?? lote.precio_pedido;
  const off = descuento(precio, lote.precio_lista);
  const disponible = lote.estado === "publicado";
  const esMio = perfil?.id === lote.vendedor_id;
  const favorito = estadoFavorito(await idsFavoritos(), lote);

  // Se cuenta la visita después de responder (no demora la página). No cuentan
  // las del propio vendedor ni las del admin.
  if (["publicado", "reservado"].includes(lote.estado) && !esMio && perfil?.rol !== "admin") {
    const h = await headers();
    const visitante = {
      usuarioId: perfil?.id,
      ip: h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip") || "",
      navegador: h.get("user-agent") ?? "",
    };
    after(() => registrarVisita(lote.id, visitante));
  }
  const visitas = esMio ? (await visitasDeMisLotes([lote.id])).get(lote.id) : undefined;
  const reputacionVendedor = await reputacionDe(lote.vendedor_id);

  return (
    <div className="contenedor py-10">
      <Link href="/lotes" className="text-sm text-stone-500 hover:text-stone-800">
        ← Volver a los lotes
      </Link>

      <div className="mt-4 grid gap-8 lg:grid-cols-[3fr_2fr]">
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2">
            {lote.fotos.length ? (
              lote.fotos.map((foto, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={foto}
                  src={urlFoto(foto)}
                  alt={`${lote.titulo}, foto ${i + 1}`}
                  className={`w-full rounded-xl border border-stone-200 object-cover ${i === 0 ? "aspect-[4/3] sm:col-span-2" : "aspect-square"}`}
                />
              ))
            ) : (
              <div className="flex aspect-[4/3] items-center justify-center rounded-xl bg-stone-100 text-stone-400 sm:col-span-2">
                Sin fotos
              </div>
            )}
          </div>

          <section className="tarjeta p-6">
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
                      <td className="py-2">{item.nombre}</td>
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

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <div className="tarjeta space-y-4 p-6">
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
            <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
              ✓ Lote verificado por Sobrá · Pago protegido hasta el retiro
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
            {esMio && visitas && (
              <p className="text-sm text-stone-600">
                Tu lote tuvo <strong>{visitas.semana}</strong> {visitas.semana === 1 ? "visita" : "visitas"} en los últimos 7 días ({visitas.total} en total).
              </p>
            )}
          </div>

          <div className="tarjeta p-6">
            <p className="mb-3 text-sm font-semibold text-stone-500">Sobre el vendedor</p>
            <TarjetaReputacion r={reputacionVendedor} como="vendedor" />
          </div>

          <Aviso ok={ok} error={error} />

          {!disponible ? (
            <p className="tarjeta p-6 text-center font-semibold text-stone-600">
              Este lote está {lote.estado === "vendido" ? "vendido" : "reservado"}.
            </p>
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
          ) : !perfil.verificado ? (
            <div className="tarjeta space-y-3 p-6">
              <p className="font-semibold">Tu cuenta está en verificación</p>
              <p className="text-sm text-stone-600">
                Antes de tu primera compra verificamos tu cuenta, para que los vendedores operen tranquilos. Si querés acelerar, escribinos.
              </p>
              <a
                href={linkWhatsapp(`Hola, soy ${perfil.nombre} y quiero verificar mi cuenta de Sobrá para comprar.`)}
                target="_blank"
                rel="noreferrer"
                className="btn-sec w-full"
              >
                Escribir por WhatsApp
              </a>
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
              </p>
            </form>
          )}
        </aside>
      </div>
    </div>
  );
}
