import { crearClienteServidor } from "@/lib/supabase/server";
import { linkWhatsapp } from "@/lib/datos";

type Datos = {
  vendedor_nombre: string;
  vendedor_empresa: string | null;
  vendedor_telefono: string | null;
  comprador_nombre: string;
  comprador_empresa: string | null;
  comprador_telefono: string | null;
  direccion: string | null;
  horarios: string | null;
  indicaciones: string | null;
};

// Contacto de la contraparte y datos de retiro. La base solo los devuelve
// cuando la operación está paga.
export async function DatosOperacion({ ofertaId, vista }: { ofertaId: string; vista: "vendedor" | "comprador" | "admin" }) {
  const supabase = await crearClienteServidor();
  const { data } = await supabase.rpc("datos_operacion", { p_oferta: ofertaId });
  const datos = (data as Datos[] | null)?.[0];
  if (!datos) return null;

  const contactos = [
    vista !== "vendedor" && {
      rol: "Vendedor",
      nombre: datos.vendedor_nombre,
      empresa: datos.vendedor_empresa,
      telefono: datos.vendedor_telefono,
    },
    vista !== "comprador" && {
      rol: "Comprador",
      nombre: datos.comprador_nombre,
      empresa: datos.comprador_empresa,
      telefono: datos.comprador_telefono,
    },
  ].filter(Boolean) as { rol: string; nombre: string; empresa: string | null; telefono: string | null }[];

  return (
    <div className="grid gap-3 rounded-lg bg-stone-50 p-4 text-sm sm:grid-cols-2">
      {contactos.map((c) => (
        <div key={c.rol}>
          <p className="font-semibold">{c.rol}</p>
          <p>
            {c.nombre}
            {c.empresa && ` · ${c.empresa}`}
          </p>
          {c.telefono && (
            <a href={linkWhatsapp("Hola, te escribo por la operación en Sobrá.", c.telefono)} target="_blank" rel="noreferrer" className="font-semibold text-marca hover:underline">
              WhatsApp {c.telefono}
            </a>
          )}
        </div>
      ))}
      <div>
        <p className="font-semibold">Retiro</p>
        <p>{datos.direccion || "A coordinar"}</p>
        {datos.horarios && <p>{datos.horarios}</p>}
        {datos.indicaciones && <p className="text-stone-500">{datos.indicaciones}</p>}
      </div>
    </div>
  );
}
