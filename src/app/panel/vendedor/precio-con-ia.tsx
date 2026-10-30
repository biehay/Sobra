"use client";

import { useState, useTransition } from "react";
import { pesos } from "@/lib/datos";
import type { InformePrecio } from "@/lib/precio-mercado";
import { sugerirPrecioConIA } from "./precio-ia";

// Botón "Sugerir precio con IA": busca cuánto cuesta el material nuevo en el
// mercado y propone un precio menor. Muestra de dónde sacó los datos.
export function PrecioConIA({ datosDelLote, alUsar }: { datosDelLote: () => unknown; alUsar: (mercado: number, sugerido: number) => void }) {
  const [informe, setInforme] = useState<InformePrecio | null>(null);
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
            La IA busca cuánto cuesta hoy este material nuevo en tiendas y corralones y te sugiere un precio para que se venda rápido.
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
              <p className="text-xs text-stone-500">{informe.descuento}% menos que nuevo, según el estado del material</p>
            </div>
          </div>
          {informe.detalle.length > 0 && (
            <ul className="space-y-0.5 text-sm text-stone-700">
              {informe.detalle.map((d, i) => (
                <li key={i}>
                  • {d.material} ({d.cantidad}): {pesos(d.precio_unitario_ars)} c/u → {pesos(d.subtotal_ars)}
                </li>
              ))}
            </ul>
          )}
          <div className="text-sm">
            <p className="font-semibold">Fuentes consultadas</p>
            <ul className="mt-1 space-y-0.5">
              {informe.fuentes.map((f, i) => (
                <li key={i}>
                  <a href={f.url} target="_blank" rel="noreferrer nofollow" className="text-celeste-oscuro underline">
                    {f.titulo}
                  </a>
                  {f.precio_ars != null && <span className="text-stone-500"> · {pesos(f.precio_ars)}</span>}
                </li>
              ))}
            </ul>
          </div>
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
