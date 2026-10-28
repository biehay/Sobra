import { describe, expect, it } from "vitest";
import { problemaClave } from "./clave";

describe("problemaClave", () => {
  it.each(["clave-segura-123", "Obra2026!", "ñandú#77", "abc.1234"])("acepta %s", (clave) => {
    expect(problemaClave(clave)).toBeNull();
  });

  it.each([
    ["ab1!", "al menos 8"],
    ["sinnumeros!", "un número"],
    ["12345678!", "una letra"],
    ["clave12345", "un signo"],
    ["clave 12345", "un signo"],
  ])("rechaza %s (falta %s)", (clave, falta) => {
    expect(problemaClave(clave)).toContain(falta);
  });
});
