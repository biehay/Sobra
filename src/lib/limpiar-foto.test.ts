import { describe, expect, it } from "vitest";
import { medidasReducidas } from "./limpiar-foto";

describe("medidasReducidas", () => {
  it("achica el lado más largo a 2000 px manteniendo la proporción", () => {
    expect(medidasReducidas(4000, 3000)).toEqual({ ancho: 2000, alto: 1500 });
    expect(medidasReducidas(3024, 4032)).toEqual({ ancho: 1500, alto: 2000 });
  });

  it("no agranda fotos chicas", () => {
    expect(medidasReducidas(800, 600)).toEqual({ ancho: 800, alto: 600 });
  });
});
