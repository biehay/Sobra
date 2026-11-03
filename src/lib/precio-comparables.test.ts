import { describe, expect, it } from "vitest";
import { buscarComparables, cantidadPrincipal, combinarPrecio, type LoteComparable } from "./precio-comparables";

let n = 0;
const lote = (titulo: string, precio: number, cambios: Partial<LoteComparable> = {}): LoteComparable => ({
  id: String(++n),
  titulo,
  categoria: "Cerámicos y porcelanatos",
  condicion: "nuevo",
  items: [],
  precio_publicado: precio,
  precio_pedido: precio,
  estado: "publicado",
  ...cambios,
});

describe("precio con lo que hay en Sobrá", () => {
  it("saca la cantidad del material o del texto", () => {
    expect(cantidadPrincipal("38 m² de porcelanato 60x60")).toEqual({ cantidad: 38, unidad: "m2" });
    expect(cantidadPrincipal("Bobina de fibra óptica 2000 metros")).toEqual({ cantidad: 2000, unidad: "m" });
    expect(cantidadPrincipal("algo", [{ nombre: "Inodoro", cantidad: 3, unidad: "u" }])).toEqual({ cantidad: 3, unidad: "u" });
    expect(cantidadPrincipal("porcelanato gris")).toBeNull();
  });

  it("compara por m² con lotes parecidos, en el mismo estado, y saca el valor del medio", () => {
    const lotes = [
      lote("Porcelanato 60x60 gris 20 m²", 200000), // 10.000/m²
      lote("Porcelanato 60x60 beige 30 m²", 360000), // 12.000/m²
      lote("Porcelanato 60x60 negro 10 m²", 75000, { condicion: "usado_buen_estado" }), // usado: 7.500/m² → como nuevo (tabla de cerámicos 0,75/0,45) 12.500/m²
      lote("Cerámico 45x45 25 m²", 100000), // no es porcelanato
      lote("Porcelanato 60x60 en cajas", 999999), // sin cantidad: no se puede comparar
    ];
    const r = buscarComparables({ texto: "38 m² de porcelanato 60x60", condicion: "nuevo" }, lotes);
    expect(r.comparables).toHaveLength(3);
    expect(r.medianaPorUnidad).toBe(12000);
    expect(r.estimado).toBe(456000);
    expect(r.confiable).toBe(true);
  });

  it("los vendidos van primero (son el mejor dato de a cuánto se vende)", () => {
    const r = buscarComparables({ texto: "10 m² de porcelanato", condicion: "nuevo" }, [
      lote("Porcelanato 20 m²", 200000),
      lote("Porcelanato 15 m²", 180000, { estado: "vendido" }),
    ]);
    expect(r.comparables[0].vendido).toBe(true);
  });

  it("si lo publicado está más barato, sugiere apenas por debajo; si no, usa el precio de mercado", () => {
    const ref = { unidad: "m2", cantidad: 38, comparables: [{}, {}] as never, medianaPorUnidad: 10000, estimado: 380000, confiable: true };
    expect(combinarPrecio(500000, ref).sugerido).toBe(369000);
    expect(combinarPrecio(300000, ref)).toEqual({ sugerido: 300000, motivo: expect.stringMatching(/en línea/) });
    expect(combinarPrecio(null, ref).sugerido).toBe(380000);
    expect(combinarPrecio(500000, { ...ref, comparables: [{}] as never, confiable: false }).motivo).toMatch(/precio de mercado/);
  });

  it("si los parecidos tienen precios muy distintos entre sí, no los usa", () => {
    const r = buscarComparables({ texto: "Bobina de fibra óptica 1000 m", condicion: "nuevo" }, [
      lote("Bobina de fibra óptica 2000 m", 520000, { categoria: "Fibra" }), // 260 por metro
      lote("Cable drop fibra x 6 bobinas", 450000, { items: [{ nombre: "Cable drop fibra", cantidad: 6000, unidad: "m" }] }), // 75 por metro
    ]);
    expect(r.comparables).toHaveLength(2);
    expect(r.confiable).toBe(false);
    expect(combinarPrecio(375000, r)).toEqual({ sugerido: 375000, motivo: expect.stringMatching(/muy distintos/) });
  });
});
