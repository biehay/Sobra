"use client";

import { useState, useTransition } from "react";
import { pesos } from "@/lib/datos";
import type { InformeCompleto } from "@/lib/precio-sugerido";
import { sugerirPrecioConIA } from "./precio-ia";

// Botón "Sugerir precio con IA": busca cuánto cuesta el material nuevo en el
// mercado y propone un precio menor. Muestra de dónde sacó los datos.
export function PrecioConIA({ datosDelLote, alUsar }: { datosDelLote: () => unknown; alUsar: (mercado: number, sugerido: number) => void }) {
  const [informe, setInforme] = useState<InformeCompleto | null>(null);
  const [error, setError] = useState("");
  const [buscando, empezar] = useTransition();

  function consultar() {
    setError("");
    empezar(async () => {
      const resultado = await sugerirPrecioConIA(datosDelLote());
      if (resultado.ok) setInforme(resultado.informe);
      else setError(resultado.error);
    });
  }

  return (
    <div className="rounded-lg border border-celeste/50 bg-celeste-claro p-4 text-petroleo">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-semibold">¿No sabés a cuánto publicarlo?</p>
          <p className="text-sm text-petroleo/80">
            La IA busca cuánto cuesta hoy este material nuevo en tiendas, corralones y proveedores del rubro, lo compara con lo parecido que hay publicado y vendido en Sobrá y te sugiere un precio para que se venda rápido.
          </p>
        </div>
        <button type="button" onClick={consultar} disabled={buscando} className="btn-celeste shrink-0">
          {buscando ? "Buscando precios..." : informe ? "Volver a calcular" : "Sugerir precio con IA"}
        </button>
      </div>
      {buscando && <p className="mt-3 text-sm">Esto puede tardar hasta un minuto: está revisando varias tiendas.</p>}
      {error && <p data-aviso="error" role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}

      {informe && !buscando && (
        <div className="mt-4 space-y-3 rounded-lg bg-white p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-sm text-stone-500">Nuevo, en el mercado</p>
              <p className="text-2xl font-bold">{pesos(informe.total_mercado_ars)}</p>
            </div>
            <div>
              <p className="text-sm text-stone-500">Te sugerimos publicarlo a</p>
              <p className="text-2xl font-bold text-marca">{pesos(informe.sugerido)}</p>
              <p className="text-xs text-stone-500">{informe.motivo}</p>
              {informe.deUsuarios > 0 && informe.coherencia !== "usuarios_descartados" && (
                <p className="text-xs text-stone-500">
                  {informe.coherencia === "coinciden" ? "Coincide con" : "Según"} lo que{" "}
                  {informe.deUsuarios === 1 ? "pagó 1 persona" : `pagaron ${informe.deUsuarios} personas`} en Sobrá por el mismo producto.
                </p>
              )}
            </div>
          </div>
          {informe.referencia.comparables.length > 0 && (
            <div data-comparables className="rounded-lg bg-stone-50 p-3 text-sm">
              <p className="font-semibold">
                En Sobrá: {informe.referencia.comparables.length === 1 ? "1 lote parecido" : `${informe.referencia.comparables.length} lotes parecidos`}
                {informe.referencia.medianaPorUnidad && informe.referencia.unidad && (
                  <span className="font-normal text-stone-600">
                    {" "}· alrededor de {pesos(informe.referencia.medianaPorUnidad)} por {informe.referencia.unidad === "m2" ? "m²" : informe.referencia.unidad}, llevado al estado de tu lote
                  </span>
                )}
              </p>
              <ul className="mt-1 space-y-0.5 text-stone-700">
                {informe.referencia.comparables.map((c) => (
                  <li key={c.id}>
                    • {c.titulo}: {pesos(c.precio)}
                    {c.vendido && <span className="ml-1 rounded bg-green-100 px-1 text-xs font-semibold text-green-800">vendido</span>}
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-xs text-stone-500">Calculado {informe.descuento}% por debajo del precio nuevo por el estado, y comparado con estos lotes.</p>
            </div>
          )}
          {informe.detalle.length > 0 && (
            <ul className="space-y-0.5 text-sm text-stone-700">
              {informe.detalle.map((d, i) => (
                <li key={i}>
                  • {d.material} ({d.cantidad}): {pesos(d.precio_unitario_ars)} c/u → {pesos(d.subtotal_ars)}
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-stone-500">
            Confianza {informe.confianza}. {informe.notas} Es una estimación: revisala antes de usarla. Al revisar el lote te confirmamos el
            precio de publicación.
          </p>
          <button type="button" onClick={() => alUsar(informe.total_mercado_ars, informe.sugerido)} className="btn">
            Usar {pesos(informe.sugerido)}
          </button>
        </div>
      )}
    </div>
  );
}
