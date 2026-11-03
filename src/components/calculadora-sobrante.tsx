"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CONDICIONES, PRECIO_LISTA_MINIMO, pesos, precioSugerido, type Condicion } from "@/lib/datos";
import { combinarPrecio, type Referencia } from "@/lib/precio-comparables";
import { compararEnSobra, tasarDesdePortada } from "@/app/precio-portada";

// "¿Cuánto vale lo que te sobró?": la persona cuenta qué le sobró y en qué
// estado está. Con eso buscamos lo parecido que hay en Sobrá (al instante) y,
// si no sabe cuánto cuesta nuevo, el precio de mercado en la web. "Publicarlo
// gratis" pasa todo al formulario de publicación (sin cuenta, después de crearla).
// `cuenta`: sin cuenta, con cuenta de usuario o admin (que no publica).
type Cuenta = "ninguna" | "usuario" | "admin";
type Resultado = { sugerido: number; mercado: number | null; motivo: string; referencia: Referencia; fuentes: { titulo: string; url: string }[] };

// `idTexto`: el campo "¿Qué te sobró?", para llevar el foco ahí si falta.
function useCalculadora(cuenta: Cuenta, idTexto: string) {
  const router = useRouter();
  const [texto, setTexto] = useState("");
  const [precio, setPrecio] = useState("");
  const [condicion, setCondicion] = useState<Condicion>("nuevo");
  const [error, setError] = useState("");
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [parcial, setParcial] = useState<Referencia | null>(null);
  const [buscando, buscar] = useTransition();

  // Si cambia algo, hay que volver a calcular.
  const cambio = <T,>(fn: (v: T) => void) => (v: T) => {
    fn(v);
    setError("");
    setResultado(null);
    setParcial(null);
  };

  function calcular() {
    if (texto.trim().length < 4) {
      setError("Contanos qué te sobró (por ejemplo, 38 m² de porcelanato 60x60).");
      document.getElementById(idTexto)?.focus();
      return;
    }
    const lista = Number(precio) || null;
    if (lista !== null && lista < PRECIO_LISTA_MINIMO) {
      setError(`El precio nuevo tiene que ser de al menos ${pesos(PRECIO_LISTA_MINIMO)}.`);
      return;
    }
    setError("");
    buscar(async () => {
      // 1. Lo parecido en Sobrá, al instante.
      const enSobra = await compararEnSobra(texto, condicion);
      if (!enSobra.ok) {
        setError(enSobra.error);
        return;
      }
      setParcial(enSobra.referencia);
      // 2a. Si sabe cuánto cuesta nuevo: la cuenta con ese precio y lo de Sobrá.
      if (lista) {
        const { sugerido, motivo } = combinarPrecio(precioSugerido(lista, condicion), enSobra.referencia);
        setResultado({ sugerido: sugerido ?? 0, mercado: lista, motivo, referencia: enSobra.referencia, fuentes: [] });
        return;
      }
      // 2b. Si no: el precio de mercado en la web.
      const r = await tasarDesdePortada(texto, condicion);
      if (r.ok) setResultado({ ...r.tasacion });
      else if (enSobra.referencia.estimado && enSobra.referencia.comparables.length >= 2) {
        const { sugerido, motivo } = combinarPrecio(null, enSobra.referencia);
        setResultado({ sugerido: sugerido ?? 0, mercado: null, motivo, referencia: enSobra.referencia, fuentes: [] });
      } else setError(r.error);
    });
  }

  function publicar() {
    if (!resultado) return calcular();
    const datos: Record<string, string> = { titulo: texto.trim(), estado: condicion, pedido: String(resultado.sugerido) };
    if (resultado.mercado) datos.lista = String(Math.round(resultado.mercado));
    const formulario = `/panel/vendedor/lotes/nuevo?${new URLSearchParams(datos)}`;
    router.push(cuenta === "ninguna" ? `/registro?volver=${encodeURIComponent(formulario)}` : formulario);
  }

  return {
    texto,
    setTexto: cambio(setTexto),
    precio,
    setPrecio: cambio(setPrecio),
    condicion,
    setCondicion: cambio(setCondicion),
    error,
    resultado,
    parcial,
    buscando,
    calcular,
    publicar,
  };
}

type Calc = ReturnType<typeof useCalculadora>;
const sinFlechas = "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

// Lo que se encontró: cuánto recupera y de dónde sale.
function Detalle({ c, prefijo }: { c: Calc; prefijo: string }) {
  const ref = c.resultado?.referencia ?? c.parcial;
  return (
    <>
      {c.buscando && (
        <p className="text-sm">
          {c.precio ? "Comparando con lo publicado en Sobrá…" : "Buscando precios en tiendas y en Sobrá… puede tardar hasta un minuto."}
        </p>
      )}
      {ref && ref.comparables.length > 0 && (
        <p data-en-sobra className="text-sm">
          En Sobrá hay {ref.comparables.length === 1 ? "1 lote parecido" : `${ref.comparables.length} lotes parecidos`}
          {ref.confiable && ref.medianaPorUnidad && ref.unidad ? `, alrededor de ${pesos(ref.medianaPorUnidad)} por ${ref.unidad === "m2" ? "m²" : ref.unidad}` : ""}.
        </p>
      )}
      {c.resultado && (
        <>
          {c.resultado.motivo && <p className="text-xs text-stone-600">{c.resultado.motivo}</p>}
          {c.resultado.fuentes.length > 0 && (
            <p className="text-xs text-stone-600">
              Precio nuevo según{" "}
              {c.resultado.fuentes.map((f, i) => (
                <span key={f.url}>
                  {i > 0 && ", "}
                  <a href={f.url} target="_blank" rel="noreferrer nofollow" className="underline">
                    {f.titulo}
                  </a>
                </span>
              ))}
              . Es una estimación.
            </p>
          )}
        </>
      )}
      {c.error && (
        <p id={`${prefijo}-error`} role="alert" className="text-sm font-medium text-marca-oscuro">
          {c.error}
        </p>
      )}
    </>
  );
}

function Boton({ c, cuenta, clase }: { c: Calc; cuenta: Cuenta; clase: string }) {
  if (cuenta === "admin" && c.resultado) {
    return <span className="px-3 py-2 text-xs text-stone-500">Las cuentas admin no publican</span>;
  }
  return (
    <button type="button" onClick={c.resultado ? c.publicar : c.calcular} disabled={c.buscando} className={`btn whitespace-nowrap ${clase}`}>
      {c.buscando ? "Calculando..." : c.resultado ? "Publicarlo gratis" : "Calcular precio"}
    </button>
  );
}

// La tarjeta grande (portada sin lotes todavía).
export function CalculadoraSobrante({ cuenta }: { cuenta: Cuenta }) {
  const c = useCalculadora(cuenta, "calc-texto");
  return (
    <div className="rounded-2xl bg-white p-6 text-petroleo shadow-xl">
      <p className="text-lg font-bold">¿Cuánto vale lo que te sobró?</p>
      <p className="mt-1 text-sm text-stone-600">Contanos qué te sobró y buscamos cuánto podés recuperar.</p>
      <div className="mt-4 space-y-3">
        <div>
          <label htmlFor="calc-texto" className="etiqueta">¿Qué te sobró?</label>
          <input
            id="calc-texto"
            value={c.texto}
            onChange={(e) => c.setTexto(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && c.calcular()}
            maxLength={120}
            placeholder="Ej.: 38 m² de porcelanato 60x60, bobina de fibra 2 km"
            aria-invalid={!!c.error}
            aria-describedby={c.error ? "calc-error" : undefined}
            className="campo"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="calc-estado" className="etiqueta">Estado</label>
            <select id="calc-estado" value={c.condicion} onChange={(e) => c.setCondicion(e.target.value as Condicion)} className="campo">
              {Object.entries(CONDICIONES).map(([valor, texto]) => (
                <option key={valor} value={valor}>{texto}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="calc-precio" className="etiqueta">Cuánto cuesta nuevo (si sabés)</label>
            <input id="calc-precio" type="number" min={0} inputMode="numeric" value={c.precio} onChange={(e) => c.setPrecio(e.target.value)} placeholder="Lo buscamos por vos" className={`campo ${sinFlechas}`} />
          </div>
        </div>
      </div>
      <div className="mt-4 space-y-1 rounded-xl bg-celeste-claro p-4">
        <p className="text-sm">Podrías recuperar alrededor de</p>
        <p className="text-3xl font-extrabold">{c.resultado ? pesos(c.resultado.sugerido) : "$ -"}</p>
        <p className="text-xs text-stone-600">Antes de la comisión del 12%, que se cobra solo si vendés.</p>
      </div>
      <div className="mt-3 space-y-1">
        <Detalle c={c} prefijo="calc" />
      </div>
      <Boton c={c} cuenta={cuenta} clase="mt-4 w-full py-3 text-base" />
    </div>
  );
}

const ESTADO_CORTO: Record<Condicion, string> = { nuevo: "Nuevo", sin_uso: "Sin uso", usado_buen_estado: "Usado" };

// La franja de la portada, debajo de los productos destacados. En el celular
// arranca plegada en una línea y se despliega al tocarla.
// Para la cuenta admin se ve igual (para revisar cómo queda), pero sin publicar.
export function FranjaVender({ cuenta }: { cuenta: Cuenta }) {
  const c = useCalculadora(cuenta, "franja-texto");
  const [abierta, setAbierta] = useState(false);
  return (
    <section data-franja-vender className="border-b border-celeste/30 bg-celeste-claro text-petroleo">
      <div className="contenedor py-3 lg:flex lg:items-start lg:gap-6 lg:py-4">
        <button
          type="button"
          onClick={() => setAbierta((a) => !a)}
          aria-expanded={abierta}
          aria-controls="franja-calculadora"
          className="flex w-full items-center justify-between gap-3 text-left lg:pointer-events-none lg:w-56 lg:shrink-0 lg:pt-2"
        >
          <span>
            <span className="block font-bold">💸 ¿Te sobró material?</span>
            <span className="block text-sm text-petroleo/80">Calculá cuánto vale en segundos.</span>
          </span>
          <span aria-hidden className={`text-lg transition lg:hidden ${abierta ? "rotate-180" : ""}`}>▾</span>
        </button>
        <div id="franja-calculadora" className={`${abierta ? "mt-3 block" : "hidden"} flex-1 space-y-2 lg:mt-0 lg:block`}>
          <div className="flex flex-col gap-2 rounded-xl bg-white p-1.5 ring-1 ring-stone-200 lg:flex-row lg:items-center">
            <input
                id="franja-texto"
              value={c.texto}
              onChange={(e) => c.setTexto(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && c.calcular()}
              maxLength={120}
              aria-label="¿Qué te sobró?"
              placeholder="¿Qué te sobró? Ej.: 38 m² de porcelanato 60x60"
              aria-describedby={c.error ? "franja-error" : undefined}
              className="min-w-0 flex-[2] px-3 py-2.5 text-base outline-none"
            />
            <select value={c.condicion} onChange={(e) => c.setCondicion(e.target.value as Condicion)} aria-label="Estado" className="rounded-lg border border-stone-200 px-3 py-2.5 text-sm">
              {Object.entries(ESTADO_CORTO).map(([valor, texto]) => (
                <option key={valor} value={valor}>{texto}</option>
              ))}
            </select>
            <input
              id="franja-precio"
              type="number"
              min={0}
              inputMode="numeric"
              value={c.precio}
              onChange={(e) => c.setPrecio(e.target.value)}
              aria-label="Cuánto cuesta nuevo (opcional)"
              placeholder="$ nuevo (opcional)"
              className={`min-w-0 rounded-lg border border-stone-200 px-3 py-2.5 text-sm lg:w-40 ${sinFlechas}`}
            />
            {c.resultado && (
              <div data-recuperas className="rounded-lg bg-celeste-claro px-4 py-1.5">
                <span className="block text-xs">Recuperás</span>
                <span className="block whitespace-nowrap text-lg font-extrabold leading-tight">~ {pesos(c.resultado.sugerido)}</span>
              </div>
            )}
            <Boton c={c} cuenta={cuenta} clase="px-5 py-3" />
          </div>
          <div className="space-y-1 px-1">
            <Detalle c={c} prefijo="franja" />
          </div>
        </div>
      </div>
    </section>
  );
}
