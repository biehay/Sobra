import { describe, expect, it } from "vitest";
import { descuento, linkWhatsapp, pesos, precioSugerido } from "./datos";

describe("precioSugerido", () => {
  it("aplica el factor según la condición y redondea a miles", () => {
    expect(precioSugerido(900_000, "nuevo")).toBe(540_000);
    expect(precioSugerido(900_000, "sin_uso")).toBe(450_000);
    expect(precioSugerido(123_456, "usado_buen_estado")).toBe(43_000);
  });

  it("no sugiere nada sin precio de lista", () => {
    expect(precioSugerido(null, "nuevo")).toBeNull();
    expect(precioSugerido(0, "nuevo")).toBeNull();
  });

  it("nunca sugiere menos de $1.000", () => {
    expect(precioSugerido(500, "usado_buen_estado")).toBe(1000);
  });
});

describe("descuento", () => {
  it("calcula el porcentaje sobre el precio de lista", () => {
    expect(descuento(450_000, 900_000)).toBe(50);
  });

  it("no muestra descuento si el precio no es menor al de lista", () => {
    expect(descuento(900_000, 900_000)).toBeNull();
    expect(descuento(100, null)).toBeNull();
  });
});

describe("formatos", () => {
  it("formatea pesos argentinos sin decimales", () => {
    expect(pesos(1234567).replace(/\s/g, " ")).toBe("$ 1.234.567");
    expect(pesos(null)).toBe("-");
  });

  it("arma el link de WhatsApp solo con dígitos", () => {
    expect(linkWhatsapp("Hola qué tal", "+54 9 11 2345-6789")).toBe(
      "https://wa.me/5491123456789?text=Hola%20qu%C3%A9%20tal",
    );
  });
});
