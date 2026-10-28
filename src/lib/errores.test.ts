import { describe, expect, it, vi } from "vitest";
import { mensajeParaUsuario } from "./errores";

describe("mensajeParaUsuario", () => {
  it("traduce los errores de conexión a algo entendible", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(mensajeParaUsuario("fetch failed")).toBe("No pudimos conectarnos con el servidor. Probá de nuevo en unos segundos.");
    expect(mensajeParaUsuario("TypeError: fetch failed")).toContain("No pudimos conectarnos");
  });

  it("deja igual los demás mensajes", () => {
    expect(mensajeParaUsuario("Ya existe una cuenta con ese email")).toBe("Ya existe una cuenta con ese email");
  });
});
