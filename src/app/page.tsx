import Link from "next/link";
import { TarjetaLote } from "@/components/tarjeta-lote";
import { CalculadoraSobrante } from "@/components/calculadora-sobrante";
import { crearClienteServidor } from "@/lib/supabase/server";
import { obtenerPerfil } from "@/lib/sesion";
import { estadoFavorito, idsFavoritos } from "@/lib/favoritos";
import { impactoTotal, peso } from "@/lib/impacto";
import { busquedasPublicas } from "@/lib/busquedas";
import { CATEGORIAS, descuento, pesos, urlFoto, type Lote } from "@/lib/datos";

const PASOS_VENDEDOR = [
  ["Cargás el lote", "Fotos, lista de materiales y cuánto querés recuperar. Te ayudamos con el precio."],
  ["Lo verificamos", "Revisamos el estado antes de publicarlo."],
  ["Recibís ofertas", "Solo de compradores verificados. Vos elegís cuál aceptar."],
  ["Cobrás seguro", "El comprador paga antes del retiro y te transferimos al completarse."],
];

const PASOS_COMPRADOR = [
  ["Encontrás el lote", "Materiales nuevos o sin uso, con descuento sobre el precio de lista."],
  ["Hacés tu oferta", "Ofertás por el lote completo. Te avisamos cuando el vendedor responde."],
  ["Pagás protegido", "Pagás a Sobrá y retenemos el dinero hasta que retirás el material."],
  ["Retirás", "Te pasamos dirección y contacto, o coordinamos el flete por vos."],
];

// Lo que diferencia a Sobrá de un marketplace general.
const DIFERENCIALES: [string, string, string][] = [
  ["Cobrás seguro, sin esperar", "El comprador paga antes de retirar y el vendedor cobra apenas se confirma el retiro con un código.", "/#como-funciona"],
  ["Lotes revisados uno por uno", "Antes de publicar miramos fotos, cantidades y estado. Lo que ves es lo que retirás.", "/#como-funciona"],
  ["Te avisamos cuando aparece", "Guardá lo que necesitás y te llega un email apenas alguien lo publica. Sin entrar todos los días.", "/panel/busquedas"],
  ["Reputación con hechos", "Nada de estrellas por enojo: se ve qué porcentaje de ventas salió sin reclamos y quién retira a tiempo.", "/ayuda"],
  ["Constancia de material recuperado", "Cada venta suma kilos que no fueron a residuos. La constancia se verifica con un código, para informes y licitaciones.", "/impacto"],
  ["Precio que baja solo, si querés", "El vendedor elige bajarlo un poco cada semana hasta un mínimo. Quien lo guardó se entera en cada baja.", "/ayuda"],
];

const rebaja = (l: Lote) => descuento(l.precio_publicado ?? l.precio_pedido, l.precio_lista) ?? 0;

export default async function Inicio() {
  const supabase = await crearClienteServidor();
  const [{ data }, favoritos, impacto, demanda, perfil] = await Promise.all([
    supabase.from("lotes").select("*").eq("estado", "publicado").order("publicado_at", { ascending: false }).limit(60),
    idsFavoritos(),
    impactoTotal(),
    busquedasPublicas(),
    obtenerPerfil(),
  ]);
  const lotes = (data ?? []) as Lote[];
  const masBaratos = [...lotes].filter((l) => rebaja(l) > 0).sort((a, b) => rebaja(b) - rebaja(a));
  const destacados = (masBaratos.length ? masBaratos : lotes).slice(0, 2);
  const recientes = lotes.slice(0, 6);
  const descuentoMaximo = masBaratos.length ? rebaja(masBaratos[0]) : null;
  const porCategoria = new Map<string, number>();
  for (const l of lotes) porCategoria.set(l.categoria, (porCategoria.get(l.categoria) ?? 0) + 1);
  const categorias = [...CATEGORIAS].sort((a, b) => (porCategoria.get(b) ?? 0) - (porCategoria.get(a) ?? 0));
  const publicar = perfil ? "/panel/vendedor/lotes/nuevo" : "/registro?volver=/panel/vendedor/lotes/nuevo";
  const tarjeta = (lote: Lote) => <TarjetaLote key={lote.id} lote={lote} favorito={estadoFavorito(favoritos, lote)} volver="/" />;

  // Para quien ya tiene cuenta: lo nuevo para sus búsquedas y lo de su zona.
  let paraVos: Lote[] = [];
  if (perfil && perfil.rol === "usuario") {
    const { data: coincidencias } = await supabase
      .from("busqueda_coincidencias")
      .select("lotes(*)")
      .order("created_at", { ascending: false })
      .limit(12);
    const deBusquedas = ((coincidencias ?? []) as unknown as { lotes: Lote | null }[])
      .map((c) => c.lotes)
      .filter((l): l is Lote => !!l && l.estado === "publicado");
    const deMiZona = lotes.filter((l) => l.zona === perfil.zona && l.vendedor_id !== perfil.id);
    paraVos = [...new Map([...deBusquedas, ...deMiZona].map((l) => [l.id, l])).values()].slice(0, 6);
  }

  return (
    <>
      {/* 1. Lo primero: los productos y un buscador grande. */}
      <section className="bg-gradient-to-br from-petroleo via-petroleo to-[#0b4a5e] text-white">
        <div className="contenedor grid gap-6 py-6 sm:gap-10 sm:py-14 lg:grid-cols-[1.1fr_1fr] lg:items-center">
          <div>
            {perfil ? (
              <p className="mb-3 text-celeste">Hola, {perfil.nombre.split(" ")[0]}</p>
            ) : (
              <p className="mb-3 inline-block rounded-full bg-white/10 px-3 py-1 text-sm font-semibold tracking-wide text-celeste">
                Sobrantes de obra · AMBA
              </p>
            )}
            <h1 className="text-3xl font-extrabold leading-tight tracking-tight sm:text-5xl">
              Materiales de obra <span className="text-celeste">{descuentoMaximo ? `hasta ${descuentoMaximo}% más baratos` : "más baratos"}</span>
            </h1>
            {/* En el celular se acorta para que los productos entren en la primera pantalla. */}
            <p className="mt-4 hidden max-w-xl text-lg text-white/80 sm:block">
              Sobrantes nuevos y sin uso de constructoras y corralones, verificados por Sobrá. Pagás protegido: el vendedor cobra
              recién cuando retirás.
            </p>
            <form action="/lotes" role="search" className="mt-6 hidden max-w-xl gap-2 rounded-xl bg-white p-1.5 shadow-lg sm:flex">
              <label htmlFor="buscar-portada" className="sr-only">Qué material buscás</label>
              <input id="buscar-portada" name="q" type="search" placeholder="¿Qué necesitás? Porcelanato, caños, cemento..." className="min-w-0 flex-1 rounded-lg px-3 text-base text-petroleo outline-none" />
              <button className="btn px-5 py-3">Buscar</button>
            </form>
            <p className="mt-3 text-white/80 sm:hidden">Sobrantes verificados, con pago protegido.</p>
            <div className="mt-4 hidden flex-wrap gap-2 text-sm sm:flex">
              {categorias.slice(0, 5).map((c) => (
                <Link key={c} href={`/lotes?categoria=${encodeURIComponent(c)}`} className="rounded-full bg-white/10 px-3 py-1 text-white/90 hover:bg-white/20">
                  {c}
                </Link>
              ))}
            </div>
          </div>

          {destacados.length > 0 ? (
            <div className="grid grid-cols-2 gap-4">
              {destacados.map((lote) => {
                const precio = lote.precio_publicado ?? lote.precio_pedido;
                const off = rebaja(lote);
                return (
                  <Link key={lote.id} href={`/lotes/${lote.id}`} className="group overflow-hidden rounded-2xl bg-white text-petroleo shadow-xl transition hover:-translate-y-1">
                    <div className="relative aspect-square bg-stone-100">
                      {lote.fotos[0] && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={urlFoto(lote.fotos[0])} alt={lote.titulo} className="h-full w-full object-cover" />
                      )}
                      {off > 0 && (
                        <span className="absolute left-3 top-3 rounded-full bg-marca px-3 py-1 text-sm font-extrabold text-white">-{off}%</span>
                      )}
                    </div>
                    <div className="p-3">
                      <p className="line-clamp-2 text-sm font-semibold group-hover:text-marca">{lote.titulo}</p>
                      <p className="mt-1 text-lg font-extrabold">{pesos(precio)}</p>
                      <p className="text-xs text-stone-500">{lote.zona}</p>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <CalculadoraSobrante hrefPublicar={publicar} />
          )}
        </div>
      </section>

      {/* 2. Lo que es para vos (con cuenta) o por qué crear una (sin cuenta). */}
      {perfil && perfil.rol === "usuario" ? (
        <section className="contenedor pt-10">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-2xl font-bold">Para vos</h2>
              <p className="text-sm text-stone-600">
                {perfil.zona ? `Lo nuevo para tus búsquedas y lo publicado en ${perfil.zona}.` : "Lo nuevo para tus búsquedas."}
              </p>
            </div>
            <Link href="/panel/busquedas" className="text-sm font-semibold text-marca hover:underline">Avisame cuando aparezca algo →</Link>
          </div>
          {paraVos.length ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{paraVos.map(tarjeta)}</div>
          ) : (
            <div className="tarjeta flex flex-wrap items-center justify-between gap-4 p-6">
              <p className="text-stone-600">Contanos qué material necesitás y te mandamos un email apenas se publique.</p>
              <Link href="/panel/busquedas" className="btn">Guardar lo que busco</Link>
            </div>
          )}
        </section>
      ) : !perfil ? (
        <section className="contenedor pt-10">
          <div className="grid gap-6 rounded-2xl border border-celeste/40 bg-celeste-claro p-6 sm:p-8 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <h2 className="text-2xl font-bold text-petroleo">Creá tu cuenta gratis y no te pierdas ninguna oferta</h2>
              <ul className="mt-4 grid gap-3 text-petroleo sm:grid-cols-2">
                {[
                  ["🔔", "Te avisamos al instante", "cuando se publica el material que buscás."],
                  ["❤", "Guardá favoritos", "y enterate cuando bajan de precio."],
                  ["🛡", "Comprá protegido", "el vendedor cobra recién cuando retirás."],
                  ["💸", "Vendé tus sobrantes gratis", "y documentá cuánto material recuperaste."],
                ].map(([icono, titulo, texto]) => (
                  <li key={titulo} className="flex gap-3">
                    <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white text-lg">{icono}</span>
                    <span className="text-sm"><strong className="block text-base">{titulo}</strong>{texto}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row lg:flex-col">
              <Link href="/registro" className="btn px-6 py-3 text-base">Crear cuenta gratis</Link>
              <Link href="/ingresar" className="btn-sec px-6 py-3 text-base">Ya tengo cuenta</Link>
            </div>
          </div>
        </section>
      ) : null}

      {/* 3. Más productos: las mejores ofertas y lo recién publicado. */}
      {masBaratos.length > 2 && (
        <section className="contenedor pt-12">
          <div className="mb-5 flex items-end justify-between">
            <h2 className="text-2xl font-bold">Las mejores ofertas</h2>
            <Link href="/lotes?orden=descuento" className="text-sm font-semibold text-marca hover:underline">Ver todas</Link>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{masBaratos.slice(2, 8).map(tarjeta)}</div>
        </section>
      )}

      <section className="contenedor pt-12">
        <div className="mb-5 flex items-end justify-between">
          <h2 className="text-2xl font-bold">Recién publicados</h2>
          <Link href="/lotes" className="text-sm font-semibold text-marca hover:underline">Ver todos</Link>
        </div>
        {recientes.length ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{recientes.map(tarjeta)}</div>
        ) : (
          <p className="tarjeta p-8 text-center text-stone-500">
            Todavía no hay lotes publicados. ¿Tenés un sobrante?{" "}
            <Link href={publicar} className="font-semibold text-marca hover:underline">Publicalo primero</Link>.
          </p>
        )}
      </section>

      {/* Lo que nos diferencia: corto y concreto, debajo de los productos. */}
      <section className="contenedor pt-14">
        <h2 className="text-2xl font-bold">Lo que no vas a encontrar en otro lado</h2>
        <p className="mt-1 text-stone-600">Sobrá está hecho para materiales de obra, no para vender de todo.</p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {DIFERENCIALES.map(([titulo, texto, href]) => (
            <Link key={titulo} href={href} className="tarjeta p-5 transition hover:border-celeste hover:shadow-md">
              <p className="font-bold text-petroleo">{titulo}</p>
              <p className="mt-1 text-sm text-stone-600">{texto}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="contenedor pt-12">
        <h2 className="mb-5 text-2xl font-bold">Explorá por categoría</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {categorias.map((c) => (
            <Link key={c} href={`/lotes?categoria=${encodeURIComponent(c)}`} className="tarjeta flex items-center justify-between gap-2 p-4 transition hover:border-celeste hover:shadow-md">
              <span className="font-medium">{c}</span>
              {porCategoria.get(c) ? <span className="rounded-full bg-celeste-claro px-2 py-0.5 text-xs font-semibold text-celeste-oscuro">{porCategoria.get(c)}</span> : null}
            </Link>
          ))}
        </div>
      </section>

      {/* 4. Para el que vende: cuánto vale lo suyo y quién lo está buscando. */}
      <section className="mt-14 bg-gradient-to-br from-petroleo to-[#0b4a5e] py-14 text-white">
        <div className="contenedor grid gap-10 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="text-sm font-semibold tracking-wide text-celeste">¿TE SOBRÓ MATERIAL?</p>
            <h2 className="mt-2 text-3xl font-extrabold">Convertilo en plata en vez de tirarlo</h2>
            <p className="mt-3 text-white/80">
              Publicar es gratis y te ayudamos con el precio. Cobrás seguro y te llevás una constancia del material que salvaste
              de ir a residuos.
            </p>
            {demanda.length > 0 && (
              <div className="mt-6">
                <p className="font-semibold">Ahora mismo se está buscando:</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {demanda.slice(0, 8).map((b, i) => (
                    <span key={i} className="rounded-full bg-white/10 px-3 py-1 text-sm">
                      {b.texto}
                      {b.cantidad > 1 && <span className="text-celeste"> · {b.cantidad} compradores</span>}
                    </span>
                  ))}
                </div>
                <Link href="/buscados" className="mt-3 inline-block text-sm font-semibold text-celeste hover:underline">Ver todo lo que se busca →</Link>
              </div>
            )}
            {impacto.operaciones > 0 && (
              <Link href="/impacto" className="mt-6 inline-flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm text-white/90 hover:bg-white/15">
                ♻ <strong className="text-white">{peso(impacto.kg)}</strong> de material ya no fue a residuos gracias a Sobrá
              </Link>
            )}
          </div>
          {/* Si arriba no hay productos, la calculadora ya está en la primera pantalla. */}
          {destacados.length > 0 ? (
            <CalculadoraSobrante hrefPublicar={publicar} />
          ) : (
            <Link href={publicar} className="btn justify-self-start px-6 py-3 text-base">Publicar mi sobrante gratis</Link>
          )}
        </div>
      </section>

      <section id="como-funciona" className="bg-white py-14">
        <div className="contenedor grid gap-10 lg:grid-cols-2">
          {[
            ["Si comprás", PASOS_COMPRADOR],
            ["Si vendés", PASOS_VENDEDOR],
          ].map(([titulo, pasos]) => (
            <div key={titulo as string}>
              <h2 className="mb-5 text-2xl font-bold">{titulo as string}</h2>
              <ol className="space-y-4">
                {(pasos as string[][]).map(([paso, texto], i) => (
                  <li key={paso} className="flex gap-4">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-celeste-claro font-bold text-celeste-oscuro">
                      {i + 1}
                    </span>
                    <div>
                      <p className="font-semibold">{paso}</p>
                      <p className="text-sm text-stone-600">{texto}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
        <p className="contenedor mt-10 text-sm text-stone-500">
          Sobrá cobra una comisión del 12% al vendedor solo cuando vende. Publicar es gratis.
        </p>
      </section>
    </>
  );
}
