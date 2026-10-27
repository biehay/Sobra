import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_AVISO } from "@/lib/cookies";

// "Entendido" del aviso de cookies cuando la página todavía no cargó su
// JavaScript: guarda la cookie y vuelve a la página donde estaba.
export function POST(request: NextRequest) {
  const anterior = request.headers.get("referer");
  const destino = anterior && new URL(anterior).origin === request.nextUrl.origin ? anterior : "/";
  const respuesta = NextResponse.redirect(new URL(destino, request.url), { status: 303 });
  respuesta.cookies.set(COOKIE_AVISO, "ok", {
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
  });
  return respuesta;
}
