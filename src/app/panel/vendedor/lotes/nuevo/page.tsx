import type { Metadata } from "next";
import { AvisoFaltas } from "@/components/aviso-faltas";
import { Aviso } from "@/components/aviso";
import { redirect } from "next/navigation";
import { exigirRol, obtenerPerfil, sesionVerificada } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { AvisoAdmin } from "@/components/aviso-admin";
import { FormLote } from "../../form-lote";
import { CONDICIONES, type Condicion } from "@/lib/datos";
import { cantidadPrincipal } from "@/lib/precio-comparables";

// La sugerencia de precio con IA busca en la web: puede tardar hasta un par de minutos.
export const maxDuration = 180;

export const metadata: Metadata = { title: "Publicar lote" };

export default async function NuevoLote({ searchParams }: PageProps<"/panel/vendedor/lotes/nuevo">) {
  const parametros = await searchParams;
  // Si viene de la calculadora sin sesión (o sin el código confirmado), lo que
  // cargó tiene que seguir acá después de ingresar: se vuelve a esta misma dirección.
  const datos = new URLSearchParams(
    Object.entries(parametros).filter((e): e is [string, string] => typeof e[1] === "string" && e[0] !== "error"),
  );
  const aca = `/panel/vendedor/lotes/nuevo${datos.size ? `?${datos}` : ""}`;
  if (!(await obtenerPerfil())) redirect(`/registro?volver=${encodeURIComponent(aca)}`);
  if (!(await sesionVerificada())) redirect(`/seguridad/verificar?volver=${encodeURIComponent(aca)}`);
  const perfil = await exigirRol("usuario", "admin");
  const supabase = await crearClienteServidor();
  const { data: deConfianza } = await supabase.rpc("vendedor_de_confianza", { p_vendedor: perfil.id });
  const { error, lista, estado, titulo, pedido, cant, unidad, marca } = parametros;
  // Lo que cargó en la calculadora de la portada llega ya puesto.
  const precioLista = typeof lista === "string" && /^\d{1,12}$/.test(lista) ? lista : undefined;
  const condicion = typeof estado === "string" && estado in CONDICIONES ? (estado as Condicion) : undefined;
  const tituloInicial = typeof titulo === "string" ? titulo.trim().slice(0, 120) : undefined;
  const precioPedido = typeof pedido === "string" && /^\d{1,12}$/.test(pedido) ? Number(pedido) : undefined;
  // El material con su cantidad: la del campo o, si no, la que está escrita en el texto.
  const enTexto = tituloInicial ? cantidadPrincipal(tituloInicial) : null;
  const cantidad = typeof cant === "string" && /^\d{1,9}(\.\d{1,3})?$/.test(cant) ? Number(cant) : enTexto?.cantidad;
  const unidadItem = typeof unidad === "string" ? unidad.slice(0, 20) : enTexto?.unidad === "m2" ? "m²" : (enTexto?.unidad ?? "u");
  const item =
    tituloInicial && cantidad
      ? { nombre: tituloInicial, cantidad, unidad: unidadItem, marca: typeof marca === "string" ? marca.trim().slice(0, 60) : undefined }
      : undefined;

  return (
    <div className="contenedor max-w-3xl py-10">
      <h1 className="text-3xl font-bold">Publicar un lote</h1>
      <p className="mb-6 mt-1 text-stone-600">
        {deConfianza
          ? "Tu cuenta es de confianza: si pasa la revisión automática, se publica al instante."
          : "Lo revisamos al instante con controles automáticos. Si algo no cierra (o es tu primera publicación), lo mira una persona del equipo, normalmente en el día."}
      </p>
      <div className="mb-4 space-y-3">
        <Aviso error={error} />
        <AvisoFaltas usuarioId={perfil.id} />
      </div>
      {tituloInicial && precioPedido && (
        <p data-desde-calculadora className="mb-4 rounded-lg border border-celeste/50 bg-celeste-claro px-4 py-3 text-sm text-petroleo">
          <strong>Te trajimos lo que calculaste.</strong> Revisá el título y el precio, y sumá las fotos y los datos de retiro.
        </p>
      )}
      {perfil.rol === "admin" && (
        <AvisoAdmin>Las cuentas admin no publican: podés ver y probar el formulario, pero no enviarlo.</AvisoAdmin>
      )}
      <FormLote usuarioId={perfil.id} inicial={{ precioLista, condicion, titulo: tituloInicial, precioPedido, item }} soloVista={perfil.rol === "admin"} />
    </div>
  );
}
