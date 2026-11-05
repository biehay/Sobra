"use client";

import { useEffect } from "react";

// "Ver más lotes" lleva a la primera tarjeta nueva con una marca en la dirección
// (#lote-25). Una vez que la pantalla llegó ahí, se borra la marca: si no, al volver
// con "Atrás" el navegador vuelve a esa tarjeta y no a donde estaba la persona.
export function QuitarAncla() {
  useEffect(() => {
    if (!window.location.hash.startsWith("#lote-")) return;
    const t = setTimeout(() => {
      const { pathname, search } = window.location;
      window.history.replaceState(window.history.state, "", `${pathname}${search}`);
    }, 400);
    return () => clearTimeout(t);
  }, []);
  return null;
}
