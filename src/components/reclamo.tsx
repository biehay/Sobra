import { MOTIVOS_RECLAMO, RESULTADOS_RECLAMO, type MotivoReclamo, type Reclamo } from "@/lib/datos";
import { abrirReclamo } from "@/app/panel/acciones";
import { BotonEnviar } from "./boton-enviar";

// Estado del reclamo de una operación, para el comprador y el vendedor.
export function EstadoReclamo({ reclamo }: { reclamo: Reclamo }) {
  if (reclamo.estado === "abierto") {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-semibold">Reclamo abierto: Sobrá lo está revisando</p>
        <p className="mt-1">{MOTIVOS_RECLAMO[reclamo.motivo]}. Te contactamos por WhatsApp para resolverlo.</p>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-stone-200 bg-stone-50 p-4 text-sm text-stone-700">
      <p className="font-semibold">Reclamo resuelto: {reclamo.resultado && RESULTADOS_RECLAMO[reclamo.resultado]}</p>
      {reclamo.resolucion && <p className="mt-1">{reclamo.resolucion}</p>}
    </div>
  );
}

// Formulario plegado para reportar un problema con una operación paga.
export function FormReclamo({ ofertaId, motivos }: { ofertaId: string; motivos: MotivoReclamo[] }) {
  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-stone-500 hover:text-red-700">Tuve un problema con esta operación</summary>
      <form action={abrirReclamo} className="mt-3 space-y-3 rounded-lg border border-stone-200 p-4">
        <input type="hidden" name="oferta" value={ofertaId} />
        <div>
          <label htmlFor={`motivo-${ofertaId}`} className="etiqueta">Qué pasó</label>
          <select id={`motivo-${ofertaId}`} name="motivo" className="campo">
            {motivos.map((m) => (
              <option key={m} value={m}>{MOTIVOS_RECLAMO[m]}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`detalle-${ofertaId}`} className="etiqueta">Contanos el detalle</label>
          <textarea id={`detalle-${ofertaId}`} name="detalle" rows={3} required minLength={10} maxLength={2000} className="campo" />
        </div>
        <BotonEnviar className="btn-peligro">Abrir reclamo</BotonEnviar>
        <p className="text-xs text-stone-500">Mientras el reclamo esté abierto, la operación queda en pausa hasta que Sobrá lo resuelva.</p>
      </form>
    </details>
  );
}
