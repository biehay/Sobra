import Link from "next/link";
import { CONDICIONES, descuento, pesos, urlFoto, type Lote } from "@/lib/datos";
import { BotonFavorito } from "@/components/boton-favorito";

// `favorito`: si el usuario lo guardó. Sin usuario logueado (undefined) no se muestra el corazón.
export function TarjetaLote({ lote, favorito, volver = "/lotes" }: { lote: Lote; favorito?: boolean; volver?: string }) {
  const precio = lote.precio_publicado ?? lote.precio_pedido;
  const off = descuento(precio, lote.precio_lista);
  const noDisponible = lote.estado === "reservado" || lote.estado === "vendido";

  return (
    <div className="relative">
      <Link href={`/lotes/${lote.id}`} className="tarjeta group block overflow-hidden transition hover:shadow-md">
        <div className="relative aspect-[4/3] bg-stone-100">
          {lote.fotos[0] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={urlFoto(lote.fotos[0])} alt={lote.titulo} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-stone-400">Sin foto</div>
          )}
          {off && !noDisponible && (
            <span className="absolute left-3 top-3 rounded-full bg-marca px-2.5 py-1 text-xs font-bold text-white">
              -{off}%
            </span>
          )}
          {noDisponible && (
            <span className="absolute inset-0 flex items-center justify-center bg-stone-900/50 text-lg font-bold text-white">
              {lote.estado === "vendido" ? "Vendido" : "Reservado"}
            </span>
          )}
        </div>
        <div className="space-y-1 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-stone-500">{lote.categoria}</p>
          <h3 className="line-clamp-2 font-semibold group-hover:text-marca">{lote.titulo}</h3>
          <p className="text-sm text-stone-500">
            {lote.zona} · {CONDICIONES[lote.condicion]}
          </p>
          <p className="pt-1 text-lg font-bold">
            {pesos(precio)}
            {lote.precio_lista && off ? (
              <span className="ml-2 text-sm font-normal text-stone-400 line-through">{pesos(lote.precio_lista)}</span>
            ) : null}
          </p>
        </div>
      </Link>
      {favorito !== undefined && (
        <div className="absolute right-3 top-3">
          <BotonFavorito loteId={lote.id} guardado={favorito} volver={volver} />
        </div>
      )}
    </div>
  );
}
