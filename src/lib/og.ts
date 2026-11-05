import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { logoSvg } from "@/components/logo";

// Lo común de las imágenes que se ven al compartir un link (WhatsApp, redes):
// tamaño, la letra del sitio (Geist, en assets/fuentes) y los colores de la marca,
// leídos de globals.css para que haya un solo lugar donde se definen.

export const TAMANO_OG = { width: 1200, height: 630 };

type Fuente = { name: string; data: Buffer; weight: 400 | 700; style: "normal" };
let fuentes: Promise<Fuente[]> | null = null;
export function fuentesOG() {
  fuentes ??= Promise.all([
    readFile(join(process.cwd(), "assets/fuentes/Geist-Regular.ttf")),
    readFile(join(process.cwd(), "assets/fuentes/Geist-Bold.ttf")),
  ]).then(([normal, negrita]) => [
    { name: "Geist", data: normal, weight: 400, style: "normal" },
    { name: "Geist", data: negrita, weight: 700, style: "normal" },
  ]);
  return fuentes;
}

export type ColoresOG = { marca: string; marcaClaro: string; celeste: string; celesteClaro: string; petroleo: string };
let colores: Promise<ColoresOG> | null = null;
export function coloresOG() {
  colores ??= readFile(join(process.cwd(), "src/app/globals.css"), "utf8").then((css) => {
    const color = (nombre: string) => css.match(new RegExp(`--color-${nombre}:\\s*(#[0-9a-fA-F]{6})`))?.[1] ?? "#000000";
    return { marca: color("marca"), marcaClaro: color("marca-claro"), celeste: color("celeste"), celesteClaro: color("celeste-claro"), petroleo: color("petroleo") };
  });
  return colores;
}

export async function logoOG(colorPalabra = "#ffffff") {
  const { marca } = await coloresOG();
  return `data:image/svg+xml;base64,${Buffer.from(logoSvg(colorPalabra, marca)).toString("base64")}`;
}
