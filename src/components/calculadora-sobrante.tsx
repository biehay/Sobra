"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CONDICIONES, PRECIO_LISTA_MINIMO, pesos, precioSugerido, type Condicion } from "@/lib/datos";

// "¿Cuánto vale lo que te sobró?": una cuenta rápida para que el vendedor vea
// que vale la pena publicar. Usa los mismos porcentajes que el precio sugerido.
// Al tocar "Publicarlo gratis", el precio y el estado pasan al formulario de
// publicación ya cargados (si no tiene cuenta, después de crearla).
// `cuenta`: sin cuenta, con cuenta de usuario o admin (que no publica).
type Cuenta = "ninguna" | "usuario" | "admin";

function useCalculadora(cuenta: Cuenta) {
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

  const propsPrecio = {
    ref: campo,
    type: "number",
    min: 0,
    inputMode: "numeric" as const,
    value: precio,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      setPrecio(e.target.value);
      setError("");
    },
    onKeyDown: (e: React.KeyboardEvent) => e.key === "Enter" && publicar(),
    placeholder: "$ 500.000",
    "aria-invalid": !!error,
  };
  return { condicion, setCondicion, error, sugerido, publicar, propsPrecio };
}

// La tarjeta grande (portada sin lotes todavía).
export function CalculadoraSobrante({ cuenta }: { cuenta: Cuenta }) {
  const { condicion, setCondicion, error, sugerido, publicar, propsPrecio } = useCalculadora(cuenta);
  return (
    <div className="rounded-2xl bg-white p-6 text-petroleo shadow-xl">
      <p className="text-lg font-bold">¿Cuánto vale lo que te sobró?</p>
      <p className="mt-1 text-sm text-stone-600">Poné lo que cuesta hoy nuevo y te decimos cuánto podés recuperar.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="calc-precio" className="etiqueta">Cuánto cuesta nuevo</label>
          <input id="calc-precio" {...propsPrecio} aria-describedby={error ? "calc-error" : undefined} className={`campo ${error ? "border-marca" : ""}`} />
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

const ESTADO_CORTO: Record<Condicion, string> = { nuevo: "Nuevo", sin_uso: "Sin uso", usado_buen_estado: "Usado" };

// La franja de la portada, debajo de los productos destacados. En el celular
// arranca plegada en una línea y se despliega al tocarla.
export function FranjaVender({ cuenta }: { cuenta: Exclude<Cuenta, "admin"> }) {
  const { condicion, setCondicion, error, sugerido, publicar, propsPrecio } = useCalculadora(cuenta);
  const [abierta, setAbierta] = useState(false);
  return (
    <section data-franja-vender className="border-b border-celeste/30 bg-celeste-claro text-petroleo">
      <div className="contenedor py-3 lg:flex lg:items-center lg:gap-6 lg:py-4">
        <button
          type="button"
          onClick={() => setAbierta((a) => !a)}
          aria-expanded={abierta}
          aria-controls="franja-calculadora"
          className="flex w-full items-center justify-between gap-3 text-left lg:pointer-events-none lg:w-64 lg:shrink-0"
        >
          <span>
            <span className="block font-bold">💸 ¿Te sobró material?</span>
            <span className="block text-sm text-petroleo/80">Calculá cuánto vale en 5 segundos.</span>
          </span>
          <span aria-hidden className={`text-lg transition lg:hidden ${abierta ? "rotate-180" : ""}`}>▾</span>
        </button>
        <div id="franja-calculadora" className={`${abierta ? "mt-3 block" : "hidden"} flex-1 lg:mt-0 lg:block`}>
          <div className="flex flex-col gap-2 rounded-xl bg-white p-1.5 ring-1 ring-stone-200 sm:flex-row sm:items-center">
            <label className="flex flex-1 items-center gap-2 px-3 py-2 sm:py-0">
              <span className="whitespace-nowrap text-sm text-stone-500">Cuesta nuevo</span>
              <input id="franja-precio" {...propsPrecio} aria-describedby={error ? "franja-error" : undefined} className="w-24 min-w-0 flex-1 text-base font-semibold outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
            </label>
            <select value={condicion} onChange={(e) => setCondicion(e.target.value as Condicion)} aria-label="Estado" className="rounded-lg border border-stone-200 px-3 py-2.5 text-sm">
              {Object.entries(ESTADO_CORTO).map(([valor, texto]) => (
                <option key={valor} value={valor}>{texto}</option>
              ))}
            </select>
            <div className="rounded-lg bg-celeste-claro px-4 py-2">
              <span className="block text-xs">Recuperás</span>
              <span className="block whitespace-nowrap text-lg font-extrabold leading-tight">{sugerido ? `~ ${pesos(sugerido)}` : "$ -"}</span>
            </div>
            <button type="button" onClick={publicar} className="btn whitespace-nowrap px-5 py-3">
              Publicarlo gratis
            </button>
          </div>
          {error && (
            <p id="franja-error" role="alert" className="mt-2 text-sm font-medium text-marca-oscuro">
              {error}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
