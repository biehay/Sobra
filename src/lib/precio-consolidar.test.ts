import { describe, expect, it } from "vitest";
import { consolidarPrecios, palabrasProducto, precioDeReportes, type PrecioEncontrado } from "./precio-consolidar";

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
    expect(r).toEqual({ porUnidad: 1100, total: 4_400_000, usados: 3, deProveedores: true, coherencia: "solo_web" });
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

describe("precios que reportaron los usuarios", () => {
  const HOY = new Date("2026-11-03T12:00:00Z").getTime();
  const r = (cambios: Partial<import("./precio-consolidar").Reporte>) => ({
    palabras: palabrasProducto("fibra óptica ADSS 24 hilos"),
    marca: "GLC",
    unidad: "m",
    precio_usd_por_unidad: 0.75,
    quien: "a",
    created_at: "2026-10-01T00:00:00Z",
    ...cambios,
  });
  const objetivo = { texto: "4000 metros de fibra óptica ADSS 24 hilos", marca: "glc", unidad: "m" };

  it("con dos personas que reportaron precios parecidos, es una referencia confiable (llevada al dólar de hoy)", () => {
    const d = precioDeReportes(objetivo, [r({ quien: "a" }), r({ quien: "b", precio_usd_por_unidad: 0.8 })], 1500, HOY);
    expect(d).toMatchObject({ personas: 2, confiable: true });
    expect(d!.porUnidad).toBeCloseTo(1162.5);
  });

  it("una sola persona (aunque reporte muchas veces) no alcanza para confiar", () => {
    const d = precioDeReportes(objetivo, [r({ quien: "a" }), r({ quien: "a", precio_usd_por_unidad: 0.7 })], 1500, HOY);
    expect(d).toMatchObject({ personas: 1, confiable: false });
  });

  it("no confía si las personas reportaron precios muy distintos", () => {
    expect(precioDeReportes(objetivo, [r({ quien: "a" }), r({ quien: "b", precio_usd_por_unidad: 3 })], 1500, HOY)?.confiable).toBe(false);
  });

  it("solo usa la misma marca, la misma unidad, el mismo producto y reportes de menos de un año", () => {
    const otros = [
      r({ quien: "a", marca: "Otra" }),
      r({ quien: "b", unidad: "u" }),
      r({ quien: "c", palabras: palabrasProducto("cable UTP cat 6") }),
      r({ quien: "d", created_at: "2025-06-01T00:00:00Z" }),
    ];
    expect(precioDeReportes(objetivo, otros, 1500, HOY)).toBeNull();
    // Sin marca en la búsqueda, cualquier marca vale.
    expect(precioDeReportes({ ...objetivo, marca: null }, [r({ quien: "a", marca: "Otra" })], 1500, HOY)?.personas).toBe(1);
  });
});

describe("coherencia entre la web y lo que pagaron los usuarios", () => {
  const u = (precio: number) => p({ precio, origen: "usuario" });
  const lote = { cantidad: 1, unidad: "m" };

  it("si 3 personas pagaron 3.000.000 y la web dice 500.000, la búsqueda está mal: manda lo que pagaron", () => {
    const r = consolidarPrecios([p({ precio: 500_000 }), u(3_000_000), u(2_900_000), u(3_100_000)], lote, null);
    expect(r).toMatchObject({ porUnidad: 3_000_000, coherencia: "web_descartada" });
  });

  it("si una sola persona reporta algo muy distinto a la web, se descarta (puede ser un error)", () => {
    const r = consolidarPrecios([p({ precio: 500_000 }), p({ precio: 520_000 }), u(3_000_000)], lote, null);
    expect(r).toMatchObject({ porUnidad: 510_000, coherencia: "usuarios_descartados" });
  });

  it("si las personas no coinciden entre ellas, tampoco le ganan a la web", () => {
    expect(consolidarPrecios([p({ precio: 500_000 }), u(3_000_000), u(9_000_000)], lote, null)?.coherencia).toBe("usuarios_descartados");
  });

  it("si la web y los usuarios se parecen, están en lo correcto: se combinan", () => {
    const r = consolidarPrecios([p({ precio: 1_000_000 }), p({ precio: 1_100_000 }), u(1_200_000)], lote, null);
    expect(r).toMatchObject({ porUnidad: 1_100_000, coherencia: "coinciden", usados: 3 });
  });

  it("con una sola fuente, usa esa", () => {
    expect(consolidarPrecios([u(1_000_000)], lote, null)?.coherencia).toBe("solo_usuarios");
  });
});

