import { describe, expect, it } from "vitest";
import { consolidarPrecios, type PrecioEncontrado } from "./precio-consolidar";

const p = (cambios: Partial<PrecioEncontrado>): PrecioEncontrado => ({
  tipo_vendedor: "proveedor",
  moneda: "ARS",
  precio: 1000,
  por_cantidad: 1,
  unidad: "m",
  incluye_iva: true,
  ...cambios,
});
const bobina = { cantidad: 4000, unidad: "m" };

describe("consolidar precios encontrados", () => {
  it("lleva todo a precio por metro: por metro, por km y por bobina entera", () => {
    const r = consolidarPrecios(
      [p({ precio: 1100, por_cantidad: 1 }), p({ precio: 1_100_000, por_cantidad: 1, unidad: "km" }), p({ precio: 4_400_000, por_cantidad: 4000 })],
      bobina,
      null,
    );
    expect(r).toEqual({ porUnidad: 1100, total: 4_400_000, usados: 3, deProveedores: true });
  });

  it("convierte dólares con el dólar del día y suma el IVA si no está incluido", () => {
    const r = consolidarPrecios([p({ moneda: "USD", precio: 1, incluye_iva: false })], bobina, 1000);
    expect(r?.porUnidad).toBe(1210);
    // Sin dólar del día, un precio en dólares no se usa (no se adivina).
    expect(consolidarPrecios([p({ moneda: "USD", precio: 1 })], bobina, null)).toBeNull();
  });

  it("si hay precios de proveedores, usa esos y no los minoristas", () => {
    const r = consolidarPrecios(
      [p({ precio: 1000 }), p({ precio: 1100 }), p({ tipo_vendedor: "minorista", precio: 1900 }), p({ tipo_vendedor: "minorista", precio: 2000 })],
      bobina,
      null,
    );
    expect(r?.porUnidad).toBe(1050);
    expect(r?.deProveedores).toBe(true);
  });

  it("descarta precios fuera de lugar", () => {
    const r = consolidarPrecios([p({ precio: 1000 }), p({ precio: 1100 }), p({ precio: 1050 }), p({ precio: 9000 }), p({ precio: 100 })], bobina, null);
    expect(r?.porUnidad).toBe(1050);
    expect(r?.usados).toBe(3);
  });

  it("no mezcla unidades distintas ni calcula sin la cantidad del lote", () => {
    expect(consolidarPrecios([p({ unidad: "kg" })], bobina, null)).toBeNull();
    expect(consolidarPrecios([p({})], null, null)).toBeNull();
  });
});
