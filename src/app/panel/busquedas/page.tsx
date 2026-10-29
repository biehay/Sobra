import type { Metadata } from "next";
import Link from "next/link";
import { Aviso } from "@/components/aviso";
import { BotonEnviar } from "@/components/boton-enviar";
import { PestanasPanel } from "@/components/pestanas-panel";
import { TarjetaLote } from "@/components/tarjeta-lote";
import { exigirRol } from "@/lib/sesion";
import { misBusquedas } from "@/lib/busquedas";
import { estadoFavorito, idsFavoritos } from "@/lib/favoritos";
import { CATEGORIAS, ZONAS, pesos } from "@/lib/datos";
import { cambiarBusqueda, crearBusqueda } from "./acciones";

export const metadata: Metadata = { title: "Lo busco" };

export default async function Busquedas({ searchParams }: PageProps<"/panel/busquedas">) {
  await exigirRol("usuario");
  const { ok, error, q, categoria, zona } = await searchParams;
  const [busquedas, favoritos] = await Promise.all([misBusquedas(), idsFavoritos()]);
  const texto = (v: unknown) => (typeof v === "string" ? v : "");

  return (
    <div className="contenedor py-10">
      <PestanasPanel activa="busquedas" />
      <h1 className="text-3xl font-bold">Lo busco</h1>
      <p className="text-stone-600">
        Contanos qué material necesitás y te avisamos por email apenas se publique un lote que coincida. No tenés que entrar
        todos los días a buscar.
      </p>

      <div className="mt-6">
        <Aviso ok={ok} error={error} />
      </div>

      <form action={crearBusqueda} className="tarjeta mt-4 grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <label htmlFor="texto" className="etiqueta">Qué buscás</label>
          <input id="texto" name="texto" required minLength={3} maxLength={80} defaultValue={texto(q)} placeholder="Ej.: porcelanato 60x60 gris" className="campo" />
        </div>
        <div>
          <label htmlFor="categoria" className="etiqueta">Categoría</label>
          <select id="categoria" name="categoria" defaultValue={texto(categoria)} className="campo">
            <option value="">Cualquiera</option>
            {CATEGORIAS.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="zona" className="etiqueta">Zona</label>
          <select id="zona" name="zona" defaultValue={texto(zona)} className="campo">
            <option value="">Todo el AMBA</option>
            {ZONAS.map((z) => (
              <option key={z}>{z}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="precio_max" className="etiqueta">Hasta (opcional)</label>
          <input id="precio_max" name="precio_max" type="number" min={1} placeholder="$" className="campo" />
        </div>
        <div className="sm:col-span-2 lg:col-span-5">
          <BotonEnviar className="btn" pendiente="Guardando...">Avisame cuando aparezca</BotonEnviar>
        </div>
      </form>

      <section className="mt-10 space-y-6">
        {busquedas.length ? (
          busquedas.map((b) => (
            <div key={b.id} className="tarjeta p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-semibold">“{b.texto}”</p>
                  <p className="text-sm text-stone-500">
                    {[b.categoria, b.zona ?? "Todo el AMBA", b.precio_max ? `hasta ${pesos(b.precio_max)}` : null].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {b.activa ? (
                    <span className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-800">Avisándote</span>
                  ) : (
                    <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-600">Pausada</span>
                  )}
                  <form action={cambiarBusqueda}>
                    <input type="hidden" name="id" value={b.id} />
                    <BotonEnviar name="accion" value={b.activa ? "pausar" : "reactivar"} className="btn-sec px-3 py-1.5" pendiente="...">
                      {b.activa ? "Pausar" : "Reactivar"}
                    </BotonEnviar>
                  </form>
                  <form action={cambiarBusqueda}>
                    <input type="hidden" name="id" value={b.id} />
                    <BotonEnviar name="accion" value="borrar" className="btn-peligro px-3 py-1.5" pendiente="..." confirmar="¿Borrás esta búsqueda?">
                      Borrar
                    </BotonEnviar>
                  </form>
                </div>
              </div>
              {b.activa &&
                (b.lotes.length ? (
                  <>
                    <p className="mt-4 text-sm font-semibold text-celeste-oscuro">
                      {b.lotes.length === 1 ? "Ya hay 1 lote que coincide" : `Ya hay ${b.lotes.length} lotes que coinciden`}
                    </p>
                    <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {b.lotes.slice(0, 6).map((lote) => (
                        <TarjetaLote key={lote.id} lote={lote} favorito={estadoFavorito(favoritos, lote)} volver="/panel/busquedas" />
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="mt-3 text-sm text-stone-500">Todavía no hay lotes que coincidan. Te avisamos apenas aparezca uno.</p>
                ))}
            </div>
          ))
        ) : (
          <p className="tarjeta p-6 text-stone-500">
            Todavía no guardaste búsquedas. También podés guardar una desde el <Link href="/lotes" className="font-semibold text-marca hover:underline">catálogo</Link>, después de buscar.
          </p>
        )}
      </section>
    </div>
  );
}
