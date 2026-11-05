"use client";

import { useState } from "react";
import Link from "next/link";
import { COOKIE_AVISO } from "@/lib/cookies";

// Aviso de cookies. Sobrá solo usa cookies necesarias (la sesión), así que no
// hay nada que aceptar o rechazar: es informativo y se recuerda por un año.
// Es un formulario para que "Entendido" funcione aunque la página todavía no
// haya cargado su JavaScript (celulares lentos); con JavaScript se cierra al instante.
export function AvisoCookies() {
  const [visible, setVisible] = useState(true);
  if (!visible) return null;

  function entendido(e: React.FormEvent) {
    e.preventDefault();
    const segura = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${COOKIE_AVISO}=ok; Max-Age=31536000; Path=/; SameSite=Lax${segura}`;
    setVisible(false);
    // Para que el botón flotante "+ Publicar" vuelva a su lugar.
    window.dispatchEvent(new Event("aviso-cookies-cerrado"));
  }

  return (
    <div role="region" aria-label="Aviso de cookies" className="fixed inset-x-0 bottom-0 z-30 p-2 print:hidden sm:p-4">
      <form
        action="/aviso-cookies"
        method="post"
        onSubmit={entendido}
        className="mx-auto flex max-w-3xl items-center gap-3 rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs shadow-lg sm:p-4 sm:text-sm"
      >
        <p className="flex-1 text-stone-700">
          Solo usamos cookies necesarias para tu sesión<span className="hidden sm:inline">: nada de publicidad ni seguimiento</span>.{" "}
          <Link href="/privacidad#cookies" className="font-semibold text-marca hover:underline">
            Más info
          </Link>
        </p>
        <button className="btn shrink-0 px-4 py-2 text-sm">Entendido</button>
      </form>
    </div>
  );
}
