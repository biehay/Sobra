import type { Metadata } from "next";
import Link from "next/link";
import { Aviso } from "@/components/aviso";
import { PestanasPanel } from "@/components/pestanas-panel";
import { exigirRol } from "@/lib/sesion";
import { resumenUsuario } from "@/lib/resumen";
import { cobrosDelVendedor, fecha } from "@/lib/cobros";
import { pesos } from "@/lib/datos";

export const metadata: Metadata = { title: "Cobros" };

export default async function Cobros({ searchParams }: PageProps<"/panel/cobros">) {
  const perfil = await exigirRol("usuario");
  const { ok, error } = await searchParams;
  const [cobros, resumen] = await Promise.all([cobrosDelVendedor(perfil.id), resumenUsuario(perfil.id)]);

  const anio = new Date().toLocaleDateString("es-AR", { year: "numeric", timeZone: "America/Argentina/Buenos_Aires" });
  const delAnio = cobros.filter((c) => fecha(c.transferidoEl).endsWith(anio));
  const cobradoEnElAnio = delAnio.reduce((total, c) => total + c.neto, 0);
  const comisionesDelAnio = delAnio.reduce((total, c) => total + c.comision, 0);

  return (
    <div className="contenedor py-10">
      <PestanasPanel activa="cobros" />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Cobros</h1>
          <p className="text-stone-600">Cada transferencia que te hizo Sobrá, con su comprobante.</p>
        </div>
        {cobros.length > 0 && (
          <a href="/panel/cobros/descargar" className="btn-sec" download>
            Descargar planilla (Excel)
          </a>
        )}
      </div>

      <div className="mt-6">
        <Aviso ok={ok} error={error} />
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-4">
        <Total titulo={`Cobrado en ${anio}`} valor={pesos(cobradoEnElAnio)} detalle={`${delAnio.length} ${delAnio.length === 1 ? "transferencia" : "transferencias"}`} />
        <Total titulo={`Comisiones ${anio}`} valor={pesos(comisionesDelAnio)} detalle="Lo que cobró Sobrá" />
        <Total titulo="Te debemos" valor={pesos(resumen.aCobrar)} detalle="Retiro confirmado, falta transferir" resaltar={resumen.aCobrar > 0} />
        <Total titulo="Retenido" valor={pesos(resumen.retenido)} detalle="Se libera cuando el comprador retira" />
      </div>

      <section className="mt-8">
        <h2 className="mb-4 text-xl font-bold">Transferencias recibidas</h2>
        {cobros.length ? (
          <div className="tarjeta overflow-x-auto">
            <table className="w-full min-w-[40rem] text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-left text-stone-500">
                  <th className="px-4 py-3 font-medium">Fecha</th>
                  <th className="px-4 py-3 font-medium">Lote</th>
                  <th className="px-4 py-3 text-right font-medium">Venta</th>
                  <th className="px-4 py-3 text-right font-medium">Comisión</th>
                  <th className="px-4 py-3 text-right font-medium">Recibiste</th>
                  <th className="px-4 py-3 font-medium">Comprobante</th>
                </tr>
              </thead>
              <tbody>
                {cobros.map((c) => (
                  <tr key={c.id} className="border-b border-stone-100 last:border-0">
                    <td className="whitespace-nowrap px-4 py-3">{fecha(c.transferidoEl)}</td>
                    <td className="px-4 py-3 font-medium">{c.titulo}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">{pesos(c.monto)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-stone-500">-{pesos(c.comision)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-bold">{pesos(c.neto)}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {c.comprobante ? (
                        <a href={`/panel/cobros/comprobante/${c.id}`} target="_blank" rel="noreferrer" className="font-semibold text-marca hover:underline">
                          Ver comprobante
                        </a>
                      ) : (
                        <span className="text-stone-400">Lo estamos cargando</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="tarjeta p-8 text-center">
            <p className="text-stone-600">Todavía no recibiste transferencias.</p>
            <p className="mt-1 text-sm text-stone-500">
              Cuando vendas un lote y el comprador retire, te transferimos el monto menos la comisión y el comprobante aparece acá.
            </p>
            <Link href="/panel/vendedor/lotes/nuevo" className="btn mt-4">Publicar un sobrante</Link>
          </div>
        )}
      </section>
    </div>
  );
}

function Total({ titulo, valor, detalle, resaltar }: { titulo: string; valor: string; detalle: string; resaltar?: boolean }) {
  return (
    <div className={`tarjeta p-4 ${resaltar ? "border-green-200 bg-green-50" : ""}`}>
      <p className="text-sm text-stone-500">{titulo}</p>
      <p className="mt-1 text-2xl font-bold">{valor}</p>
      <p className="text-xs text-stone-500">{detalle}</p>
    </div>
  );
}
