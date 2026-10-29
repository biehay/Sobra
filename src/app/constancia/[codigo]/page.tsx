import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BotonImprimir } from "@/components/boton-imprimir";
import { Logo } from "@/components/logo";
import { peso, verificarConstancia } from "@/lib/impacto";
import { urlSitio } from "@/lib/email/plantillas";

export const metadata: Metadata = { title: "Constancia de material recuperado" };

// Página pública: la ve quien tenga el código (la empresa, un auditor, un
// cliente). Desde acá se imprime o se guarda como PDF.
export default async function Constancia({ params }: PageProps<"/constancia/[codigo]">) {
  const { codigo } = await params;
  if (!/^[A-Za-z0-9-]{6,20}$/.test(codigo)) notFound();
  const c = await verificarConstancia(codigo);
  if (!c) notFound();
  const url = urlSitio(`/constancia/${c.codigo}`);

  return (
    <div className="contenedor max-w-3xl py-10 print:max-w-none print:py-0">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <p className="rounded-full bg-green-100 px-3 py-1 text-sm font-semibold text-green-800">✓ Constancia válida, emitida por Sobrá</p>
        <BotonImprimir>Imprimir o guardar como PDF</BotonImprimir>
      </div>

      <article className="tarjeta p-8 sm:p-10 print:border-0 print:p-0">
        <div className="flex items-start justify-between gap-6">
          <Logo className="h-9 w-auto text-petroleo" />
          <div className="text-right text-sm text-stone-500">
            <p>Código de verificación</p>
            <p className="font-mono text-lg font-bold tracking-wider text-petroleo">{c.codigo}</p>
          </div>
        </div>

        <h1 className="mt-10 text-3xl font-extrabold text-petroleo">Constancia de material recuperado</h1>
        <p className="mt-2 text-lg text-stone-700">
          Sobrá deja constancia de que <strong>{c.titular}</strong> realizó, durante el año <strong>{c.anio}</strong>,{" "}
          {c.operaciones} {c.operaciones === 1 ? "operación completada" : "operaciones completadas"} de compraventa de materiales
          de construcción sobrantes a través de la plataforma, con el siguiente resultado:
        </p>

        {/* Solo los números que corresponden: quien solo vendió no tiene material reutilizado ni CO₂. */}
        <dl className="mt-8 grid gap-4 sm:grid-cols-3">
          {Number(c.kg_recuperados) > 0 && <Dato titulo="Material que no fue a residuos" valor={peso(Number(c.kg_recuperados))} detalle="Vendido para su reutilización" />}
          {Number(c.kg_reutilizados) > 0 && <Dato titulo="Material reutilizado" valor={peso(Number(c.kg_reutilizados))} detalle="Comprado en lugar de material nuevo" />}
          {Number(c.co2_evitado) > 0 && <Dato titulo="CO₂ evitado (estimado)" valor={peso(Number(c.co2_evitado))} detalle="Por no fabricar el material reutilizado" />}
        </dl>

        <h2 className="mt-10 font-bold text-petroleo">Cómo se calculó</h2>
        <ul className="mt-2 space-y-1 text-sm text-stone-700 [&_li]:ml-5 [&_li]:list-disc">
          <li>Solo cuentan operaciones completadas: el comprador retiró el material y lo aceptó con el código de retiro.</li>
          <li>El peso de cada lote lo declara el vendedor y lo revisa Sobrá antes de publicarlo.</li>
          <li>
            El CO₂ evitado es una <strong>estimación</strong>: el peso reutilizado por un factor de emisiones de fabricación según el
            tipo de material, tomado de bases públicas de carbono incorporado (como ICE, de la Universidad de Bath).
          </li>
          <li>Para no contar dos veces lo mismo, el CO₂ evitado se le asigna al comprador del material.</li>
        </ul>
        <p className="mt-4 text-xs text-stone-500">
          Esta constancia la emite Sobrá con los datos de su plataforma. No es una certificación de un organismo acreditado ni
          reemplaza la documentación que exija la normativa de gestión de residuos.
        </p>

        <div className="mt-10 flex flex-wrap items-end justify-between gap-4 border-t border-stone-200 pt-6 text-sm text-stone-600">
          <p>Emitida el {new Date(c.emitida_at).toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" })}</p>
          <p>
            Verificala en <span className="break-all font-semibold text-petroleo">{url}</span>
          </p>
        </div>
      </article>

      <p className="mt-6 text-center text-sm text-stone-500 print:hidden">
        <Link href="/impacto" className="font-semibold text-marca hover:underline">Cómo calcula Sobrá el impacto</Link>
      </p>
    </div>
  );
}

function Dato({ titulo, valor, detalle }: { titulo: string; valor: string; detalle: string }) {
  return (
    <div className="rounded-xl bg-celeste-claro p-4 print:border print:border-stone-300">
      <dt className="text-sm text-petroleo/80">{titulo}</dt>
      <dd className="mt-1 text-3xl font-extrabold text-petroleo">{valor}</dd>
      <dd className="text-xs text-stone-600">{detalle}</dd>
    </div>
  );
}
