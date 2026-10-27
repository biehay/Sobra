import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";

// Destino del link del email de confirmación de Supabase.
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const volver = searchParams.get("volver") ?? "/panel";
  const destino = volver.startsWith("/") && !volver.startsWith("//") ? volver : "/panel";
  const supabase = await crearClienteServidor();

  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && type
      ? await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
      : { error: new Error("Link inválido") };

  if (error) {
    return NextResponse.redirect(
      new URL(`/ingresar?error=${encodeURIComponent("El link expiró o no es válido. Ingresá de nuevo.")}`, request.url),
    );
  }
  return NextResponse.redirect(new URL(destino, request.url));
}
