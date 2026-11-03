import { describe, expect, it } from "vitest";
import { CATEGORIAS, CONDICIONES, type Condicion } from "./datos";
import { DEPRECIACION, DETALLES, adivinarCategoria, detallesPara, esEquipo, factorPrecio, precioSugerido } from "./depreciacion";

describe("depreciación por rubro", () => {
  it("cada categoría tiene su tabla, y cuanto peor el estado, menos vale", () => {
    const orden = Object.keys(CONDICIONES) as Condicion[];
    for (const c of CATEGORIAS) {
      const tabla = DEPRECIACION[c];
      expect(tabla, c).toBeDefined();
      for (let i = 1; i < orden.length; i++) expect(tabla[orden[i]], `${c} ${orden[i]}`).toBeLessThan(tabla[orden[i - 1]]);
      expect(tabla.nuevo).toBeLessThan(1);
    }
  });

  it("no es lineal: un equipo de telecomunicaciones usado vale menos que una herramienta usada", () => {
    expect(factorPrecio("Fibra óptica y telecomunicaciones", "usado_buen_estado", [], "25 ONU GPON con WiFi")).toBeLessThan(factorPrecio("Herramientas y equipos", "usado_buen_estado"));
    expect(factorPrecio("Hierros y perfiles", "usado_buen_estado")).toBeGreaterThan(factorPrecio("Cerámicos y porcelanatos", "usado_buen_estado"));
    // Abierto, el cemento pierde mucho más que un porcelanato.
    const caida = (c: string) => factorPrecio(c, "sin_uso") / factorPrecio(c, "nuevo");
    expect(caida("Cemento, cal y áridos")).toBeLessThan(caida("Cerámicos y porcelanatos"));
  });

  it("los detalles bajan el precio, pero solo los que corresponden al rubro", () => {
    expect(precioSugerido(1_000_000, "nuevo", "Cemento, cal y áridos", ["vence_pronto"])).toBe(490_000);
    // "Sin probar" no aplica al cemento: no cambia nada.
    expect(precioSugerido(1_000_000, "nuevo", "Cemento, cal y áridos", ["sin_probar"])).toBe(700_000);
    expect(detallesPara("Fibra óptica y telecomunicaciones").map((d) => d.id)).toContain("bloqueado");
    expect(detallesPara("Cerámicos y porcelanatos").map((d) => d.id)).not.toContain("bloqueado");
    // El embalaje dañado aplica a todos.
    for (const c of CATEGORIAS) expect(detallesPara(c).some((d) => d.id === "embalaje_danado")).toBe(true);
    expect(new Set(DETALLES.map((d) => d.id)).size).toBe(DETALLES.length);
  });

  it("deduce el rubro de lo que escribe la persona", () => {
    expect(adivinarCategoria("38 m² de porcelanato 60x60")).toBe("Cerámicos y porcelanatos");
    expect(adivinarCategoria("25 ONU GPON con wifi")).toBe("Fibra óptica y telecomunicaciones");
    expect(adivinarCategoria("bobina de fibra óptica 2 km")).toBe("Fibra óptica y telecomunicaciones");
    expect(adivinarCategoria("40 bolsas de cemento")).toBe("Cemento, cal y áridos");
    expect(adivinarCategoria("hormigonera 130 litros")).toBe("Herramientas y equipos");
    expect(adivinarCategoria("cosa rara")).toBeNull();
  });

  it("dentro del rubro, el material pasivo vale más que los equipos (una bobina sin uso se vende cerca de nuevo)", () => {
    const FO = "Fibra óptica y telecomunicaciones";
    expect(esEquipo(FO, "Bobina de fibra óptica ADSS 6 hilos 4000 m")).toBe(false);
    expect(esEquipo(FO, "ONU GPON con WiFi")).toBe(true);
    expect(esEquipo(FO, "Fusionadora de fibra óptica")).toBe(true);
    expect(precioSugerido(3_500_000, "sin_uso", FO, [], "4000 m de fibra óptica ADSS 6 hilos")).toBe(2_870_000);
    expect(factorPrecio(FO, "sin_uso", [], "Bobina de fibra")).toBeGreaterThan(factorPrecio(FO, "sin_uso", [], "Router WiFi") + 0.2);
    expect(factorPrecio("Electricidad e iluminación", "nuevo", [], "Cable unipolar 2,5 mm")).toBeGreaterThan(factorPrecio("Electricidad e iluminación", "nuevo", [], "Tablero con térmicas"));
  });
});
