import Link from "next/link";
import { obtenerPerfil } from "@/lib/sesion";
import { resumenUsuario, type Resumen } from "@/lib/resumen";
import { crearClienteServidor } from "@/lib/supabase/server";
import { CATEGORIAS, pesos, type Perfil } from "@/lib/datos";
import { Desplegable } from "@/components/desplegable";
import { BotonPublicarFlotante } from "@/components/boton-publicar-flotante";

const PUBLICAR = "/panel/vendedor/lotes/nuevo";

const OFERTAS = [
  { texto: "Mayor descuento", detalle: "Lo más rebajado contra el precio de lista", href: "/lotes?orden=descuento" },
  { texto: "Recién publicados", detalle: "Los últimos lotes verificados", href: "/lotes?orden=recientes" },
  { texto: "Menor precio", detalle: "Ordenados del más barato al más caro", href: "/lotes?orden=barato" },
  { texto: "Nuevos en su embalaje", detalle: "Material sin abrir", href: "/lotes?condicion=nuevo" },
];

const flecha = (
  <svg aria-hidden viewBox="0 0 20 20" className="size-4 text-stone-400" fill="currentColor">
    <path d="M5.3 7.3a1 1 0 0 1 1.4 0L10 10.6l3.3-3.3a1 1 0 1 1 1.4 1.4l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 0 1 0-1.4Z" />
  </svg>
);
const claseMenu = "flex items-center gap-1 rounded-lg px-2 py-2 text-sm font-medium hover:bg-stone-100 sm:px-3";

export async function Encabezado() {
  const perfil = await obtenerPerfil();
  const publicar = perfil ? PUBLICAR : `/registro?volver=${PUBLICAR}`;

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-stone-200 bg-white/95 backdrop-blur">
        <div className="contenedor flex h-16 items-center gap-2 sm:gap-4">
          <Link href="/" className="mr-1 text-xl font-extrabold tracking-tight sm:mr-3">
            Sobr<span className="text-marca">á</span>
          </Link>

          <nav aria-label="Explorar" className="flex items-center">
            <Desplegable etiqueta="Categorías" alinear="izquierda" claseBoton={claseMenu} anchoPanel="sm:w-[28rem]" boton={<>Categorías{flecha}</>}>
              <div className="grid gap-0.5 p-2 sm:grid-cols-2">
                {CATEGORIAS.map((c) => (
                  <Link key={c} href={`/lotes?categoria=${encodeURIComponent(c)}`} className="rounded-lg px-3 py-2 text-sm hover:bg-stone-100">
                    {c}
                  </Link>
                ))}
              </div>
              <Link href="/lotes" className="block border-t border-stone-100 px-5 py-3 text-sm font-semibold text-marca hover:bg-stone-50">
                Ver todos los lotes →
              </Link>
            </Desplegable>
            <Desplegable etiqueta="Ofertas" alinear="izquierda" claseBoton={claseMenu} boton={<>Ofertas{flecha}</>}>
              <div className="p-2">
                {OFERTAS.map((o) => (
                  <Link key={o.href} href={o.href} className="block rounded-lg px-3 py-2 hover:bg-stone-100">
                    <span className="block text-sm font-semibold">{o.texto}</span>
                    <span className="block text-xs text-stone-500">{o.detalle}</span>
                  </Link>
                ))}
              </div>
            </Desplegable>
            {!perfil && (
              <Link href="/como-funciona" className={`${claseMenu} hidden lg:flex`}>
                Cómo funciona
              </Link>
            )}
          </nav>

          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            {perfil?.rol !== "admin" && (
              <Link href={publicar} className="btn hidden sm:inline-flex">
                + Publicar sobrante
              </Link>
            )}
            {perfil ? (
              <>
                {perfil.rol === "admin" && (
                  <Link href="/admin" className={claseMenu}>
                    Admin
                  </Link>
                )}
                <MenuUsuario perfil={perfil} />
              </>
            ) : (
              <Link href="/ingresar" className={claseMenu}>
                Ingresar
              </Link>
            )}
          </div>
        </div>
      </header>
      {/* Afuera del header: su desenfoque de fondo haría que "fixed" se ubique dentro de él. */}
      {perfil?.rol !== "admin" && <BotonPublicarFlotante href={publicar} />}
    </>
  );
}

function iniciales(nombre: string) {
  const partes = nombre.trim().split(/\s+/);
  return ((partes[0]?.[0] ?? "") + (partes.length > 1 ? partes[partes.length - 1][0] : "")).toUpperCase() || "?";
}

async function MenuUsuario({ perfil }: { perfil: Perfil }) {
  const supabase = await crearClienteServidor();
  const { data } = await supabase.auth.getClaims();
  const email = (data?.claims?.email as string | undefined) ?? "";
  const resumen = perfil.rol === "admin" ? null : await resumenUsuario(perfil.id);
  const mes = new Date().toLocaleDateString("es-AR", { month: "long", timeZone: "America/Argentina/Buenos_Aires" });

  const circulo = (
    <span className="relative flex size-9 items-center justify-center rounded-full bg-marca text-sm font-bold text-white">
      {iniciales(perfil.nombre)}
      {!!resumen?.pendientes && (
        <span className="absolute -right-1 -top-1 flex min-w-5 items-center justify-center rounded-full border-2 border-white bg-red-600 px-1 text-[10px] leading-4">
          {resumen.pendientes}
        </span>
      )}
    </span>
  );

  return (
    <Desplegable
      etiqueta={resumen?.pendientes ? `Mi cuenta (${resumen.pendientes} pendientes)` : "Mi cuenta"}
      claseBoton="rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca"
      anchoPanel="sm:w-96"
      boton={circulo}
    >
      <div className="flex items-center gap-3 border-b border-stone-100 p-4">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-marca font-bold text-white">
          {iniciales(perfil.nombre)}
        </span>
        <div className="min-w-0">
          <p className="truncate font-semibold">{perfil.nombre}</p>
          {perfil.empresa && <p className="truncate text-sm text-stone-600">{perfil.empresa}</p>}
          <p className="truncate text-xs text-stone-500">{email}</p>
          {perfil.rol === "admin" ? (
            <p className="mt-1 text-xs font-semibold text-marca">Administrador</p>
          ) : perfil.verificado ? (
            <p className="mt-1 text-xs font-semibold text-green-700">✓ Cuenta verificada</p>
          ) : (
            <p className="mt-1 text-xs font-semibold text-amber-700">En verificación: todavía no podés ofertar</p>
          )}
        </div>
      </div>

      {resumen && <ResumenCuenta resumen={resumen} mes={mes} />}

      <nav aria-label="Mi cuenta" className="border-t border-stone-100 p-2 text-sm">
        {perfil.rol === "admin" ? (
          <Link href="/admin" className="block rounded-lg px-3 py-2 hover:bg-stone-100">Panel de admin</Link>
        ) : (
          <>
            <Link href="/panel/vendedor" className="block rounded-lg px-3 py-2 hover:bg-stone-100">Mis ventas y lotes</Link>
            <Link href="/panel/comprador" className="block rounded-lg px-3 py-2 hover:bg-stone-100">Mis compras</Link>
            <Link href="/panel/perfil" className="block rounded-lg px-3 py-2 hover:bg-stone-100">Mis datos</Link>
          </>
        )}
        <form action="/salir" method="post">
          <button className="w-full rounded-lg px-3 py-2 text-left text-stone-500 hover:bg-stone-100">Salir</button>
        </form>
      </nav>
    </Desplegable>
  );
}

function ResumenCuenta({ resumen: r, mes }: { resumen: Resumen; mes: string }) {
  const tareas = [
    r.ofertasPorResponder && { texto: `${r.ofertasPorResponder} ${r.ofertasPorResponder === 1 ? "oferta" : "ofertas"} para responder`, href: "/panel/vendedor" },
    r.comprasPorPagar && { texto: `${r.comprasPorPagar} ${r.comprasPorPagar === 1 ? "compra" : "compras"} para pagar`, href: "/panel/comprador" },
    r.lotes.observados && { texto: `${r.lotes.observados} ${r.lotes.observados === 1 ? "lote" : "lotes"} con observaciones para corregir`, href: "/panel/vendedor" },
    r.comprasPorRetirar && { texto: `${r.comprasPorRetirar} ${r.comprasPorRetirar === 1 ? "retiro" : "retiros"} para coordinar`, href: "/panel/comprador" },
    r.reclamosAbiertos && { texto: `${r.reclamosAbiertos} ${r.reclamosAbiertos === 1 ? "reclamo abierto" : "reclamos abiertos"}`, href: "/panel/vendedor" },
  ].filter(Boolean) as { texto: string; href: string }[];

  return (
    <div className="space-y-4 p-4">
      {tareas.length > 0 && (
        <div className="rounded-lg bg-amber-50 p-2">
          <p className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-amber-800">Para hacer</p>
          {tareas.map((t) => (
            <Link key={t.texto} href={t.href} className="block rounded-md px-2 py-1.5 text-sm font-medium text-amber-950 hover:bg-amber-100">
              {t.texto} →
            </Link>
          ))}
        </div>
      )}

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Plata</p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          <Dato titulo={`Ganado en ${mes}`} valor={pesos(r.ganadoDelMes)} detalle={`${r.ventasDelMes} ${r.ventasDelMes === 1 ? "venta" : "ventas"}`} />
          <Dato titulo="Te debemos" valor={pesos(r.aCobrar)} detalle="Te lo transferimos" resaltar={r.aCobrar > 0} />
          <Dato titulo="Retenido" valor={pesos(r.retenido)} detalle="Se libera al retirar" />
        </div>
        <p className="mt-1.5 text-xs text-stone-500">Montos que recibís, ya sin la comisión de Sobrá.</p>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Mis lotes</p>
        {r.lotes.total ? (
          <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
            <Chip n={r.lotes.publicados} texto={["publicado", "publicados"]} />
            <Chip n={r.lotes.enRevision} texto={["en revisión", "en revisión"]} />
            <Chip n={r.lotes.reservados} texto={["reservado", "reservados"]} />
            <Chip n={r.lotes.vendidos} texto={["vendido", "vendidos"]} />
          </div>
        ) : (
          <p className="mt-1 text-sm text-stone-600">
            Todavía no publicaste nada.{" "}
            <Link href={PUBLICAR} className="font-semibold text-marca hover:underline">Publicá tu primer sobrante</Link>
          </p>
        )}
      </div>

      {r.ofertasEsperando > 0 && (
        <p className="text-sm text-stone-600">
          Hiciste {r.ofertasEsperando} {r.ofertasEsperando === 1 ? "oferta que espera" : "ofertas que esperan"} respuesta del vendedor.
        </p>
      )}
    </div>
  );
}

function Dato({ titulo, valor, detalle, resaltar }: { titulo: string; valor: string; detalle: string; resaltar?: boolean }) {
  return (
    <div className={`rounded-lg border p-2 ${resaltar ? "border-green-200 bg-green-50" : "border-stone-200"}`}>
      <p className="text-[11px] leading-tight text-stone-500 first-letter:uppercase">{titulo}</p>
      <p className="mt-1 truncate text-sm font-bold">{valor}</p>
      <p className="text-[11px] leading-tight text-stone-500">{detalle}</p>
    </div>
  );
}

function Chip({ n, texto }: { n: number; texto: [string, string] }) {
  return (
    <span className={`rounded-full px-2.5 py-1 font-semibold ${n ? "bg-stone-100 text-stone-800" : "bg-stone-50 text-stone-400"}`}>
      {n} {texto[n === 1 ? 0 : 1]}
    </span>
  );
}
