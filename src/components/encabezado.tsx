import Link from "next/link";
import { obtenerPerfil } from "@/lib/sesion";

export async function Encabezado() {
  const perfil = await obtenerPerfil();

  return (
    <header className="sticky top-0 z-20 border-b border-stone-200 bg-white/95 backdrop-blur">
      <div className="contenedor flex h-16 items-center justify-between gap-4">
        <Link href="/" className="text-xl font-extrabold tracking-tight">
          Sobr<span className="text-marca">á</span>
        </Link>
        <nav className="flex items-center gap-1 text-sm font-medium sm:gap-3">
          <Link href="/lotes" className="rounded-lg px-2 py-2 hover:bg-stone-100 sm:px-3">
            Ver lotes
          </Link>
          {perfil ? (
            <>
              {perfil.rol === "admin" && (
                <Link href="/admin" className="rounded-lg px-2 py-2 hover:bg-stone-100 sm:px-3">
                  Admin
                </Link>
              )}
              <Link href="/panel" className="rounded-lg px-2 py-2 hover:bg-stone-100 sm:px-3">
                Mi panel
              </Link>
              <form action="/salir" method="post">
                <button className="rounded-lg px-2 py-2 text-stone-500 hover:bg-stone-100 sm:px-3">Salir</button>
              </form>
            </>
          ) : (
            <>
              <Link href="/ingresar" className="rounded-lg px-2 py-2 hover:bg-stone-100 sm:px-3">
                Ingresar
              </Link>
              <Link href="/registro?volver=/panel/vendedor/lotes/nuevo" className="btn hidden sm:inline-flex">
                Publicar sobrante
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
