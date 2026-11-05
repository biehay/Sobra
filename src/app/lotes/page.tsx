import Link from "next/link";
import { buscarLotes } from "@/lib/sugerencias";
import type { Metadata } from "next";
import { TarjetaLote } from "@/components/tarjeta-lote";
import { crearClienteServidor } from "@/lib/supabase/server";
import { estadoFavorito, idsFavoritos } from "@/lib/favoritos";
import { obtenerPerfil } from "@/lib/sesion";
import { ordenarParaUsuario, parecidosABusqueda } from "@/lib/recomendaciones";
import { CATEGORIAS, CONDICIONES, ZONAS, descuento, type Condicion, type Lote } from "@/lib/datos";

export const metadata: Metadata = { title: "Lotes disponibles" };

const ORDENES = {
  // Lo más relevante para esta persona primero (solo con cuenta; es el orden por defecto).
  paravos: { columna: "publicado_at", ascendente: false, texto: "Para vos" },
  recientes: { columna: "publicado_at", ascendente: false, texto: "Más recientes" },
  barato: { columna: "precio_publicado", ascendente: true, texto: "Menor precio" },
  caro: { columna: "precio_publicado", ascendente: false, texto: "Mayor precio" },
  // El descuento no es una columna: se traen los que tienen precio de lista y se ordenan acá.
  descuento: { columna: "publicado_at", ascendente: false, texto: "Mayor descuento" },
} as const;

export default async function Catalogo({ searchParams }: PageProps<"/lotes">) {
  const filtros = await searchParams;
  const q = typeof filtros.q === "string" ? filtros.q.trim() : "";
  const categoria = typeof filtros.categoria === "string" ? filtros.categoria : "";
  const zona = typeof filtros.zona === "string" ? filtros.zona : "";
  const condicion = typeof filtros.condicion === "string" && filtros.condicion in CONDICIONES ? (filtros.condicion as Condicion) : "";
  const perfil = await obtenerPerfil();
  const conCuenta = !!perfil;
  const pedido = typeof filtros.orden === "string" && filtros.orden in ORDENES ? (filtros.orden as keyof typeof ORDENES) : null;
  const claveOrden = pedido === "paravos" && !conCuenta ? "recientes" : (pedido ?? (conCuenta ? "paravos" : "recientes"));
  const orden = ORDENES[claveOrden];
  // Paginación: de a 24 lotes; "Ver más" suma 24 (hasta 480 en una misma página).
  const POR_PAGINA = 24;
  const hasta = Math.min(480, Math.max(POR_PAGINA, Math.ceil((Number(filtros.hasta) || POR_PAGINA) / POR_PAGINA) * POR_PAGINA));

  const supabase = await crearClienteServidor();
  let consulta = supabase
    .from("lotes")
    .select("*")
    .in("estado", ["publicado", "reservado"])
    .order(orden.columna, { ascending: orden.ascendente })
    // Con búsqueda, se traen más y se filtran acá (entiende tildes, plurales, sinónimos y categorías).
    .limit(q ? 1000 : claveOrden === "descuento" || claveOrden === "paravos" ? Math.max(300, hasta + 1) : hasta + 1);
  if (claveOrden === "descuento") consulta = consulta.not("precio_lista", "is", null);
  if (categoria) consulta = consulta.eq("categoria", categoria);
  if (zona) consulta = consulta.eq("zona", zona);
  if (condicion) consulta = consulta.eq("condicion", condicion);
  const [{ data }, favoritos] = await Promise.all([consulta, idsFavoritos()]);
  // "Avisame cuando aparezca": a quien no tiene cuenta lo lleva a crearla y después a Lo busco.
  const rutaBusqueda = `/panel/busquedas?${new URLSearchParams(Object.entries({ q: q || categoria, categoria, zona }).filter(([, v]) => v))}`;
  const avisame = favoritos?.usuarioId === null ? `/registro?motivo=busqueda&volver=${encodeURIComponent(rutaBusqueda)}` : rutaBusqueda;
  // Para volver a esta misma búsqueda después de tocar el corazón.
  const parametros = (cambios: Record<string, string> = {}) =>
    new URLSearchParams(Object.entries({ q, categoria, zona, condicion, orden: claveOrden, ...cambios }).filter(([, v]) => v));
  const volver = `/lotes?${parametros(hasta > POR_PAGINA ? { hasta: String(hasta) } : {})}`;
  const filtrosActivos = [q, categoria, zona, condicion].filter(Boolean).length;
  let lotes = (data ?? []) as Lote[];
  // Búsqueda: si no eligió un orden, primero lo que mejor coincide; si eligió uno, se respeta.
  const porRelevancia = !!q && !pedido;
  if (q) {
    const encontrados = buscarLotes(q, lotes);
    const ids = new Set(encontrados.map((l) => l.id));
    lotes = porRelevancia ? encontrados : lotes.filter((l) => ids.has(l.id));
  }
  if (claveOrden === "descuento") {
    const rebaja = (l: Lote) => descuento(l.precio_publicado ?? l.precio_pedido, l.precio_lista) ?? 0;
    lotes = lotes.filter((l) => rebaja(l) > 0).sort((a, b) => rebaja(b) - rebaja(a));
  }
  if (claveOrden === "paravos" && perfil && !porRelevancia) lotes = await ordenarParaUsuario(lotes, perfil.id, perfil.zona);
  const hayMas = lotes.length > hasta;
  lotes = lotes.slice(0, hasta);
  // Si no hay nada así, lo más parecido (entiende sinónimos y medidas) en vez de una página vacía.
  const parecidos = !lotes.length && (q || categoria) ? await parecidosABusqueda(q, categoria || null, zona || null, perfil?.id ?? null) : [];

  return (
    <div className="contenedor py-10">
      <h1 className="text-3xl font-bold">Lotes disponibles</h1>
      <p className="mt-1 text-stone-600">Materiales sobrantes con retiro en el AMBA y pago protegido.</p>

      {/* En el celular los filtros se pliegan en un botón para que los lotes entren en la primera pantalla. */}
      <input type="checkbox" id="ver-filtros" className="peer sr-only" />
      <label
        htmlFor="ver-filtros"
        className="tarjeta mt-4 flex cursor-pointer items-center justify-between px-4 py-3 text-sm font-semibold peer-focus-visible:ring-2 peer-focus-visible:ring-marca sm:hidden"
      >
        <span>
          Filtros y orden
          {filtrosActivos > 0 && <span className="ml-2 rounded-full bg-marca px-2 py-0.5 text-xs text-white">{filtrosActivos}</span>}
        </span>
        <span aria-hidden className="text-stone-500">▾</span>
      </label>
      <form className="tarjeta mt-2 hidden gap-3 p-4 peer-checked:grid sm:mt-6 sm:grid sm:grid-cols-2 lg:grid-cols-6">
        <input name="q" defaultValue={q} placeholder="Buscar: porcelanato, caño, fibra óptica..." className="campo lg:col-span-2" />
        <select name="categoria" defaultValue={categoria} className="campo" aria-label="Categoría">
          <option value="">Todas las categorías</option>
          {CATEGORIAS.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <select name="zona" defaultValue={zona} className="campo" aria-label="Zona">
          <option value="">Todo el AMBA</option>
          {ZONAS.map((z) => (
            <option key={z}>{z}</option>
          ))}
        </select>
        <select name="condicion" defaultValue={condicion} className="campo" aria-label="Estado del material">
          <option value="">Cualquier estado</option>
          {Object.entries(CONDICIONES).map(([valor, texto]) => (
            <option key={valor} value={valor}>
              {texto}
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <select name="orden" defaultValue={claveOrden} className="campo" aria-label="Orden">
            {Object.entries(ORDENES)
              .filter(([valor]) => valor !== "paravos" || conCuenta)
              .map(([valor, o]) => (
              <option key={valor} value={valor}>
                {o.texto}
              </option>
            ))}
          </select>
          <button className="btn">Filtrar</button>
        </div>
      </form>

      {(q || categoria) && (
        <p className="mt-4 text-sm text-stone-600">
          {lotes.length ? "¿No es justo lo que necesitás?" : "Todavía no hay lotes así."}{" "}
          <a
            href={avisame}
            className="font-semibold text-marca hover:underline"
          >
            Avisame cuando aparezca
          </a>
        </p>
      )}

      {lotes.length ? (
        <div className="mt-8 grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3">
          {lotes.map((lote, i) => (
            // Cada tarjeta tiene su ancla: "Ver más" lleva directo a la primera nueva.
            <div key={lote.id} id={`lote-${i + 1}`} className="scroll-mt-32">
              <TarjetaLote lote={lote} favorito={estadoFavorito(favoritos, lote)} volver={volver} />
            </div>
          ))}
        </div>
      ) : (
        <div className="tarjeta mt-8 space-y-2 p-10 text-center text-stone-500">
          <p>{q ? <>No encontramos lotes para <strong className="text-petroleo">“{q}”</strong>{filtrosActivos > 1 && " con esos filtros"}.</> : "No encontramos lotes con esos filtros."}</p>
          <p className="text-sm">
            Probá con menos palabras o{" "}
            <Link href="/lotes" className="font-semibold text-marca hover:underline">mirá todos los lotes</Link>.
          </p>
        </div>
      )}

      {hayMas && (
        <div className="mt-8 text-center">
          <Link href={`/lotes?${parametros({ hasta: String(hasta + POR_PAGINA) })}#lote-${hasta + 1}`} data-ver-mas className="btn-sec px-8">
            Ver más lotes
          </Link>
        </div>
      )}

      {parecidos.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-5 text-xl font-bold">Lo más parecido a lo que buscaste</h2>
          <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3">
            {parecidos.map((r) => (
              <TarjetaLote key={r.lote.id} lote={r.lote} motivo={r.motivo.texto} origen="rec-busqueda" favorito={estadoFavorito(favoritos, r.lote)} volver={volver} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
