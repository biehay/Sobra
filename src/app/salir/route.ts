import { NextResponse, type NextRequest } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await crearClienteServidor();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/", request.url), { status: 303 });
}

// Cerrar sesión solo se hace con el botón (POST), para que un link de otro
// sitio no pueda desloguear a nadie. Si alguien abre /salir, vuelve al inicio.
export function GET(request: NextRequest) {
  return NextResponse.redirect(new URL("/", request.url));
}
