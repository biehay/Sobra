import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { cookies } from "next/headers";
import { Encabezado } from "@/components/encabezado";
import { Logo } from "@/components/logo";
import { AvisoCookies } from "@/components/aviso-cookies";
import { COOKIE_AVISO } from "@/lib/cookies";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const COLUMNAS_PIE: [string, [string, string][]][] = [
  ["Sobrá", [["Ver lotes", "/lotes"], ["Publicar un sobrante", "/panel/vendedor/lotes/nuevo"], ["Lo que se está buscando", "/buscados"], ["Cómo funciona", "/como-funciona"]]],
  ["Ayuda", [["Centro de ayuda", "/ayuda"], ["Devoluciones y reclamos", "/devoluciones"], ["Botón de arrepentimiento", "/arrepentimiento"]]],
  ["Legal", [["Términos y condiciones", "/terminos"], ["Privacidad y cookies", "/privacidad"]]],
];

const DESCRIPCION_SITIO =
  "Marketplace B2B de sobrantes de obra, instalaciones y fibra óptica en el AMBA. Publicaciones controladas, pago protegido y retiro coordinado.";

export const metadata: Metadata = {
  // Con la dirección pública del sitio, los links de las imágenes para compartir quedan completos.
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  title: { default: "Sobrá · Vendé lo que te sobró", template: "%s · Sobrá" },
  description: DESCRIPCION_SITIO,
  openGraph: { siteName: "Sobrá", locale: "es_AR", type: "website", title: "Sobrá · Sobrantes de obra con descuento", description: DESCRIPCION_SITIO },
  twitter: { card: "summary_large_image" },
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const vioAvisoCookies = (await cookies()).has(COOKIE_AVISO);
  return (
    <html lang="es-AR" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <Encabezado />
        <main className="flex-1">{children}</main>
        <footer className="print:hidden bg-petroleo pb-24 pt-12 text-sm text-white/70 sm:pb-10">
          <div className="contenedor grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <Logo className="h-8 w-auto text-white" />
              <p className="mt-3">Marketplace de sobrantes de obra y telecomunicaciones del AMBA.</p>
            </div>
            {COLUMNAS_PIE.map(([titulo, links]) => (
              <nav key={titulo} aria-label={titulo}>
                <p className="mb-3 font-semibold text-white">{titulo}</p>
                <ul className="space-y-2">
                  {links.map(([texto, href]) => (
                    <li key={href}>
                      <Link href={href} className="hover:text-celeste">{texto}</Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
          <div className="contenedor mt-10 flex flex-col gap-3 border-t border-white/10 pt-6 sm:flex-row sm:items-center sm:justify-between">
            <p>© {new Date().getFullYear()} Sobrá</p>
            <Link href="/arrepentimiento" className="self-start rounded-lg border border-white/30 px-3 py-1.5 font-semibold text-white hover:bg-white/10">
              Botón de arrepentimiento
            </Link>
          </div>
        </footer>
        {!vioAvisoCookies && <AvisoCookies />}
      </body>
    </html>
  );
}
