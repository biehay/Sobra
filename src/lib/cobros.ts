import "server-only";
import { crearClienteServidor } from "@/lib/supabase/server";

// Transferencias que Sobrá le hizo al vendedor (operaciones liquidadas), de la
// más nueva a la más vieja. Las ofertas de lotes ajenos las filtra la base (RLS).
export type Cobro = {
  id: string;
  titulo: string;
  monto: number;
  comision: number;
  neto: number;
  retiradoEl: string | null;
  transferidoEl: string;
  comprobante: boolean;
};

export async function cobrosDelVendedor(vendedorId: string): Promise<Cobro[]> {
  const supabase = await crearClienteServidor();
  const { data } = await supabase
    .from("ofertas")
    .select("id, monto, comision, completada_at, liquidada_at, comprobante, lotes!inner(titulo, vendedor_id)")
    .eq("lotes.vendedor_id", vendedorId)
    .not("liquidada_at", "is", null)
    .order("liquidada_at", { ascending: false });
  return (data ?? []).map((o) => {
    const lote = o.lotes as unknown as { titulo: string };
    const monto = Number(o.monto);
    const comision = Number(o.comision ?? 0);
    return {
      id: o.id,
      titulo: lote.titulo,
      monto,
      comision,
      neto: monto - comision,
      retiradoEl: o.completada_at,
      transferidoEl: o.liquidada_at!,
      comprobante: !!o.comprobante,
    };
  });
}

export function fecha(valor: string | null) {
  return valor ? new Date(valor).toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" }) : "-";
}
