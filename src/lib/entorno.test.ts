import { afterEach, describe, expect, it, vi } from "vitest";
import { codigosEnConsola, iaDePrueba } from "./entorno";

describe("modos de prueba", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("en la app publicada en Vercel no se activan aunque estén configurados", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("SOBRA_IA_DE_PRUEBA", "1");
    vi.stubEnv("SOBRA_CODIGOS_EN_CONSOLA", "1");
    expect(iaDePrueba()).toBe(false);
    expect(codigosEnConsola()).toBe(false);
  });

  it("fuera de producción, se activan solo si se piden", () => {
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("SOBRA_IA_DE_PRUEBA", "1");
    vi.stubEnv("SOBRA_CODIGOS_EN_CONSOLA", "1");
    expect(iaDePrueba()).toBe(true);
    expect(codigosEnConsola()).toBe(true);
    vi.stubEnv("SOBRA_IA_DE_PRUEBA", "");
    expect(iaDePrueba()).toBe(false);
  });
});
