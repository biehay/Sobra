import type { Metadata } from "next";
import { TarjetaLote } from "@/components/tarjeta-lote";
import { crearClienteServidor } from "@/lib/supabase/server";
import { estadoFavorito, idsFavoritos } from "@/lib/favoritos";
import { CATEGORIAS, CONDICIONES, ZONAS, descuento, type Condicion, type Lote } from "@/lib/datos";

export const metadata: Metadata = { title: "Lotes disponibles" };

const ORDENES = {
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
  const claveOrden = typeof filtros.orden === "string" && filtros.orden in ORDENES ? (filtros.orden as keyof typeof ORDENES) : "recientes";
  const orden = ORDENES[claveOrden];

  const supabase = await crearClienteServidor();
  let consulta = supabase
    .from("lotes")
    .select("*")
    .in("estado", ["publicado", "reservado"])
    .order(orden.columna, { ascending: orden.ascendente })
    .limit(claveOrden === "descuento" ? 300 : 60);
  if (claveOrden === "descuento") consulta = consulta.not("precio_lista", "is", null);
  if (q) {
    // Saca los caracteres que tienen significado en el filtro de PostgREST.
    const termino = q.replace(/[%,()*]/g, " ");
    consulta = consulta.or(`titulo.ilike.%${termino}%,descripcion.ilike.%${termino}%`);
  }
  if (categoria) consulta = consulta.eq("categoria", categoria);
  if (zona) consulta = consulta.eq("zona", zona);
  if (condicion) consulta = consulta.eq("condicion", condicion);
  const [{ data }, favoritos] = await Promise.all([consulta, idsFavoritos()]);
  // "Avisame cuando aparezca": a quien no tiene cuenta lo lleva a crearla y después a Lo busco.
  const rutaBusqueda = `/panel/busquedas?${new URLSearchParams(Object.entries({ q: q || categoria, categoria, zona }).filter(([, v]) => v))}`;
  const avisame = favoritos?.usuarioId === null ? `/registro?motivo=busqueda&volver=${encodeURIComponent(rutaBusqueda)}` : rutaBusqueda;
  // Para volver a esta misma búsqueda después de tocar el corazón.
  const volver = `/lotes?${new URLSearchParams(Object.entries({ q, categoria, zona, condicion, orden: claveOrden }).filter(([, v]) => v))}`;
  let lotes = (data ?? []) as Lote[];
  if (claveOrden === "descuento") {
    const rebaja = (l: Lote) => descuento(l.precio_publicado ?? l.precio_pedido, l.precio_lista) ?? 0;
    lotes = lotes.filter((l) => rebaja(l) > 0).sort((a, b) => rebaja(b) - rebaja(a)).slice(0, 60);
  }

  return (
    <div className="contenedor py-10">
      <h1 className="text-3xl font-bold">Lotes disponibles</h1>
      <p className="mt-1 text-stone-600">Materiales sobrantes verificados, con retiro en el AMBA.</p>

      <form className="tarjeta mt-6 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6">
        <input name="q" defaultValue={q} placeholder="Buscar: porcelanato, caño, cemento..." className="campo lg:col-span-2" />
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
            {Object.entries(ORDENES).map(([valor, o]) => (
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
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {lotes.map((lote) => (
            <TarjetaLote key={lote.id} lote={lote} favorito={estadoFavorito(favoritos, lote)} volver={volver} />
          ))}
        </div>
      ) : (
        <p className="tarjeta mt-8 p-10 text-center text-stone-500">No encontramos lotes con esos filtros.</p>
      )}
    </div>
  );
}
