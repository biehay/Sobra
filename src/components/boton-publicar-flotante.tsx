"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

// En el celular el botón de publicar del encabezado no entra: queda flotando
// abajo a la derecha. Para no tapar los productos, se esconde mientras bajás y
// vuelve cuando subís. No aparece donde no tiene sentido (ni en el detalle de un
// lote, donde lo importante es ofertar).
const OCULTAR_EN = ["/panel/vendedor/lotes", "/ingresar", "/registro", "/verificar", "/seguridad", "/recuperar", "/nueva-clave", "/admin", "/constancia"];
const DETALLE_DE_LOTE = /^\/lotes\/[0-9a-f-]{36}$/;

// ¿Está el aviso de cookies abajo? Mientras esté, el botón va por encima de él.
const hayAvisoCookies = () => !!document.querySelector('[aria-label="Aviso de cookies"]');
function alCambiarAviso(avisar: () => void) {
  window.addEventListener("aviso-cookies-cerrado", avisar);
  return () => window.removeEventListener("aviso-cookies-cerrado", avisar);
}

export function BotonPublicarFlotante({ href }: { href: string }) {
  const ruta = usePathname();
  const conAviso = useSyncExternalStore(alCambiarAviso, hayAvisoCookies, () => false);
  const [visible, setVisible] = useState(true);
  const anterior = useRef(0);

  useEffect(() => {
    function alMoverse() {
      const y = window.scrollY;
      // Arriba de todo, o subiendo: se ve. Bajando (más de unos píxeles): se esconde.
      if (y < 80 || y < anterior.current - 8) setVisible(true);
      else if (y > anterior.current + 8) setVisible(false);
      anterior.current = y;
    }
    window.addEventListener("scroll", alMoverse, { passive: true });
    return () => window.removeEventListener("scroll", alMoverse);
  }, []);

  if (OCULTAR_EN.some((r) => ruta.startsWith(r)) || DETALLE_DE_LOTE.test(ruta)) return null;
  return (
    <Link
      href={href}
      data-publicar-flotante
      aria-hidden={!visible}
      tabIndex={visible ? undefined : -1}
      className={`btn print:hidden fixed ${conAviso ? "bottom-24" : "bottom-4"} right-4 z-20 rounded-full px-5 py-3 text-base shadow-lg transition-transform duration-200 sm:hidden ${
        visible ? "translate-y-0" : "pointer-events-none translate-y-24"
      }`}
    >
      + Publicar
    </Link>
  );
}
