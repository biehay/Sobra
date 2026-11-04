import Link from "next/link";
import { BotonEnviar } from "@/components/boton-enviar";
import { MOTIVOS_DENUNCIA } from "@/lib/denuncias";
import { denunciar } from "@/app/lotes/[id]/acciones";

// "Denunciar publicación", al pie del lote. Es un desplegable con un formulario
// común: funciona aunque la página no haya cargado su JavaScript.
export function DenunciarPublicacion({ loteId, conCuenta, yaDenuncio }: { loteId: string; conCuenta: boolean; yaDenuncio: boolean }) {
  if (yaDenuncio) {
    return (
      <p id="denunciar" className="scroll-mt-24 text-sm text-stone-500">
        ✓ Denunciaste esta publicación. La estamos revisando.
      </p>
    );
  }
  if (!conCuenta) {
    return (
      <p id="denunciar" className="scroll-mt-24 text-sm text-stone-500">
        ¿Algo raro en esta publicación?{" "}
        <Link href={`/ingresar?volver=/lotes/${loteId}`} className="underline hover:text-marca">
          Ingresá para denunciarla
        </Link>
      </p>
    );
  }
  return (
    <details id="denunciar" data-denunciar className="scroll-mt-24 text-sm text-stone-600">
      <summary className="cursor-pointer text-stone-500 hover:text-marca">⚑ Denunciar publicación</summary>
      <form action={denunciar} className="mt-3 space-y-3 rounded-lg border border-stone-200 bg-white p-4">
        <input type="hidden" name="loteId" value={loteId} />
        <fieldset className="space-y-1.5">
          <legend className="mb-1 font-semibold text-petroleo">¿Qué pasa con esta publicación?</legend>
          {Object.entries(MOTIVOS_DENUNCIA).map(([valor, texto]) => (
            <label key={valor} className="flex items-center gap-2">
              <input type="radio" name="motivo" value={valor} required className="accent-marca" />
              {texto}
            </label>
          ))}
        </fieldset>
        <div>
          <label htmlFor="detalle-denuncia" className="etiqueta">Contanos más (opcional)</label>
          <textarea id="detalle-denuncia" name="detalle" rows={2} maxLength={500} className="campo" placeholder="Qué viste, por qué te parece mal" />
        </div>
        <p className="text-xs text-stone-500">Quien publicó no sabe quién lo denunció. Denunciar a propósito algo que está bien puede suspender tu cuenta.</p>
        <BotonEnviar className="btn-sec" pendiente="Enviando...">Enviar denuncia</BotonEnviar>
      </form>
    </details>
  );
}
