import Link from "next/link";
import { CONDICIONES, descuento, pesos, urlFoto, type Lote } from "@/lib/datos";
import { BotonFavorito } from "@/components/boton-favorito";

// `favorito`: si el usuario lo guardó. Sin usuario logueado (undefined) no se muestra el corazón.
// `motivo`: por qué se lo recomendamos (por ejemplo "Va con Porcelanato 60x60").
// `origen`: de qué recomendación viene ("rec-complemento"), para medir cuáles sirven.
export function TarjetaLote({
  lote,
  favorito,
  volver = "/lotes",
  motivo,
  origen,
}: {
  lote: Lote;
  favorito?: boolean;
  volver?: string;
  motivo?: string;
  origen?: string;
}) {
  const precio = lote.precio_publicado ?? lote.precio_pedido;
  const off = descuento(precio, lote.precio_lista);
  const noDisponible = lote.estado === "reservado" || lote.estado === "vendido";

  return (
    <div className="relative">
      <Link href={origen ? `/lotes/${lote.id}?ref=${origen}` : `/lotes/${lote.id}`} className="tarjeta group block overflow-hidden transition hover:shadow-md">
        <div className="relative aspect-square bg-stone-100 sm:aspect-[4/3]">
          {lote.fotos[0] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={urlFoto(lote.fotos[0])} alt={lote.titulo} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-stone-400">Sin foto</div>
          )}
          {off && !noDisponible && (
            <span className="absolute left-2 top-2 rounded-full bg-marca px-2 py-0.5 text-[11px] font-bold text-white sm:left-3 sm:top-3 sm:px-2.5 sm:py-1 sm:text-xs">
              -{off}%
            </span>
          )}
          {noDisponible && (
            <span className="absolute inset-0 flex items-center justify-center bg-stone-900/50 text-base font-bold text-white sm:text-lg">
              {lote.estado === "vendido" ? "Vendido" : "Reservado"}
            </span>
          )}
        </div>
        {/* En el celular van de a dos por fila: menos margen y textos más chicos. */}
        <div className="space-y-0.5 p-2.5 sm:space-y-1 sm:p-4">
          {motivo && <p className="mb-1 line-clamp-2 text-[11px] font-semibold leading-tight text-celeste-oscuro sm:line-clamp-1 sm:text-xs">{motivo}</p>}
          <p className="hidden text-xs font-medium uppercase tracking-wide text-stone-500 sm:block">{lote.categoria}</p>
          <h3 className="line-clamp-2 text-sm font-semibold leading-snug group-hover:text-marca sm:text-base">{lote.titulo}</h3>
          <p className="truncate text-xs text-stone-500 sm:text-sm">
            {lote.zona}
            <span className="hidden sm:inline"> · {CONDICIONES[lote.condicion]}</span>
          </p>
          <p className="pt-0.5 text-base font-bold leading-tight sm:pt-1 sm:text-lg">
            {pesos(precio)}
            {lote.precio_lista && off ? (
              <span className="block text-xs font-normal text-stone-400 line-through sm:ml-2 sm:inline sm:text-sm">{pesos(lote.precio_lista)}</span>
            ) : null}
          </p>
        </div>
      </Link>
      {favorito !== undefined && (
        <div className="absolute right-2 top-2 sm:right-3 sm:top-3">
          <BotonFavorito loteId={lote.id} guardado={favorito} volver={volver} />
        </div>
      )}
    </div>
  );
}
