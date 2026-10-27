import type { Metadata } from "next";
import { TarjetaLote } from "@/components/tarjeta-lote";
import { crearClienteServidor } from "@/lib/supabase/server";
import { CATEGORIAS, ZONAS, type Lote } from "@/lib/datos";

export const metadata: Metadata = { title: "Lotes disponibles" };

const ORDENES = {
  recientes: { columna: "publicado_at", ascendente: false, texto: "Más recientes" },
  barato: { columna: "precio_publicado", ascendente: true, texto: "Menor precio" },
  caro: { columna: "precio_publicado", ascendente: false, texto: "Mayor precio" },
} as const;

export default async function Catalogo({ searchParams }: PageProps<"/lotes">) {
  const filtros = await searchParams;
  const q = typeof filtros.q === "string" ? filtros.q.trim() : "";
  const categoria = typeof filtros.categoria === "string" ? filtros.categoria : "";
  const zona = typeof filtros.zona === "string" ? filtros.zona : "";
  const orden = ORDENES[(filtros.orden as keyof typeof ORDENES) ?? "recientes"] ?? ORDENES.recientes;

  const supabase = await crearClienteServidor();
  let consulta = supabase
    .from("lotes")
    .select("*")
    .in("estado", ["publicado", "reservado"])
    .order(orden.columna, { ascending: orden.ascendente })
    .limit(60);
  if (q) {
    // Saca los caracteres que tienen significado en el filtro de PostgREST.
    const termino = q.replace(/[%,()*]/g, " ");
    consulta = consulta.or(`titulo.ilike.%${termino}%,descripcion.ilike.%${termino}%`);
  }
  if (categoria) consulta = consulta.eq("categoria", categoria);
  if (zona) consulta = consulta.eq("zona", zona);
  const { data } = await consulta;
  const lotes = (data ?? []) as Lote[];

  return (
    <div className="contenedor py-10">
      <h1 className="text-3xl font-bold">Lotes disponibles</h1>
      <p className="mt-1 text-stone-600">Materiales sobrantes verificados, con retiro en el AMBA.</p>

      <form className="tarjeta mt-6 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
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
        <div className="flex gap-2">
          <select name="orden" defaultValue={(filtros.orden as string) ?? "recientes"} className="campo" aria-label="Orden">
            {Object.entries(ORDENES).map(([valor, o]) => (
              <option key={valor} value={valor}>
                {o.texto}
              </option>
            ))}
          </select>
          <button className="btn">Filtrar</button>
        </div>
      </form>

      {lotes.length ? (
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {lotes.map((lote) => (
            <TarjetaLote key={lote.id} lote={lote} />
          ))}
        </div>
      ) : (
        <p className="tarjeta mt-8 p-10 text-center text-stone-500">No encontramos lotes con esos filtros.</p>
      )}
    </div>
  );
}
