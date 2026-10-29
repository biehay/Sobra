import { cambiarFavorito } from "@/app/lotes/favoritos";

// Corazón para guardar un lote en Favoritos. Es un formulario común, así que
// funciona aunque la página no haya terminado de cargar su JavaScript.
export function BotonFavorito({
  loteId,
  guardado,
  volver,
  conTexto = false,
}: {
  loteId: string;
  guardado: boolean;
  volver: string;
  conTexto?: boolean;
}) {
  const texto = guardado ? "Quitar de favoritos" : "Guardar en favoritos";
  return (
    <form action={cambiarFavorito}>
      <input type="hidden" name="loteId" value={loteId} />
      <input type="hidden" name="guardar" value={guardado ? "no" : "si"} />
      <input type="hidden" name="volver" value={volver} />
      <button
        aria-label={texto}
        aria-pressed={guardado}
        title={texto}
        className={
          conTexto
            ? "btn-sec w-full"
            : "flex size-9 items-center justify-center rounded-full bg-white/95 shadow-sm ring-1 ring-stone-200 transition hover:scale-105"
        }
      >
        <Corazon lleno={guardado} />
        {conTexto && (guardado ? "Guardado en favoritos" : "Guardar en favoritos")}
      </button>
    </form>
  );
}

function Corazon({ lleno }: { lleno: boolean }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={`size-5 ${lleno ? "fill-marca text-marca" : "fill-none text-stone-600"}`} stroke="currentColor" strokeWidth={2}>
      <path strokeLinejoin="round" d="M12 20.5s-7.5-4.6-9.3-9.2C1.4 8 3.5 4.5 7 4.5c2 0 3.6 1.1 5 3 1.4-1.9 3-3 5-3 3.5 0 5.6 3.5 4.3 6.8-1.8 4.6-9.3 9.2-9.3 9.2Z" />
    </svg>
  );
}
