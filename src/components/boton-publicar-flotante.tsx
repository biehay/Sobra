"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// En el celular el botón de publicar del encabezado no entra: queda flotando
// abajo a la derecha, siempre a mano. No aparece donde no tiene sentido.
const OCULTAR_EN = ["/panel/vendedor/lotes", "/ingresar", "/registro", "/verificar", "/seguridad", "/recuperar", "/nueva-clave", "/admin"];

export function BotonPublicarFlotante({ href }: { href: string }) {
  const ruta = usePathname();
  if (OCULTAR_EN.some((r) => ruta.startsWith(r))) return null;
  return (
    <Link
      href={href}
      className="btn fixed bottom-4 right-4 z-20 rounded-full px-5 py-3 text-base shadow-lg sm:hidden"
    >
      + Publicar
    </Link>
  );
}
