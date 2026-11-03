"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CONDICIONES, PRECIO_LISTA_MINIMO, TASA_COMISION, pesos, precioSugerido, type Condicion } from "@/lib/datos";
import { cantidadPrincipal, combinarPrecio } from "@/lib/precio-comparables";
import { compararEnSobra, tasarDesdePortada } from "@/app/precio-portada";

// "¿Cuánto vale lo que te sobró?": una cuenta express para quien todavía no
// publicó. Cuenta qué le sobró y en qué estado está, y le mostramos dos números:
// cuánto cuesta nuevo hoy y a cuánto lo puede vender en Sobrá. Si no podemos
// buscar el precio nuevo, le pedimos que lo ponga. "Publicarlo gratis" pasa todo
// al formulario de publicación (sin cuenta, después de crearla).
// `cuenta`: sin cuenta, con cuenta de usuario o admin (que no publica).
type Cuenta = "ninguna" | "usuario" | "admin";
type Resultado = { nuevo: number | null; venta: number; ajustadoASobra: boolean };

// Unidades de la cantidad (el valor es como lo entiende el resto de la app).
const UNIDADES: Record<string, string> = { m2: "m²", m: "metros", u: "unidades", kg: "kg", bolsas: "bolsas", cajas: "cajas", rollos: "rollos", l: "litros" };

// `idTexto`: el campo "¿Qué te sobró?", para llevar el foco ahí si falta.
function useCalculadora(cuenta: Cuenta, idTexto: string) {
  const router = useRouter();
  const [texto, setTexto] = useState("");
  const [cantidad, setCantidad] = useState("");
  const [unidad, setUnidad] = useState("u");
  const [precio, setPrecio] = useState("");
  const [condicion, setCondicion] = useState<Condicion>("nuevo");
  const [error, setError] = useState("");
  const [pedirPrecio, setPedirPrecio] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [buscando, buscar] = useTransition();

  // Si cambia algo, hay que volver a calcular.
  const cambio = <T,>(fn: (v: T) => void) => (v: T) => {
    fn(v);
    setError("");
    setResultado(null);
  };

  function calcular() {
    if (texto.trim().length < 4) {
      setError("Contanos qué te sobró (por ejemplo, 38 m² de porcelanato 60x60).");
      document.getElementById(idTexto)?.focus();
      return;
    }
    // Sin cantidad no hay cuenta posible (salvo que ya esté en el texto).
    const cant = Number(cantidad.replace(",", ".")) || null;
    if (!cant && !cantidadPrincipal(texto)) {
      setError("¿Cuánto tenés? Poné la cantidad (metros, m², unidades...).");
      document.getElementById(`${idTexto}-cantidad`)?.focus();
      return;
    }
    // Lo que se busca y se compara: "4000 metros de fibra óptica ADSS 6 hilos".
    const consulta = cant ? `${cant} ${UNIDADES[unidad]} de ${texto.trim()}` : texto.trim();
    const lista = Number(precio) || null;
    if (lista !== null && lista < PRECIO_LISTA_MINIMO) {
      setError(`El precio nuevo tiene que ser de al menos ${pesos(PRECIO_LISTA_MINIMO)}.`);
      return;
    }
    setError("");
    buscar(async () => {
      const enSobra = await compararEnSobra(consulta, condicion);
      if (!enSobra.ok) {
        setError(enSobra.error);
        return;
      }
      // Con el precio nuevo que puso la persona, o con el que buscamos.
      if (lista) {
        const r = combinarPrecio(precioSugerido(lista, condicion, enSobra.categoria, [], consulta), enSobra.referencia);
        if (r.sugerido) setResultado({ nuevo: lista, venta: r.sugerido, ajustadoASobra: r.motivo.includes("más baratos") });
        return;
      }
      const r = await tasarDesdePortada(consulta, condicion);
      if (!r.ok) {
        setPedirPrecio(true);
        setError(`${r.error}${r.detalle ? ` (${r.detalle})` : ""} Mientras tanto, poné cuánto cuesta nuevo y te hacemos la cuenta.`);
        return;
      }
      setResultado({ nuevo: r.tasacion.mercado, venta: r.tasacion.sugerido, ajustadoASobra: r.tasacion.ajustadoASobra });
    });
  }

  function publicar() {
    if (!resultado) return calcular();
    const cant = Number(cantidad.replace(",", ".")) || null;
    const datos: Record<string, string> = { titulo: texto.trim(), estado: condicion, pedido: String(resultado.venta) };
    // El material con su cantidad, para que el formulario ya lo tenga cargado.
    if (cant) Object.assign(datos, { cant: String(cant), unidad: UNIDADES[unidad] === "metros" ? "m" : UNIDADES[unidad] });
    if (resultado.nuevo) datos.lista = String(Math.round(resultado.nuevo));
    const formulario = `/panel/vendedor/lotes/nuevo?${new URLSearchParams(datos)}`;
    router.push(cuenta === "ninguna" ? `/registro?volver=${encodeURIComponent(formulario)}` : formulario);
  }

  return {
    texto,
    setTexto: cambio(setTexto),
    cantidad,
    setCantidad: cambio(setCantidad),
    unidad,
    setUnidad: cambio(setUnidad),
    precio,
    setPrecio: cambio(setPrecio),
    condicion,
    setCondicion: cambio(setCondicion),
    error,
    pedirPrecio,
    resultado,
    buscando,
    calcular,
    publicar,
  };
}

type Calc = ReturnType<typeof useCalculadora>;

function CampoCantidad({ c, id, clase }: { c: Calc; id: string; clase: string }) {
  return (
    <div className={`flex gap-1 ${clase}`}>
      <input
        id={`${id}-cantidad`}
        type="number"
        min={0}
        step="any"
        inputMode="decimal"
        value={c.cantidad}
        onChange={(e) => c.setCantidad(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && c.calcular()}
        aria-label="Cantidad"
        placeholder="Cantidad"
        className={`w-24 min-w-0 flex-1 rounded-lg border border-stone-200 px-3 py-2.5 text-sm ${sinFlechas}`}
      />
      <select value={c.unidad} onChange={(e) => c.setUnidad(e.target.value)} aria-label="Unidad" className="rounded-lg border border-stone-200 px-2 py-2.5 text-sm">
        {Object.entries(UNIDADES).map(([valor, texto]) => (
          <option key={valor} value={valor}>{texto}</option>
        ))}
      </select>
    </div>
  );
}
const sinFlechas = "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

// Los dos números: cuánto cuesta nuevo y a cuánto lo puede vender.
function ResultadoCalc({ c, cuenta }: { c: Calc; cuenta: Cuenta }) {
  const r = c.resultado;
  if (!r) return null;
  const menos = r.nuevo ? Math.round((1 - r.venta / r.nuevo) * 100) : null;
  return (
    <div data-resultado className="grid gap-4 rounded-xl bg-white p-4 text-petroleo ring-1 ring-stone-200 sm:grid-cols-[auto_1fr_auto] sm:items-center">
      {r.nuevo && (
        <div>
          <p className="text-sm text-stone-500">Nuevo, hoy cuesta</p>
          <p className="text-xl font-bold text-stone-500">~ {pesos(r.nuevo)}</p>
        </div>
      )}
      <div>
        <p className="text-sm text-stone-600">En Sobrá lo podés vender a</p>
        <p data-venta className="text-3xl font-extrabold">~ {pesos(r.venta)}</p>
        <p className="text-xs text-stone-500">
          {menos !== null && `${menos}% menos que nuevo, para que se venda rápido. `}
          {r.ajustadoASobra && "Ajustado a lo parecido que ya hay publicado."}
        </p>
      </div>
      <div className="space-y-1 sm:text-right">
        {cuenta === "admin" ? (
          <p className="text-xs text-stone-500">Las cuentas admin no publican</p>
        ) : (
          <button type="button" onClick={c.publicar} className="btn w-full whitespace-nowrap px-6 py-3 text-base sm:w-auto">
            Publicarlo gratis
          </button>
        )}
        <p className="text-xs text-stone-500">Cobramos {Math.round(TASA_COMISION * 100)}% solo si vendés.</p>
      </div>
    </div>
  );
}

function Avisos({ c, prefijo }: { c: Calc; prefijo: string }) {
  return (
    <>
      {c.buscando && <p className="text-sm">{c.precio ? "Calculando…" : "Buscando cuánto cuesta nuevo… puede tardar hasta un minuto."}</p>}
      {c.error && (
        <p id={`${prefijo}-error`} role="alert" className="text-sm font-medium text-marca-oscuro">
          {c.error}
        </p>
      )}
    </>
  );
}

const ESTADO_CORTO: Record<Condicion, string> = {
  nuevo: "Nuevo",
  sin_uso: "Sin uso",
  usado_como_nuevo: "Usado, como nuevo",
  usado_buen_estado: "Usado, buen estado",
  usado_con_detalles: "Usado, con detalles",
  para_reparar: "Para reparar",
};

// La tarjeta grande (portada sin lotes todavía).
export function CalculadoraSobrante({ cuenta }: { cuenta: Cuenta }) {
  const c = useCalculadora(cuenta, "calc-texto");
  return (
    <div className="space-y-4 rounded-2xl bg-white p-6 text-petroleo shadow-xl">
      <div>
        <p className="text-lg font-bold">¿Cuánto vale lo que te sobró?</p>
        <p className="mt-1 text-sm text-stone-600">Contanos qué te sobró y te decimos a cuánto lo podés vender.</p>
      </div>
      <div>
        <label htmlFor="calc-texto" className="etiqueta">¿Qué te sobró?</label>
        <input
          id="calc-texto"
          value={c.texto}
          onChange={(e) => c.setTexto(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && c.calcular()}
          maxLength={120}
          placeholder="Ej.: porcelanato 60x60 gris, bobina de fibra óptica 6 hilos"
          aria-invalid={!!c.error}
          aria-describedby={c.error ? "calc-error" : undefined}
          className="campo"
        />
      </div>
      <div>
        <p className="etiqueta">¿Cuánto tenés?</p>
        <CampoCantidad c={c} id="calc-texto" clase="" />
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
        {c.pedirPrecio && (
          <div>
            <label htmlFor="calc-precio" className="etiqueta">Cuánto cuesta nuevo</label>
            <input id="calc-precio" type="number" min={0} inputMode="numeric" value={c.precio} onChange={(e) => c.setPrecio(e.target.value)} placeholder="$ 500.000" className={`campo ${sinFlechas}`} />
          </div>
        )}
      </div>
      {!c.resultado && (
        <button type="button" onClick={c.calcular} disabled={c.buscando} className="btn w-full py-3 text-base">
          {c.buscando ? "Calculando..." : "Calcular"}
        </button>
      )}
      <Avisos c={c} prefijo="calc" />
      <ResultadoCalc c={c} cuenta={cuenta} />
    </div>
  );
}

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
            <span className="block text-sm text-petroleo/80">Fijate a cuánto lo podés vender.</span>
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
              placeholder="¿Qué te sobró? Ej.: porcelanato 60x60 gris"
              aria-describedby={c.error ? "franja-error" : undefined}
              className="min-w-0 flex-[2] px-3 py-2.5 text-base outline-none"
            />
            <CampoCantidad c={c} id="franja-texto" clase="lg:w-56" />
            <select value={c.condicion} onChange={(e) => c.setCondicion(e.target.value as Condicion)} aria-label="Estado" className="rounded-lg border border-stone-200 px-3 py-2.5 text-sm">
              {Object.entries(ESTADO_CORTO).map(([valor, texto]) => (
                <option key={valor} value={valor}>{texto}</option>
              ))}
            </select>
            {c.pedirPrecio && (
              <input
                id="franja-precio"
                type="number"
                min={0}
                inputMode="numeric"
                value={c.precio}
                onChange={(e) => c.setPrecio(e.target.value)}
                aria-label="Cuánto cuesta nuevo"
                placeholder="¿Cuánto cuesta nuevo?"
                className={`min-w-0 rounded-lg border border-stone-200 px-3 py-2.5 text-sm lg:w-48 ${sinFlechas}`}
              />
            )}
            <button type="button" onClick={c.calcular} disabled={c.buscando} className="btn whitespace-nowrap px-6 py-3">
              {c.buscando ? "Calculando..." : "Calcular"}
            </button>
          </div>
          <Avisos c={c} prefijo="franja" />
          <ResultadoCalc c={c} cuenta={cuenta} />
        </div>
      </div>
    </section>
  );
}
