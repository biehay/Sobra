import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { cookies } from "next/headers";
import { Encabezado } from "@/components/encabezado";
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

export const metadata: Metadata = {
  title: { default: "Sobrá · Vendé lo que te sobró", template: "%s · Sobrá" },
  description:
    "Marketplace B2B de materiales de construcción sobrantes en el AMBA. Lotes verificados, cobro protegido y retiro coordinado.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const vioAvisoCookies = (await cookies()).has(COOKIE_AVISO);
  return (
    <html lang="es-AR" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <Encabezado />
        <main className="flex-1">{children}</main>
        <footer className="border-t border-stone-200 bg-white py-8 text-sm text-stone-500">
          <div className="contenedor flex flex-col gap-2 sm:flex-row sm:justify-between">
            <p>Sobrá · Marketplace de sobrantes de obra del AMBA</p>
            <nav className="flex flex-wrap gap-x-4 gap-y-1">
              <Link href="/lotes" className="hover:text-stone-800">Lotes</Link>
              <Link href="/como-funciona" className="hover:text-stone-800">Cómo funciona</Link>
              <Link href="/terminos" className="hover:text-stone-800">Términos</Link>
              <Link href="/privacidad" className="hover:text-stone-800">Privacidad y cookies</Link>
            </nav>
          </div>
        </footer>
        {!vioAvisoCookies && <AvisoCookies />}
      </body>
    </html>
  );
}
