import { ESTADOS_LOTE, ESTADOS_OFERTA, type EstadoLote, type EstadoOferta } from "@/lib/datos";

const COLORES: Record<string, string> = {
  borrador: "bg-stone-100 text-stone-700",
  en_revision: "bg-amber-100 text-amber-800",
  publicado: "bg-green-100 text-green-800",
  reservado: "bg-blue-100 text-blue-800",
  vendido: "bg-stone-800 text-white",
  rechazado: "bg-red-100 text-red-800",
  pausado: "bg-stone-100 text-stone-700",
  pendiente: "bg-amber-100 text-amber-800",
  aceptada: "bg-blue-100 text-blue-800",
  cancelada: "bg-stone-100 text-stone-600",
  pagada: "bg-green-100 text-green-800",
  completada: "bg-stone-800 text-white",
  reembolsada: "bg-red-100 text-red-800",
};

export function EtiquetaEstado({ estado, tipo }: { estado: EstadoLote | EstadoOferta; tipo: "lote" | "oferta" }) {
  const texto =
    tipo === "lote" ? ESTADOS_LOTE[estado as EstadoLote] : ESTADOS_OFERTA[estado as EstadoOferta];
  return (
    <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${COLORES[estado] ?? ""}`}>
      {texto}
    </span>
  );
}
