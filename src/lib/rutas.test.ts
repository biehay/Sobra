import { describe, expect, it } from "vitest";
import { rutaInterna } from "./rutas";

describe("rutaInterna: solo direcciones de Sobrá", () => {
  it("acepta rutas internas, con parámetros y ancla", () => {
    expect(rutaInterna("/panel")).toBe("/panel");
    expect(rutaInterna("/lotes?q=fibra&hasta=48#lote-25")).toBe("/lotes?q=fibra&hasta=48#lote-25");
    expect(rutaInterna("/lotes/abc?ref=compartido")).toBe("/lotes/abc?ref=compartido");
  });

  it("rechaza cualquier cosa que lleve a otro sitio", () => {
    for (const malo of [
      "//evil.example",
      "/\\evil.example",
      "/\\/evil.example",
      "\\\\evil.example",
      "/\t/evil.example",
      "/\n/evil.example",
      "https://evil.example",
      "http:evil.example",
      "javascript:alert(1)",
      "evil.example",
      " /panel",
      "",
      null,
      undefined,
      42,
    ]) {
      expect(rutaInterna(malo, "/inicio")).toBe("/inicio");
    }
  });

  it("no deja pasar direcciones larguísimas", () => {
    expect(rutaInterna(`/${"a".repeat(3000)}`)).toBe("/panel");
  });
});
