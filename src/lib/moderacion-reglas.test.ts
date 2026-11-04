import { describe, expect, it } from "vitest";
import { combinar, revisarReglas, type LoteAModerar } from "./moderacion-reglas";

const lote = (cambios: Partial<LoteAModerar>): LoteAModerar => ({
  titulo: "Porcelanato 60x60 gris, 38 m²",
  descripcion: "Cajas cerradas.",
  condicion: "nuevo",
  items: [{ nombre: "Porcelanato 60x60 gris" }],
  precio_pedido: 500_000,
  precio_lista: 900_000,
  ...cambios,
});

describe("reglas fijas de moderación", () => {
  it("un lote normal pasa sin motivos", () => {
    expect(revisarReglas(lote({}))).toEqual({ resultado: "aprobado", motivos: [], mensaje: "" });
    // Medidas y cantidades no son un teléfono; "gris claro" no es la empresa Claro.
    expect(revisarReglas(lote({ titulo: "Bobina de fibra 4000 m, 24 hilos", descripcion: "Color gris claro, uso personal." })).resultado).toBe("aprobado");
  });

  it("rechaza el amianto y le explica al vendedor por qué", () => {
    const r = revisarReglas(lote({ titulo: "Chapas de asbesto usadas" }));
    expect(r.resultado).toBe("rechazado");
    expect(r.motivos[0].tipo).toBe("prohibido");
    expect(r.mensaje).toContain("prohibida");
  });

  it("manda a revisión lo que puede ser robado", () => {
    expect(revisarReglas(lote({ titulo: "Cable de cobre 500 m", condicion: "usado_buen_estado" })).motivos[0].tipo).toBe("posible_robo");
    expect(revisarReglas(lote({ titulo: "Cobre recuperado de obra", condicion: "nuevo" })).resultado).toBe("dudoso");
    expect(revisarReglas(lote({ descripcion: "Fibra que sobró de una obra de Telecom" })).resultado).toBe("dudoso");
    expect(revisarReglas(lote({ titulo: "20 tapas de medidor" })).resultado).toBe("dudoso");
    // Cable de cobre nuevo, de un corralón: está bien.
    expect(revisarReglas(lote({ titulo: "Cable unipolar de cobre 2,5 mm, 3 rollos", condicion: "nuevo" })).resultado).toBe("aprobado");
  });

  it("manda a revisión los datos de contacto y los precios regalados", () => {
    expect(revisarReglas(lote({ descripcion: "Consultas por wsp" })).motivos[0].tipo).toBe("contacto");
    expect(revisarReglas(lote({ descripcion: "Llamame al 11 2345 6789" })).resultado).toBe("dudoso");
    expect(revisarReglas(lote({ precio_pedido: 100_000 })).motivos[0].tipo).toBe("precio_sospechoso");
  });

  it("al combinar con la IA, gana lo más estricto y se suman los motivos", () => {
    const ia = { resultado: "rechazado" as const, motivos: [{ tipo: "fuera_de_rubro" as const, detalle: "Es un celular." }], mensaje: "No es material de obra." };
    const reglas = revisarReglas(lote({ descripcion: "Consultas por wsp" }));
    expect(combinar(reglas, ia)).toEqual({ resultado: "rechazado", motivos: [...reglas.motivos, ...ia.motivos], mensaje: "No es material de obra." });
    expect(combinar(revisarReglas(lote({})), { resultado: "aprobado", motivos: [], mensaje: "" }).resultado).toBe("aprobado");
  });
});
