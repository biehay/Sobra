import type { Metadata } from "next";
import Link from "next/link";
import { Aviso } from "@/components/aviso";
import { BotonEnviar } from "@/components/boton-enviar";
import { PestanasPanel } from "@/components/pestanas-panel";
import { exigirRol } from "@/lib/sesion";
import { anioDe, miImpacto, misConstancias, peso } from "@/lib/impacto";
import { emitirConstancia } from "./acciones";

export const metadata: Metadata = { title: "Mi impacto" };

export default async function Impacto({ searchParams }: PageProps<"/panel/impacto">) {
  await exigirRol("usuario");
  const { ok, error, anio: anioParam } = await searchParams;
  const [operaciones, constancias] = await Promise.all([miImpacto(), misConstancias()]);

  const anios = [...new Set(operaciones.map((o) => anioDe(o.completada_at)))].sort((a, b) => b - a);
  const anio = Number(anioParam) || anios[0] || anioDe(new Date().toISOString());
  const delAnio = operaciones.filter((o) => anioDe(o.completada_at) === anio);
  const recuperados = delAnio.filter((o) => o.rol === "vendedor").reduce((t, o) => t + o.kg, 0);
  const reutilizados = delAnio.filter((o) => o.rol === "comprador").reduce((t, o) => t + o.kg, 0);
  const co2 = delAnio.reduce((t, o) => t + o.co2, 0);

  return (
    <div className="contenedor py-10">
      <PestanasPanel activa="impacto" />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Mi impacto</h1>
          <p className="text-stone-600">Cuánto material salvaste de ir a residuos y cuánto CO₂ se evitó con tus operaciones.</p>
        </div>
        {anios.length > 1 && (
          <nav aria-label="Año" className="flex gap-1">
            {anios.map((a) => (
              <Link key={a} href={`/panel/impacto?anio=${a}`} aria-current={a === anio ? "page" : undefined} className={a === anio ? "btn px-3 py-1.5" : "btn-sec px-3 py-1.5"}>
                {a}
              </Link>
            ))}
          </nav>
        )}
      </div>

      <div className="mt-6">
        <Aviso ok={ok} error={error} />
      </div>

      <section className="mt-6 overflow-hidden rounded-2xl bg-gradient-to-br from-petroleo to-[#0b4a5e] p-6 text-white sm:p-8">
        <p className="text-sm font-semibold tracking-wide text-celeste">EN {anio}</p>
        <div className="mt-4 grid gap-6 sm:grid-cols-3">
          <Numero valor={peso(recuperados)} texto="de material tuyo que no fue a residuos (como vendedor)" />
          <Numero valor={peso(reutilizados)} texto="de material reutilizado en tus obras (como comprador)" />
          <Numero valor={peso(co2)} texto="de CO₂ evitado por no fabricar material nuevo (estimado)" />
        </div>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          {delAnio.length > 0 ? (
            <form action={emitirConstancia}>
              <input type="hidden" name="anio" value={anio} />
              <BotonEnviar className="btn-celeste" pendiente="Emitiendo...">Emitir constancia {anio}</BotonEnviar>
            </form>
          ) : (
            <p className="text-white/80">Cuando completes tu primera operación, vas a poder emitir tu constancia.</p>
          )}
          <Link href="/impacto" className="text-sm font-semibold text-white/80 underline hover:text-white">Cómo lo calculamos</Link>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="mb-4 text-xl font-bold">Operaciones de {anio}</h2>
        {delAnio.length ? (
          <div className="tarjeta overflow-x-auto">
            <table className="w-full min-w-[36rem] text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-left text-stone-500">
                  <th className="px-4 py-3 font-medium">Fecha</th>
                  <th className="px-4 py-3 font-medium">Lote</th>
                  <th className="px-4 py-3 font-medium">Como</th>
                  <th className="px-4 py-3 text-right font-medium">Material</th>
                  <th className="px-4 py-3 text-right font-medium">CO₂ evitado</th>
                </tr>
              </thead>
              <tbody>
                {delAnio.map((o) => (
                  <tr key={o.oferta_id} className="border-b border-stone-100 last:border-0">
                    <td className="whitespace-nowrap px-4 py-3">{new Date(o.completada_at).toLocaleDateString("es-AR")}</td>
                    <td className="px-4 py-3 font-medium">{o.titulo}</td>
                    <td className="px-4 py-3">{o.rol === "vendedor" ? "Vendedor" : "Comprador"}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">{peso(o.kg)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">{o.rol === "comprador" ? peso(o.co2) : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="tarjeta p-6 text-stone-500">Todavía no tenés operaciones completadas en {anio}.</p>
        )}
      </section>

      {constancias.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-4 text-xl font-bold">Constancias emitidas</h2>
          <div className="tarjeta divide-y divide-stone-100">
            {constancias.map((c) => (
              <div key={c.codigo} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-semibold">Constancia {c.anio}</p>
                  <p className="text-sm text-stone-500">
                    Emitida el {new Date(c.emitida_at).toLocaleDateString("es-AR")} · Código <span className="font-mono">{c.codigo}</span>
                  </p>
                </div>
                <Link href={`/constancia/${c.codigo}`} className="btn-sec px-3 py-1.5">Ver y descargar</Link>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Numero({ valor, texto }: { valor: string; texto: string }) {
  return (
    <div>
      <p className="text-4xl font-extrabold">{valor}</p>
      <p className="mt-1 text-sm text-white/75">{texto}</p>
    </div>
  );
}
