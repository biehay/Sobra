import type { Metadata } from "next";
import Link from "next/link";
import { Aviso } from "@/components/aviso";
import { PestanasPanel } from "@/components/pestanas-panel";
import { TarjetaLote } from "@/components/tarjeta-lote";
import { BotonFavorito } from "@/components/boton-favorito";
import { crearClienteServidor } from "@/lib/supabase/server";
import { exigirRol } from "@/lib/sesion";
import { alternativasA } from "@/lib/recomendaciones";
import { SugerenciasCompactas } from "@/components/sugerencias-compactas";
import type { Recomendacion } from "@/lib/recomendaciones/motor";
import { pesos, type Lote } from "@/lib/datos";

export const metadata: Metadata = { title: "Favoritos" };

type Favorito = { lote_id: string; precio_guardado: number | null; created_at: string; lotes: Lote | null };

export default async function Favoritos({ searchParams }: PageProps<"/panel/favoritos">) {
  const perfil = await exigirRol("usuario");
  const { ok, error } = await searchParams;
  const supabase = await crearClienteServidor();
  const { data } = await supabase
    .from("favoritos")
    .select("lote_id, precio_guardado, created_at, lotes(*)")
    .order("created_at", { ascending: false });
  const favoritos = (data ?? []) as unknown as Favorito[];
  // Si un favorito se vendió o se reservó, alternativas parecidas que sí están disponibles.
  const alternativas = new Map<string, Recomendacion[]>();
  await Promise.all(
    favoritos
      .filter((f) => f.lotes && ["reservado", "vendido"].includes(f.lotes.estado))
      .slice(0, 4)
      .map(async (f) => alternativas.set(f.lote_id, await alternativasA(f.lotes!, perfil.id, perfil.zona))),
  );

  return (
    <div className="contenedor py-10">
      <PestanasPanel activa="favoritos" />
      <h1 className="text-3xl font-bold">Favoritos</h1>
      <p className="text-stone-600">Los lotes que guardaste. Si alguno baja de precio, te avisamos por email.</p>

      <div className="mt-6">
        <Aviso ok={ok} error={error} />
      </div>

      {favoritos.length ? (
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {favoritos.map((f) => {
            const lote = f.lotes;
            // Pausado o en revisión: la base ya no lo muestra.
            if (!lote || !["publicado", "reservado", "vendido"].includes(lote.estado)) {
              return (
                <div key={f.lote_id} className="tarjeta flex flex-col items-center justify-center gap-3 p-8 text-center">
                  <p className="text-stone-600">Este lote ya no está disponible por ahora.</p>
                  <BotonFavorito loteId={f.lote_id} guardado volver="/panel/favoritos" conTexto />
                </div>
              );
            }
            const ahora = Number(lote.precio_publicado);
            const antes = Number(f.precio_guardado);
            const bajo = lote.estado === "publicado" && antes > ahora;
            return (
              <div key={f.lote_id} className="space-y-2">
                <TarjetaLote lote={lote} favorito volver="/panel/favoritos" />
                {bajo && (
                  <p className="rounded-lg bg-green-50 px-3 py-2 text-sm font-semibold text-green-800">
                    ↓ Bajó {pesos(antes - ahora)} ({Math.round((1 - ahora / antes) * 100)}%) desde que lo guardaste
                  </p>
                )}
                <SugerenciasCompactas
                  titulo={lote.estado === "vendido" ? "Se vendió. Parecidos disponibles:" : "Está reservado. Por si no se libera:"}
                  recs={alternativas.get(f.lote_id) ?? []}
                />
              </div>
            );
          })}
        </div>
      ) : (
        <div className="tarjeta mt-6 p-8 text-center">
          <p className="text-stone-600">Todavía no guardaste lotes.</p>
          <p className="mt-1 text-sm text-stone-500">Tocá el corazón de un lote para guardarlo y seguir su precio.</p>
          <Link href="/lotes" className="btn mt-4">Ver lotes</Link>
        </div>
      )}
    </div>
  );
}
