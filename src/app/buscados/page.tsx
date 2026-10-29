import type { Metadata } from "next";
import Link from "next/link";
import { busquedasPublicas } from "@/lib/busquedas";
import { pesos } from "@/lib/datos";

export const metadata: Metadata = { title: "Lo que se está buscando" };

// La demanda: lo que los compradores guardaron en "Lo busco", sin decir quién.
// Le sirve al vendedor para darse cuenta de que tiene algo para vender.
export default async function Buscados() {
  const busquedas = await busquedasPublicas();
  return (
    <div className="contenedor py-12">
      <h1 className="text-3xl font-bold">Lo que se está buscando</h1>
      <p className="mt-2 max-w-2xl text-stone-600">
        Esto es lo que los compradores de Sobrá le pidieron que les avisemos. Si tenés algo de esto sobrando en una obra o en
        tu depósito, publicalo: les llega un aviso apenas lo aprobamos.
      </p>
      <Link href="/panel/vendedor/lotes/nuevo" className="btn mt-5">+ Publicar un sobrante</Link>

      {busquedas.length ? (
        <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {busquedas.map((b, i) => (
            <li key={i} className="tarjeta p-5">
              <p className="font-semibold">“{b.texto}”</p>
              <p className="mt-1 text-sm text-stone-500">
                {[b.categoria, b.zona ?? "Todo el AMBA", b.precio_max ? `hasta ${pesos(b.precio_max)}` : null].filter(Boolean).join(" · ")}
              </p>
              {b.cantidad > 1 && <p className="mt-2 text-sm font-semibold text-celeste-oscuro">{b.cantidad} compradores lo buscan</p>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="tarjeta mt-8 p-8 text-center text-stone-500">Todavía no hay búsquedas guardadas.</p>
      )}
    </div>
  );
}
