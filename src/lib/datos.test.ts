import { describe, expect, it } from "vitest";
import { cuitValido, descuento, formatearCuit, linkWhatsapp, normalizarTelefono, pesos, precioSugerido } from "./datos";

describe("precioSugerido", () => {
  it("aplica el factor según la condición y redondea a miles", () => {
    expect(precioSugerido(900_000, "nuevo")).toBe(675_000);
    expect(precioSugerido(900_000, "sin_uso")).toBe(585_000);
    expect(precioSugerido(123_456, "usado_buen_estado")).toBe(62_000);
  });

  it("no sugiere nada sin precio de lista", () => {
    expect(precioSugerido(null, "nuevo")).toBeNull();
    expect(precioSugerido(0, "nuevo")).toBeNull();
  });

  it("no sugiere nada si el precio de lista es absurdamente bajo", () => {
    expect(precioSugerido(5, "nuevo")).toBeNull();
    expect(precioSugerido(999, "nuevo")).toBeNull();
  });

  it("nunca sugiere menos de $1.000", () => {
    expect(precioSugerido(1500, "usado_buen_estado")).toBe(1000);
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

  it("arma el link de WhatsApp en formato internacional", () => {
    expect(linkWhatsapp("Hola qué tal", "+54 9 11 2345-6789")).toBe(
      "https://wa.me/5491123456789?text=Hola%20qu%C3%A9%20tal",
    );
    // Como lo escribe la gente: sin código de país.
    expect(linkWhatsapp("Hola", "11 2345 6789")).toBe("https://wa.me/5491123456789?text=Hola");
  });
});

describe("normalizarTelefono", () => {
  it.each([
    ["11 2345 6789", "5491123456789"],
    ["011 15 2345-6789", "5491123456789"],
    ["+54 9 11 2345 6789", "5491123456789"],
    ["+54 11 2345 6789", "5491123456789"],
    ["(0221) 15 412-3456", "5492214123456"],
    ["0351 15 512 3456", "5493515123456"],
    ["2966 15 41 2345", "5492966412345"],
  ])("%s → %s", (entrada, esperado) => {
    expect(normalizarTelefono(entrada)).toBe(esperado);
  });

  it("rechaza lo que no es un celular argentino", () => {
    expect(normalizarTelefono("1234")).toBeNull();
    expect(normalizarTelefono("abc")).toBeNull();
  });
});

describe("CUIT", () => {
  it.each([
    ["2", "2"],
    ["20", "20"],
    ["201", "20-1"],
    ["2012345678", "20-12345678"],
    ["20123456786", "20-12345678-6"],
    ["20-12345678-6", "20-12345678-6"],
    ["20 1234 5678 6", "20-12345678-6"],
    ["201234567861111", "20-12345678-6"],
  ])("formatea %s como %s", (entrada, esperado) => {
    expect(formatearCuit(entrada)).toBe(esperado);
  });

  it("acepta CUITs con dígito verificador correcto", () => {
    expect(cuitValido("20-12345678-6")).toBe(true);
    expect(cuitValido("30-71234567-1")).toBe(true);
    expect(cuitValido("20123456786")).toBe(true);
  });

  it("rechaza dígito verificador incorrecto o largo inválido", () => {
    expect(cuitValido("20-12345678-5")).toBe(false);
    expect(cuitValido("20-1234567-8")).toBe(false);
    expect(cuitValido("")).toBe(false);
  });
});
