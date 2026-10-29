"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

// Menú desplegable del encabezado. Se cierra al tocar afuera, con Escape, al
// elegir un link o al cambiar de página. En el celular el panel ocupa el ancho
// de la pantalla, para que no se salga por un costado.
export function Desplegable({
  boton,
  etiqueta,
  children,
  claseBoton = "",
  anchoPanel = "sm:w-72",
  alinear = "derecha",
  abrirAlPasar = false,
}: {
  boton: React.ReactNode;
  etiqueta: string;
  children: React.ReactNode;
  claseBoton?: string;
  anchoPanel?: string;
  alinear?: "izquierda" | "derecha";
  // Con el mouse: se abre después de medio segundo encima, sin hacer clic.
  abrirAlPasar?: boolean;
}) {
  // Se guarda en qué página se abrió: al cambiar de página queda cerrado solo.
  const ruta = usePathname();
  const [abiertoEn, setAbiertoEn] = useState<string | null>(null);
  const abierto = abiertoEn === ruta;
  const setAbierto = (valor: boolean) => setAbiertoEn(valor ? ruta : null);
  const contenedor = useRef<HTMLDivElement>(null);
  const temporizador = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Solo con mouse: en el celular o la tablet sigue abriendo con un toque.
  function alPasar(e: React.PointerEvent, entra: boolean) {
    if (!abrirAlPasar || e.pointerType !== "mouse") return;
    clearTimeout(temporizador.current);
    // Al salir espera un poco, para poder cruzar del botón al menú sin que se cierre.
    temporizador.current = setTimeout(() => setAbiertoEn(entra ? ruta : null), entra ? 500 : 250);
  }
  useEffect(() => () => clearTimeout(temporizador.current), []);

  useEffect(() => {
    if (!abierto) return;
    function afuera(e: MouseEvent) {
      if (!contenedor.current?.contains(e.target as Node)) setAbiertoEn(null);
    }
    function tecla(e: KeyboardEvent) {
      if (e.key === "Escape") setAbiertoEn(null);
    }
    document.addEventListener("mousedown", afuera);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("mousedown", afuera);
      document.removeEventListener("keydown", tecla);
    };
  }, [abierto]);

  return (
    <div
      ref={contenedor}
      className="sm:relative"
      onPointerEnter={(e) => alPasar(e, true)}
      onPointerLeave={(e) => alPasar(e, false)}
    >
      <button
        type="button"
        aria-expanded={abierto}
        aria-haspopup="true"
        aria-label={etiqueta}
        onClick={() => {
          clearTimeout(temporizador.current);
          setAbierto(!abierto);
        }}
        className={claseBoton}
      >
        {boton}
      </button>
      {abierto && (
        <div
          onClick={(e) => {
            if ((e.target as HTMLElement).closest("a")) setAbierto(false);
          }}
          className={`fixed inset-x-3 top-[4.25rem] z-30 max-h-[calc(100vh-5.5rem)] overflow-y-auto rounded-xl border border-stone-200 bg-white shadow-xl sm:absolute sm:inset-x-auto ${alinear === "izquierda" ? "sm:left-0" : "sm:right-0"} sm:top-full sm:mt-2 ${anchoPanel}`}
        >
          {children}
        </div>
      )}
    </div>
  );
}
