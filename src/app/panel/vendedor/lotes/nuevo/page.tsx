import type { Metadata } from "next";
import { Aviso } from "@/components/aviso";
import { exigirRol } from "@/lib/sesion";
import { AvisoAdmin } from "@/components/aviso-admin";
import { FormLote } from "../../form-lote";
import { CONDICIONES, type Condicion } from "@/lib/datos";

// La sugerencia de precio con IA busca en la web: puede tardar hasta un par de minutos.
export const maxDuration = 180;

export const metadata: Metadata = { title: "Publicar lote" };

export default async function NuevoLote({ searchParams }: PageProps<"/panel/vendedor/lotes/nuevo">) {
  const perfil = await exigirRol("usuario", "admin");
  const { error, lista, estado, titulo, pedido } = await searchParams;
  // Lo que cargó en la calculadora de la portada llega ya puesto.
  const precioLista = typeof lista === "string" && /^\d{1,12}$/.test(lista) ? lista : undefined;
  const condicion = typeof estado === "string" && estado in CONDICIONES ? (estado as Condicion) : undefined;
  const tituloInicial = typeof titulo === "string" ? titulo.trim().slice(0, 120) : undefined;
  const precioPedido = typeof pedido === "string" && /^\d{1,12}$/.test(pedido) ? Number(pedido) : undefined;

  return (
    <div className="contenedor max-w-3xl py-10">
      <h1 className="text-3xl font-bold">Publicar un lote</h1>
      <p className="mb-6 mt-1 text-stone-600">Lo revisamos antes de publicarlo, normalmente en el día.</p>
      <div className="mb-4">
        <Aviso error={error} />
      </div>
      {perfil.rol === "admin" && (
        <AvisoAdmin>Las cuentas admin no publican: podés ver y probar el formulario, pero no enviarlo.</AvisoAdmin>
      )}
      <FormLote usuarioId={perfil.id} inicial={{ precioLista, condicion, titulo: tituloInicial, precioPedido }} soloVista={perfil.rol === "admin"} />
    </div>
  );
}
