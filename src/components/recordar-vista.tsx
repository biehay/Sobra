"use client";

import { useEffect } from "react";

export const CLAVE_VISTOS = "sobra_vistos";

// Guarda en este navegador (no en una cookie ni en nuestro servidor) los últimos
// lotes que se abrieron, para recomendarle a quien todavía no tiene cuenta.
export function RecordarVista({ loteId }: { loteId: string }) {
  useEffect(() => {
    try {
      const vistos: string[] = JSON.parse(localStorage.getItem(CLAVE_VISTOS) ?? "[]");
      localStorage.setItem(CLAVE_VISTOS, JSON.stringify([loteId, ...vistos.filter((id) => id !== loteId)].slice(0, 20)));
    } catch {
      // Sin almacenamiento (modo privado, bloqueado): simplemente no se recuerda.
    }
  }, [loteId]);
  return null;
}
