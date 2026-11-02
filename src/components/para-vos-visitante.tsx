"use client";

import { useEffect, useState } from "react";
import type { Lote } from "@/lib/datos";
import { TarjetaLote } from "@/components/tarjeta-lote";
import { CLAVE_VISTOS } from "@/components/recordar-vista";

// "Basado en lo que viste" para quien no tiene cuenta. Si todavía no vio nada,
// no muestra nada.
export function ParaVosVisitante() {
  const [recs, setRecs] = useState<{ lote: Lote; motivo: string }[]>([]);

  useEffect(() => {
    let vistos: string[] = [];
    try {
      vistos = JSON.parse(localStorage.getItem(CLAVE_VISTOS) ?? "[]");
    } catch {
      return;
    }
    if (!vistos.length) return;
    fetch(`/api/recomendaciones?vistos=${vistos.join(",")}`)
      .then((r) => (r.ok ? r.json() : { lotes: [] }))
      .then((d) => setRecs(d.lotes ?? []))
      .catch(() => {});
  }, []);

  if (!recs.length) return null;
  return (
    <section className="contenedor pt-10">
      <h2 className="mb-1 text-2xl font-bold">Basado en lo que viste</h2>
      <p className="mb-5 text-sm text-stone-600">Lotes parecidos y lo que suele ir con ellos.</p>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {recs.map((r) => (
          <TarjetaLote key={r.lote.id} lote={r.lote} motivo={r.motivo} favorito={false} volver="/" />
        ))}
      </div>
    </section>
  );
}
