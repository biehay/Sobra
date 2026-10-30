"use client";

import { useState } from "react";
import Link from "next/link";
import { CONDICIONES, pesos, precioSugerido, type Condicion } from "@/lib/datos";

// "¿Cuánto vale lo que te sobró?": una cuenta rápida para que el vendedor vea
// que vale la pena publicar. Usa los mismos porcentajes que el precio sugerido.
export function CalculadoraSobrante({ hrefPublicar }: { hrefPublicar: string }) {
  const [precio, setPrecio] = useState("");
  const [condicion, setCondicion] = useState<Condicion>("nuevo");
  const sugerido = precioSugerido(Number(precio) || null, condicion);

  return (
    <div className="rounded-2xl bg-white p-6 text-petroleo shadow-xl">
      <p className="text-lg font-bold">¿Cuánto vale lo que te sobró?</p>
      <p className="mt-1 text-sm text-stone-600">Poné lo que cuesta hoy nuevo y te decimos cuánto podés recuperar.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="calc-precio" className="etiqueta">Cuánto cuesta nuevo</label>
          <input id="calc-precio" type="number" min={0} inputMode="numeric" value={precio} onChange={(e) => setPrecio(e.target.value)} placeholder="$ 500.000" className="campo" />
        </div>
        <div>
          <label htmlFor="calc-estado" className="etiqueta">Estado</label>
          <select id="calc-estado" value={condicion} onChange={(e) => setCondicion(e.target.value as Condicion)} className="campo">
            {Object.entries(CONDICIONES).map(([valor, texto]) => (
              <option key={valor} value={valor}>{texto}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="mt-4 rounded-xl bg-celeste-claro p-4">
        <p className="text-sm">Podrías recuperar alrededor de</p>
        <p className="text-3xl font-extrabold">{sugerido ? pesos(sugerido) : "$ -"}</p>
        <p className="text-xs text-stone-600">Antes de la comisión del 12%, que se cobra solo si vendés.</p>
      </div>
      <Link href={hrefPublicar} className="btn mt-4 w-full py-3 text-base">Publicarlo gratis</Link>
    </div>
  );
}
