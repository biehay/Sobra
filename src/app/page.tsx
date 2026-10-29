import Link from "next/link";
import { TarjetaLote } from "@/components/tarjeta-lote";
import { crearClienteServidor } from "@/lib/supabase/server";
import { estadoFavorito, idsFavoritos } from "@/lib/favoritos";
import type { Lote } from "@/lib/datos";

const PASOS_VENDEDOR = [
  ["Cargás el lote", "Fotos, lista de materiales y cuánto querés recuperar. Te lleva 5 minutos."],
  ["Lo verificamos", "Revisamos el estado y te sugerimos un precio para que se venda rápido."],
  ["Recibís ofertas", "Solo de compradores verificados. Vos elegís cuál aceptar."],
  ["Cobrás seguro", "El comprador paga antes del retiro y te transferimos al completarse."],
];

const PASOS_COMPRADOR = [
  ["Encontrás el lote", "Materiales nuevos o sin uso, con descuento sobre el precio de lista."],
  ["Hacés tu oferta", "Ofertás por el lote completo. Te avisamos cuando el vendedor responde."],
  ["Pagás protegido", "Pagás a Sobrá y retenemos el dinero hasta que retirás el material."],
  ["Retirás", "Te pasamos dirección y contacto, o coordinamos el flete por vos."],
];

export default async function Inicio() {
  const supabase = await crearClienteServidor();
  const { data } = await supabase
    .from("lotes")
    .select("*")
    .eq("estado", "publicado")
    .order("publicado_at", { ascending: false })
    .limit(6);
  const lotes = (data ?? []) as Lote[];
  const favoritos = await idsFavoritos();

  return (
    <>
      <section className="bg-gradient-to-br from-petroleo via-petroleo to-[#0b4a5e] text-white">
        <div className="contenedor grid gap-10 py-16 sm:py-24 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="mb-4 inline-block rounded-full bg-white/10 px-3 py-1 text-sm font-semibold tracking-wide text-celeste">
              Sobrantes de obra · AMBA
            </p>
            <h1 className="text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
              Vendé lo que te sobró <span className="text-celeste">en días</span>, con el cobro asegurado.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-white/80">
              Sobrá conecta constructoras, corralones y distribuidores que tienen materiales sin usar con
              compradores verificados. Sin vender pieza por pieza, sin grupos de WhatsApp y sin riesgo de no
              cobrar.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/registro?volver=/panel/vendedor/lotes/nuevo" className="btn px-6 py-3 text-base">
                Publicar mi sobrante
              </Link>
              <Link href="/lotes" className="btn-celeste px-6 py-3 text-base">
                Comprar materiales
              </Link>
            </div>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {[
              ["Lotes verificados", "Revisamos fotos y estado antes de publicar."],
              ["Precio sugerido", "Te orientamos según el precio de lista y el estado."],
              ["Cobro protegido", "El comprador paga antes de retirar."],
              ["Retiro coordinado", "Con fletes asociados por zona."],
            ].map(([titulo, texto]) => (
              <li key={titulo} className="rounded-xl border border-white/10 bg-white/5 p-5">
                <p className="font-semibold">{titulo}</p>
                <p className="mt-1 text-sm text-white/70">{texto}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="contenedor py-14">
        <div className="mb-6 flex items-end justify-between">
          <h2 className="text-2xl font-bold">Últimos lotes</h2>
          <Link href="/lotes" className="text-sm font-semibold text-marca hover:underline">
            Ver todos
          </Link>
        </div>
        {lotes.length ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {lotes.map((lote) => (
              <TarjetaLote key={lote.id} lote={lote} favorito={estadoFavorito(favoritos, lote)} volver="/" />
            ))}
          </div>
        ) : (
          <p className="tarjeta p-8 text-center text-stone-500">
            Todavía no hay lotes publicados. ¿Tenés un sobrante?{" "}
            <Link href="/registro?volver=/panel/vendedor/lotes/nuevo" className="font-semibold text-marca hover:underline">
              Publicalo primero
            </Link>
            .
          </p>
        )}
      </section>

      <section id="como-funciona" className="border-t border-stone-200 bg-white py-14">
        <div className="contenedor grid gap-10 lg:grid-cols-2">
          {[
            ["Si vendés", PASOS_VENDEDOR],
            ["Si comprás", PASOS_COMPRADOR],
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
