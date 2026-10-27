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
  }

  return (
    <div role="region" aria-label="Aviso de cookies" className="fixed inset-x-0 bottom-0 z-30 p-3 sm:p-4">
      <form
        action="/aviso-cookies"
        method="post"
        onSubmit={entendido}
        className="mx-auto flex max-w-3xl flex-col gap-3 rounded-xl border border-stone-200 bg-white p-4 text-sm shadow-lg sm:flex-row sm:items-center"
      >
        <p className="flex-1 text-stone-700">
          Usamos solo las cookies necesarias para que puedas iniciar sesión. No usamos cookies de publicidad ni de
          seguimiento.{" "}
          <Link href="/privacidad#cookies" className="font-semibold text-marca hover:underline">
            Más información
          </Link>
        </p>
        <button className="btn shrink-0">Entendido</button>
      </form>
    </div>
  );
}
