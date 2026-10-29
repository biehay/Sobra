import "server-only";
import { cache } from "react";
import { crearClienteServidor } from "@/lib/supabase/server";

// Reputación calculada con hechos de las operaciones (public.reputacion() en la
// base), no con estrellas: nadie la puede inflar ni manchar escribiendo.
export type Reputacion = {
  ventas: number;
  ventasOk: number;
  compras: number;
  comprasOk: number;
  horasRespuesta: number | null;
  desde: string | null;
};

export const reputacionDe = cache(async (usuarioId: string): Promise<Reputacion> => {
  const supabase = await crearClienteServidor();
  const { data } = await supabase.rpc("reputacion", { p_usuario: usuarioId });
  const f = (data ?? [])[0] ?? {};
  return {
    ventas: Number(f.ventas ?? 0),
    ventasOk: Number(f.ventas_ok ?? 0),
    compras: Number(f.compras ?? 0),
    comprasOk: Number(f.compras_ok ?? 0),
    horasRespuesta: f.horas_respuesta == null ? null : Number(f.horas_respuesta),
    desde: f.desde ?? null,
  };
});

// Con menos operaciones que esto, un porcentaje no dice mucho.
const MINIMO = 3;

export type Sello = { texto: string; detalle: string };

export function sellosVendedor(r: Reputacion): Sello[] {
  const sellos: Sello[] = [];
  if (r.ventas >= MINIMO && r.ventasOk / r.ventas >= 0.95) {
    sellos.push({ texto: "Material igual a las fotos", detalle: `${porcentaje(r.ventasOk, r.ventas)} de sus ventas sin reclamos por el material` });
  }
  if (r.horasRespuesta != null && r.horasRespuesta <= 6) {
    sellos.push({ texto: "Responde rápido", detalle: `Contesta las ofertas en ${tiempo(r.horasRespuesta)} en promedio` });
  }
  return sellos;
}

export function sellosComprador(r: Reputacion): Sello[] {
  return r.compras >= MINIMO && r.comprasOk / r.compras >= 0.95
    ? [{ texto: "Cumple con el retiro", detalle: `Retiró ${porcentaje(r.comprasOk, r.compras)} de sus compras` }]
    : [];
}

export function porcentaje(parte: number, total: number) {
  return total ? `${Math.round((parte / total) * 100)}%` : "-";
}

export function tiempo(horas: number) {
  if (horas < 1) return "menos de 1 hora";
  if (horas < 48) return `${Math.round(horas)} ${Math.round(horas) === 1 ? "hora" : "horas"}`;
  return `${Math.round(horas / 24)} días`;
}

export function desdeCuando(fecha: string | null) {
  return fecha ? new Date(fecha).toLocaleDateString("es-AR", { month: "long", year: "numeric" }) : "";
}
