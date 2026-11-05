"use client";

import { useEffect, useRef, useState } from "react";

// "Compartir" un lote: al tocarlo se despliega un menú con "Copiar link" y
// "Enviar por WhatsApp" (y, en el celular, "Más opciones" con el menú del
// teléfono). Va como ícono en las tarjetas y como botón en la publicación.
// Es un <details>: sin JavaScript igual se despliega y el link a WhatsApp anda.
export function MenuCompartir({ ruta, texto, variante }: { ruta: string; texto: string; variante: "icono" | "boton" }) {
  const menu = useRef<HTMLDetailsElement>(null);
  const [copiado, setCopiado] = useState(false);
  const [puedeCompartir, setPuedeCompartir] = useState(false);
  // Si el navegador bloqueó la pestaña de WhatsApp, se ofrece un link para tocar.
  const [bloqueado, setBloqueado] = useState<string | null>(null);
  const sitio = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
  const linkCon = (base: string) => `${base}${ruta}`;
  const whatsappCon = (base: string) => `https://wa.me/?text=${encodeURIComponent(`${texto} ${linkCon(base)}`)}`;
  const base = () => sitio || window.location.origin;
  const cerrar = () => menu.current?.removeAttribute("open");

  // Se cierra al tocar afuera o con Escape. "Más opciones" solo donde el teléfono lo permite.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- depende del navegador; en el servidor no existe
    setPuedeCompartir(typeof navigator.share === "function");
    function afuera(e: Event) {
      if (menu.current?.open && !menu.current.contains(e.target as Node)) cerrar();
    }
    function escape(e: KeyboardEvent) {
      if (e.key === "Escape") cerrar();
    }
    document.addEventListener("pointerdown", afuera);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", afuera);
      document.removeEventListener("keydown", escape);
    };
  }, []);

  async function copiar() {
    const link = linkCon(base());
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      // Sin permiso para el portapapeles (por ejemplo, sin https): copia a la antigua.
      const campo = document.createElement("textarea");
      campo.value = link;
      campo.style.position = "fixed";
      campo.style.opacity = "0";
      document.body.appendChild(campo);
      campo.select();
      document.execCommand("copy");
      campo.remove();
    }
    setCopiado(true);
    setTimeout(() => {
      setCopiado(false);
      cerrar();
    }, 1500);
  }

  // Directo a WhatsApp, sin pedir ningún dato y sin que Sobrá se vaya de su pestaña:
  // - Celular: abre la app de WhatsApp (whatsapp://). Si el teléfono no la tiene,
  //   abre la página de WhatsApp en otra pestaña.
  // - Compu: abre la app de escritorio si está instalada; si no, WhatsApp Web en
  //   otra pestaña.
  // Si la app se abrió, la página pierde el foco (o se oculta): ahí no se abre nada más.
  function whatsapp(e: React.MouseEvent) {
    e.preventDefault();
    cerrar();
    const mensaje = encodeURIComponent(`${texto} ${linkCon(base())}`);
    const celular = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    let seAbrioLaApp = false;
    const alSalir = () => (seAbrioLaApp = true);
    window.addEventListener("blur", alSalir, { once: true });
    document.addEventListener("visibilitychange", alSalir, { once: true });
    let marco: HTMLIFrameElement | null = null;
    if (celular) {
      // En el celular la app solo se abre desde la página (no desde un marco); si la app
      // está, Sobrá queda donde estaba.
      window.location.href = `whatsapp://send?text=${mensaje}`;
    } else {
      // En la compu, desde un marco invisible: si no tiene la app, falla en silencio.
      marco = document.createElement("iframe");
      marco.style.display = "none";
      marco.src = `whatsapp://send?text=${mensaje}`;
      document.body.appendChild(marco);
    }
    setTimeout(() => {
      marco?.remove();
      window.removeEventListener("blur", alSalir);
      document.removeEventListener("visibilitychange", alSalir);
      if (seAbrioLaApp || !document.hasFocus()) return;
      // No tiene la app: WhatsApp en otra pestaña (Sobrá sigue en esta).
      const destino = celular ? `https://wa.me/?text=${mensaje}` : `https://web.whatsapp.com/send?text=${mensaje}`;
      const pestana = window.open(destino, "_blank");
      if (pestana) pestana.opener = null;
      else {
        setBloqueado(destino);
        menu.current?.setAttribute("open", "");
      }
    }, 1500);
  }

  async function masOpciones() {
    cerrar();
    try {
      await navigator.share({ title: "Sobrá", text: texto, url: linkCon(base()) });
    } catch {
      // Canceló: no pasa nada.
    }
  }

  const opcion = "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-petroleo hover:bg-stone-100 max-sm:py-3 max-sm:text-base";
  return (
    <details ref={menu} data-compartir className={`relative ${variante === "boton" ? "w-full" : ""}`}>
      <summary
        aria-label="Compartir"
        title="Compartir"
        className={`cursor-pointer list-none [&::-webkit-details-marker]:hidden ${
          variante === "boton"
            ? "btn-sec flex w-full items-center justify-center gap-2"
            : "flex size-8 items-center justify-center rounded-full bg-white/95 text-stone-600 shadow-sm ring-1 ring-stone-200 transition hover:scale-105 hover:text-marca sm:size-9"
        }`}
      >
        <IconoCompartir className={variante === "boton" ? "size-5" : "size-4 sm:size-[18px]"} />
        {variante === "boton" && "Compartir"}
      </summary>
      <div
        role="menu"
        className={`absolute z-30 mt-2 space-y-1 rounded-xl border border-stone-200 bg-white p-1.5 shadow-lg ${
          variante === "boton"
            ? "inset-x-0"
            : "max-sm:fixed max-sm:inset-x-3 max-sm:bottom-3 max-sm:z-50 max-sm:p-2 max-sm:shadow-2xl sm:right-0 sm:w-44"
        }`}
      >
        <button type="button" role="menuitem" onClick={copiar} className={opcion}>
          <span aria-hidden className="w-5 text-center">{copiado ? "✓" : "🔗"}</span>
          {copiado ? "Link copiado" : "Copiar link"}
        </button>
        <a role="menuitem" href={whatsappCon(sitio)} target="_blank" rel="noreferrer" onClick={whatsapp} className={opcion}>
          <IconoWhatsapp />
          Enviar por WhatsApp
        </a>
        {bloqueado && (
          <a role="menuitem" href={bloqueado} target="_blank" rel="noreferrer" onClick={() => { setBloqueado(null); cerrar(); }} className={`${opcion} bg-green-50`}>
            <IconoWhatsapp />
            Abrir WhatsApp
          </a>
        )}
        {puedeCompartir && (
          <button type="button" role="menuitem" onClick={masOpciones} className={opcion}>
            <span aria-hidden className="w-5 text-center">⋯</span>
            Más opciones
          </button>
        )}
      </div>
    </details>
  );
}

export function IconoCompartir({ className = "size-5" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" />
    </svg>
  );
}

function IconoWhatsapp() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-5 shrink-0" fill="#25D366">
      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.4.1-.2 0-.3 0-.5l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.1.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2l-.4-.3Z" />
    </svg>
  );
}
