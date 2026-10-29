import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FACTORES_CO2, impactoTotal, peso, verificarConstancia } from "@/lib/impacto";

export const metadata: Metadata = { title: "Impacto: cómo lo calculamos" };

// Explica el cálculo del impacto y deja validar una constancia con su código.
export default async function ComoCalculamos({ searchParams }: PageProps<"/impacto">) {
  const { codigo } = await searchParams;
  let noEncontrada = false;
  if (typeof codigo === "string" && codigo.trim()) {
    const limpio = codigo.trim().replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    if (limpio && (await verificarConstancia(limpio))) redirect(`/constancia/${limpio}`);
    noEncontrada = true;
  }
  const total = await impactoTotal();

  return (
    <div className="contenedor max-w-3xl py-12">
      <h1 className="text-3xl font-bold">El impacto de Sobrá</h1>
      <p className="mt-2 text-stone-600">
        Cada lote que se vende en Sobrá es material que no termina en un volquete y que no hay que volver a fabricar.
      </p>

      {total.operaciones > 0 && (
        <div className="mt-6 grid gap-4 rounded-2xl bg-gradient-to-br from-petroleo to-[#0b4a5e] p-6 text-white sm:grid-cols-2">
          <div>
            <p className="text-4xl font-extrabold">{peso(total.kg)}</p>
            <p className="text-sm text-white/75">de material recuperado en Sobrá</p>
          </div>
          <div>
            <p className="text-4xl font-extrabold">{peso(total.co2)}</p>
            <p className="text-sm text-white/75">de CO₂ evitado (estimado)</p>
          </div>
        </div>
      )}

      <section id="verificar" className="tarjeta mt-8 p-6">
        <h2 className="text-lg font-bold">Verificar una constancia</h2>
        <p className="mt-1 text-sm text-stone-600">Escribí el código que figura arriba a la derecha de la constancia.</p>
        <form action="/impacto" className="mt-3 flex gap-2">
          <label htmlFor="codigo" className="sr-only">Código de verificación</label>
          <input id="codigo" name="codigo" required maxLength={20} placeholder="Ej.: A3F9K2M7Q1X8" className="campo max-w-xs font-mono uppercase" />
          <button className="btn">Verificar</button>
        </form>
        {noEncontrada && (
          <p data-aviso="error" role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            No encontramos una constancia con ese código. Revisá que esté bien escrito.
          </p>
        )}
      </section>

      <div className="mt-10 space-y-4 text-stone-700 [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-petroleo [&_li]:ml-5 [&_li]:list-disc">
        <h2>Cómo lo calculamos</h2>
        <ul>
          <li>
            <strong>Solo operaciones completadas</strong>: el comprador retiró el material y lo aceptó entregando el código de
            retiro.
          </li>
          <li>
            <strong>Kilos</strong>: el vendedor declara el peso aproximado del lote y Sobrá lo revisa con las fotos y las cantidades
            antes de publicarlo. Si el vendedor lo cambia después, el lote vuelve a revisión.
          </li>
          <li>
            <strong>CO₂ evitado</strong>: kilos reutilizados × un factor de emisiones de fabricación según el tipo de material. Es
            una estimación, con valores de referencia de bases públicas de carbono incorporado (como ICE, de la Universidad de
            Bath).
          </li>
          <li>
            <strong>Sin contar dos veces</strong>: al vendedor le contamos los kilos que no fueron a residuos; al comprador, los
            kilos reutilizados y el CO₂ que se evitó al no fabricarlos.
          </li>
        </ul>

        <h2>Factores que usamos</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone-200 text-left text-stone-500">
              <th className="py-2 font-medium">Categoría</th>
              <th className="py-2 text-right font-medium">kg de CO₂ por kg de material nuevo</th>
            </tr>
          </thead>
          <tbody>
            {FACTORES_CO2.map(([categoria, factor]) => (
              <tr key={categoria} className="border-b border-stone-100">
                <td className="py-2">{categoria}</td>
                <td className="py-2 text-right">{factor.toLocaleString("es-AR")}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2>Qué es (y qué no es) la constancia</h2>
        <p>
          La constancia la emite Sobrá con los datos de sus propias operaciones y se puede verificar con su código en esta
          página. Sirve como respaldo para informes de sustentabilidad, licitaciones o clientes. No es una certificación de un
          organismo acreditado ni reemplaza la documentación que exija la normativa de gestión de residuos.
        </p>
      </div>
    </div>
  );
}
