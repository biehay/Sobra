"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useId, useRef, useState } from "react";
import { pesos, urlFoto } from "@/lib/datos";
import type { Sugerencias } from "@/lib/sugerencias";

// Buscador con sugerencias mientras se escribe: lotes (con foto y precio) y
// categorías. Se maneja con el teclado: flechas, Enter y Esc. Sin JavaScript
// sigue funcionando como un formulario común que va a /lotes?q=...
const normalizar = (t: string) => t.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
const VACIAS: Sugerencias = { lotes: [], categorias: [] };

// Resalta las palabras del título que empiezan con algo de lo que escribió.
function Resaltado({ texto, consulta }: { texto: string; consulta: string }) {
  const terminos = normalizar(consulta).split(/[^a-z0-9]+/).filter((t) => t.length >= 2);
  return (
    <>
      {texto.split(/(\s+)/).map((parte, i) => {
        const p = normalizar(parte).replace(/[^a-z0-9]/g, "");
        return p && terminos.some((t) => p.startsWith(t)) ? <strong key={i} className="font-semibold text-petroleo">{parte}</strong> : parte;
      })}
    </>
  );
}

type PropsBuscador = { variante: "encabezado" | "portada"; id: string; className?: string };

// El del encabezado muestra lo que se buscó (al estar en /lotes?q=...).
export function BuscadorDelEncabezado(props: PropsBuscador) {
  return (
    // El provisorio (mientras carga) lleva otro id: un instante conviven los dos.
    <Suspense fallback={<Buscador {...props} id={`${props.id}-cargando`} />}>
      <BuscadorConConsulta {...props} />
    </Suspense>
  );
}

function BuscadorConConsulta(props: PropsBuscador) {
  const ruta = usePathname();
  const q = useSearchParams().get("q") ?? "";
  const inicial = ruta === "/lotes" ? q : "";
  // La key lo reinicia cuando cambia la búsqueda (por ejemplo, al buscar otra cosa).
  return <Buscador key={inicial} {...props} inicial={inicial} />;
}

export function Buscador({ variante, id, className = "", inicial = "" }: PropsBuscador & { inicial?: string }) {
  const router = useRouter();
  const lista = useId();
  const [texto, setTexto] = useState(inicial);
  const [sugerencias, setSugerencias] = useState<Sugerencias>(VACIAS);
  const [abierto, setAbierto] = useState(false);
  const [activa, setActiva] = useState(-1);
  const cache = useRef(new Map<string, Sugerencias>());
  const espera = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pedido = useRef<AbortController>(undefined);

  // Cada opción de la lista: categorías, lotes y, al final, "Buscar ...".
  // Primero los lotes, después las categorías y al final "Ver todos".
  const opciones = [
    ...sugerencias.lotes.map((l) => ({ clave: `l:${l.id}`, href: `/lotes/${l.id}` })),
    ...sugerencias.categorias.map((c) => ({ clave: `c:${c}`, href: `/lotes?categoria=${encodeURIComponent(c)}` })),
    { clave: "buscar", href: `/lotes?q=${encodeURIComponent(texto.trim())}` },
  ];
  const visible = abierto && texto.trim().length >= 2 && (sugerencias.lotes.length > 0 || sugerencias.categorias.length > 0);

  function escribir(valor: string) {
    setTexto(valor);
    setActiva(-1);
    clearTimeout(espera.current);
    const q = valor.trim().length >= 2 ? valor : "";
    if (!q) {
      setSugerencias(VACIAS);
      return;
    }
    const guardada = cache.current.get(q);
    if (guardada) {
      setSugerencias(guardada);
      setAbierto(true);
      return;
    }
    // Espera un instante a que termine de tipear, y cancela el pedido anterior.
    espera.current = setTimeout(async () => {
      pedido.current?.abort();
      pedido.current = new AbortController();
      try {
        const r = await fetch(`/api/sugerencias?q=${encodeURIComponent(q)}`, { signal: pedido.current.signal });
        if (!r.ok) return;
        const datos = (await r.json()) as Sugerencias;
        cache.current.set(q, datos);
        setSugerencias(datos);
        setAbierto(true);
      } catch {
        // Cancelado o sin conexión: se queda con lo que había.
      }
    }, 120);
  }

  function teclas(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!visible) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const paso = e.key === "ArrowDown" ? 1 : -1;
      const n = opciones.length;
      setActiva((a) => (a < 0 ? (paso > 0 ? 0 : n - 1) : (a + paso + n) % n));
    } else if (e.key === "Enter" && activa >= 0 && activa < opciones.length) {
      e.preventDefault();
      setAbierto(false);
      router.push(opciones[activa].href);
    } else if (e.key === "Escape") {
      setAbierto(false);
    }
  }

  const portada = variante === "portada";
  return (
    <form
      action="/lotes"
      role="search"
      className={`relative ${className}`}
      onSubmit={() => setAbierto(false)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setAbierto(false);
      }}
    >
      <div
        className={
          portada
            ? "flex gap-2 rounded-xl bg-white p-1.5 shadow-lg"
            : "flex items-center rounded-lg border border-stone-300 bg-white focus-within:border-marca focus-within:ring-2 focus-within:ring-marca/20"
        }
      >
        <label htmlFor={id} className="sr-only">
          {portada ? "Qué material buscás" : "Buscar materiales"}
        </label>
        <input
          id={id}
          name="q"
          type="search"
          autoComplete="off"
          role="combobox"
          aria-expanded={visible}
          aria-controls={lista}
          aria-autocomplete="list"
          aria-activedescendant={visible && activa >= 0 ? `${lista}-${activa}` : undefined}
          value={texto}
          onChange={(e) => escribir(e.target.value)}
          onFocus={() => setAbierto(true)}
          onKeyDown={teclas}
          placeholder={portada ? "¿Qué necesitás? Porcelanato, caños, fibra óptica..." : "Buscar porcelanato, fibra óptica..."}
          className={
            portada
              ? "min-w-0 flex-1 rounded-lg px-3 text-base text-petroleo outline-none"
              : "min-w-0 flex-1 bg-transparent px-3 py-2 text-sm outline-none"
          }
        />
        {portada ? (
          <button className="btn px-5 py-3">Buscar</button>
        ) : (
          <button aria-label="Buscar" className="px-3 py-2 text-stone-500 hover:text-marca">
            <svg aria-hidden viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth={2}>
              <circle cx="9" cy="9" r="6" />
              <path strokeLinecap="round" d="m14 14 3.5 3.5" />
            </svg>
          </button>
        )}
      </div>

      {visible && (
        <ul
          id={lista}
          role="listbox"
          className={`absolute left-0 top-full z-50 mt-2 ${portada ? "w-full" : "w-full md:w-[34rem]"} max-h-[70vh] overflow-y-auto rounded-xl border border-stone-200 bg-white py-2 text-left text-petroleo shadow-xl`}
        >
          {sugerencias.lotes.length > 0 && sugerencias.lotes[0].parecido && (
            <li role="presentation" className="px-4 pb-1 pt-1 text-xs font-medium uppercase tracking-wide text-stone-500">Parecidos</li>
          )}
          {opciones.map((o, i) => {
            const categoria = o.clave.startsWith("c:") ? o.clave.slice(2) : null;
            const lote = o.clave.startsWith("l:") ? sugerencias.lotes.find((l) => `l:${l.id}` === o.clave) : null;
            // Las categorías van como etiquetas chicas, todas en una fila.
            if (categoria) {
              if (o.clave !== `c:${sugerencias.categorias[0]}`) return null;
              return (
                <li key="categorias" role="presentation" className="flex flex-wrap items-center gap-2 border-t border-stone-100 px-4 pb-1 pt-3 text-sm">
                  <span className="text-stone-500">Buscar en:</span>
                  {sugerencias.categorias.map((c) => {
                    const j = opciones.findIndex((x) => x.clave === `c:${c}`);
                    return (
                      <Link
                        key={c}
                        id={`${lista}-${j}`}
                        role="option"
                        aria-selected={activa === j}
                        href={`/lotes?categoria=${encodeURIComponent(c)}`}
                        tabIndex={-1}
                        onMouseEnter={() => setActiva(j)}
                        onClick={() => setAbierto(false)}
                        className={`rounded-full border px-3 py-1 ${activa === j ? "border-celeste bg-celeste-claro" : "border-stone-200"}`}
                      >
                        {c}
                      </Link>
                    );
                  })}
                </li>
              );
            }
            return (
              <li key={o.clave} id={`${lista}-${i}`} role="option" aria-selected={activa === i}>
                <Link
                  href={o.href}
                  tabIndex={-1}
                  onMouseEnter={() => setActiva(i)}
                  onClick={() => setAbierto(false)}
                  className={`flex items-center gap-3 px-4 py-2 text-sm ${activa === i ? "bg-celeste-claro" : ""}`}
                >
                  {lote && (
                    <>
                      {lote.fotos[0] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={urlFoto(lote.fotos[0])} alt="" className="size-10 shrink-0 rounded-md object-cover" />
                      ) : (
                        <span className="size-10 shrink-0 rounded-md bg-stone-100" />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-stone-700">
                          <Resaltado texto={lote.titulo} consulta={texto} />
                        </span>
                        <span className="block truncate text-xs text-stone-500">
                          {lote.categoria} · {lote.zona}
                        </span>
                      </span>
                      <span className="shrink-0 font-bold">{pesos(lote.precio_publicado ?? lote.precio_pedido)}</span>
                    </>
                  )}
                  {o.clave === "buscar" && (
                    <span className="flex-1 font-medium text-marca">
                      Ver todos los resultados de “{texto.trim()}” →
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </form>
  );
}
