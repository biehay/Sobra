"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CONDICIONES, PRECIO_LISTA_MINIMO, pesos, precioSugerido, type Condicion } from "@/lib/datos";

// "¿Cuánto vale lo que te sobró?": una cuenta rápida para que el vendedor vea
// que vale la pena publicar. Usa los mismos porcentajes que el precio sugerido.
// Al tocar "Publicarlo gratis", el precio y el estado pasan al formulario de
// publicación ya cargados (si no tiene cuenta, después de crearla).
// `cuenta`: sin cuenta, con cuenta de usuario o admin (que no publica).
export function CalculadoraSobrante({ cuenta }: { cuenta: "ninguna" | "usuario" | "admin" }) {
  const router = useRouter();
  const campo = useRef<HTMLInputElement>(null);
  const [precio, setPrecio] = useState("");
  const [condicion, setCondicion] = useState<Condicion>("nuevo");
  const [error, setError] = useState("");
  const sugerido = precioSugerido(Number(precio) || null, condicion);

  function publicar() {
    if (!sugerido) {
      setError(`Poné cuánto cuesta nuevo (desde ${pesos(PRECIO_LISTA_MINIMO)}) para calcular cuánto podés recuperar.`);
      campo.current?.focus();
      return;
    }
    const formulario = `/panel/vendedor/lotes/nuevo?${new URLSearchParams({ lista: String(Math.round(Number(precio))), estado: condicion })}`;
    router.push(cuenta === "ninguna" ? `/registro?volver=${encodeURIComponent(formulario)}` : formulario);
  }

  return (
    <div className="rounded-2xl bg-white p-6 text-petroleo shadow-xl">
      <p className="text-lg font-bold">¿Cuánto vale lo que te sobró?</p>
      <p className="mt-1 text-sm text-stone-600">Poné lo que cuesta hoy nuevo y te decimos cuánto podés recuperar.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="calc-precio" className="etiqueta">Cuánto cuesta nuevo</label>
          <input
            ref={campo}
            id="calc-precio"
            type="number"
            min={0}
            inputMode="numeric"
            value={precio}
            onChange={(e) => {
              setPrecio(e.target.value);
              setError("");
            }}
            onKeyDown={(e) => e.key === "Enter" && publicar()}
            placeholder="$ 500.000"
            aria-invalid={!!error}
            aria-describedby={error ? "calc-error" : undefined}
            className={`campo ${error ? "border-marca" : ""}`}
          />
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
      {error && (
        <p id="calc-error" role="alert" className="mt-3 text-sm font-medium text-marca-oscuro">
          {error}
        </p>
      )}
      {cuenta === "admin" ? (
        <p className="mt-4 rounded-lg bg-stone-100 px-4 py-3 text-sm text-stone-600">
          Las cuentas de administración no publican. Para probar, entrá con una cuenta de usuario.
        </p>
      ) : (
        <button type="button" onClick={publicar} className="btn mt-4 w-full py-3 text-base">
          Publicarlo gratis
        </button>
      )}
    </div>
  );
}
