import Link from "next/link";
import { pesos, urlFoto } from "@/lib/datos";
import type { Recomendacion } from "@/lib/recomendaciones/motor";

// Recomendaciones discretas para momentos en los que la persona está haciendo
// otra cosa (pagar, retirar): una lista corta, sin tarjetas grandes. Si no hay
// nada que valga la pena, no se muestra.
export function SugerenciasCompactas({ titulo, recs }: { titulo: string; recs: Recomendacion[] }) {
  if (!recs.length) return null;
  return (
    <div className="rounded-lg border border-stone-200 bg-white p-3">
      <p className="mb-2 text-sm font-semibold text-stone-700">{titulo}</p>
      <ul className="divide-y divide-stone-100">
        {recs.map((r) => (
          <li key={r.lote.id}>
            <Link href={`/lotes/${r.lote.id}?ref=rec-${r.motivo.tipo}`} className="group flex items-center gap-3 py-2">
              {r.lote.fotos[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={urlFoto(r.lote.fotos[0])} alt="" className="h-12 w-12 shrink-0 rounded-md object-cover" />
              ) : (
                <span className="h-12 w-12 shrink-0 rounded-md bg-stone-100" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium group-hover:text-marca">{r.lote.titulo}</span>
                <span className="block truncate text-xs text-celeste-oscuro">{r.motivo.texto}</span>
              </span>
              <span className="shrink-0 text-sm font-bold">{pesos(r.lote.precio_publicado ?? r.lote.precio_pedido)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
