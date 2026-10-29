import { NextResponse } from "next/server";
import { cobrosDelVendedor, fecha } from "@/lib/cobros";
import { obtenerPerfil } from "@/lib/sesion";

// Planilla de cobros para el contador: se abre con Excel o Google Sheets.
export async function GET(request: Request) {
  const perfil = await obtenerPerfil();
  if (!perfil) return NextResponse.redirect(new URL("/ingresar", request.url));
  const cobros = await cobrosDelVendedor(perfil.id);

  const celda = (valor: string | number) => {
    const texto = String(valor);
    // Evita que la planilla interprete un título como fórmula (=, +, -, @).
    const seguro = /^[=+\-@]/.test(texto) ? `'${texto}` : texto;
    return `"${seguro.replace(/"/g, '""')}"`;
  };
  const filas = [
    ["Fecha de transferencia", "Lote", "Venta", "Comisión Sobrá", "Recibido", "Fecha de retiro", "Comprobante"],
    ...cobros.map((c) => [fecha(c.transferidoEl), c.titulo, c.monto, c.comision, c.neto, fecha(c.retiradoEl), c.comprobante ? "Sí" : "No"]),
  ];
  // Punto y coma y BOM: así Excel en castellano lo abre con columnas y tildes.
  const csv = "﻿" + filas.map((f) => f.map(celda).join(";")).join("\r\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="sobra-cobros.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
