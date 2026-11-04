import Link from "next/link";
import { BotonEnviar } from "@/components/boton-enviar";
import { MOTIVOS_DENUNCIA } from "@/lib/denuncias";
import { denunciar } from "@/app/lotes/[id]/acciones";

// "Denunciar publicación", debajo de "Guardar en favoritos". Es un desplegable con un formulario
// común: funciona aunque la página no haya cargado su JavaScript.
// `soloVista`: la cuenta admin lo ve (para saber cómo es) pero no denuncia: resuelve las denuncias.
export function DenunciarPublicacion({ loteId, conCuenta, yaDenuncio, soloVista = false }: { loteId: string; conCuenta: boolean; yaDenuncio: boolean; soloVista?: boolean }) {
  if (yaDenuncio) {
    return (
      <p id="denunciar" className="scroll-mt-24 text-center text-sm text-stone-500">
        ✓ Denunciaste esta publicación. La estamos revisando.
      </p>
    );
  }
  if (!conCuenta) {
    return (
      <p id="denunciar" className="scroll-mt-24 text-center text-sm text-stone-500">
        <span aria-hidden>⚑</span> ¿Algo raro en esta publicación?{" "}
        <Link href={`/ingresar?volver=/lotes/${loteId}`} className="underline hover:text-marca">
          Ingresá para denunciarla
        </Link>
      </p>
    );
  }
  return (
    <details id="denunciar" data-denunciar className="scroll-mt-24 text-sm text-stone-600">
      <summary className="flex cursor-pointer list-none items-center justify-center gap-1.5 py-1 font-medium text-stone-500 hover:text-marca [&::-webkit-details-marker]:hidden">
        <span aria-hidden className="text-base">⚑</span> Denunciar publicación
      </summary>
      <form action={denunciar} className="mt-3 space-y-3 rounded-lg border border-stone-200 bg-white p-4">
        <input type="hidden" name="loteId" value={loteId} />
        {soloVista && (
          <p data-aviso-admin className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Las cuentas admin no denuncian: las denuncias te llegan a vos en el panel de admin. Acá ves cómo lo ven los usuarios.
          </p>
        )}
        <fieldset disabled={soloVista} className="space-y-1.5">
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
          <textarea id="detalle-denuncia" name="detalle" rows={2} maxLength={500} disabled={soloVista} className="campo" placeholder="Qué viste, por qué te parece mal" />
        </div>
        <p className="text-xs text-stone-500">Quien publicó no sabe quién lo denunció. Denunciar a propósito algo que está bien puede suspender tu cuenta.</p>
        <BotonEnviar className="btn-sec" pendiente="Enviando..." disabled={soloVista}>Enviar denuncia</BotonEnviar>
      </form>
    </details>
  );
}
