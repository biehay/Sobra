import { NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
import { obtenerPerfil, sesionVerificada } from "@/lib/sesion";

// Abre el comprobante de una transferencia con un link firmado que dura un
// minuto. El bucket es privado: la base solo firma archivos de la carpeta del
// propio vendedor, así que nadie puede abrir el comprobante de otro.
export async function GET(request: Request, { params }: RouteContext<"/panel/cobros/comprobante/[id]">) {
  const { id } = await params;
  const perfil = await obtenerPerfil();
  if (!perfil) return NextResponse.redirect(new URL("/ingresar", request.url));
  // Tiene datos bancarios: se pide la sesión confirmada con el código del email.
  if (!(await sesionVerificada())) {
    return NextResponse.redirect(new URL("/seguridad/verificar?volver=/panel/cobros", request.url));
  }

  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("ofertas").select("comprobante").eq("id", id).maybeSingle();
  const firmado = data?.comprobante
    ? await supabase.storage.from("comprobantes").createSignedUrl(data.comprobante, 60)
    : null;
  if (!firmado?.data?.signedUrl) {
    return NextResponse.redirect(new URL("/panel/cobros?error=No+encontramos+ese+comprobante.", request.url));
  }
  return NextResponse.redirect(firmado.data.signedUrl);
}
