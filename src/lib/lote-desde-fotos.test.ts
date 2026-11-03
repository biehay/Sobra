import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { CONSULTAS_DE_PRUEBA, proponerLoteDesdeFotos } = await import("./lote-desde-fotos");
const { unificar, pesoEsperado, normalizarUnidad } = await import("./lote-desde-fotos-control");
type Observacion = import("./lote-desde-fotos-control").Observacion;
type Revision = import("./lote-desde-fotos-control").Revision;

const obs = (cambios: Partial<Observacion> = {}): Observacion => ({
  es_material: true,
  fotos: [],
  titulo: "Porcelanato 60x60 gris, 38 m²",
  categoria: "Cerámicos y porcelanatos",
  condicion: "nuevo",
  condicion_evidencia: "Cajas cerradas.",
  materiales: [{ nombre: "Porcelanato 60x60", presentacion: "cajas", unidades_contadas: 19, contenido_por_unidad: 2, unidad: "m²", cantidad: 38, evidencia: "", seguro: true }],
  peso_kg: 840,
  descripcion: "Cajas cerradas.",
  confianza: { titulo: "alta", categoria: "alta", condicion: "alta", materiales: "alta", peso: "alta" },
  ...cambios,
});
const rev = (cambios: Partial<Revision> = {}): Revision => ({
  categoria: "Cerámicos y porcelanatos",
  condicion: "nuevo",
  materiales: [{ indice: 0, cantidad: 38, unidad: "m2", coincide: true, motivo: "" }],
  peso_kg: 850,
  problemas: [],
  ...cambios,
});

describe("controles de publicar con fotos", () => {
  it("si las dos revisiones coinciden y las cuentas cierran, no pregunta nada y muestra los controles", () => {
    const p = unificar(obs(), rev());
    expect(p.dudas).toEqual([]);
    expect(p.materiales).toEqual([{ nombre: "Porcelanato 60x60", cantidad: 38, unidad: "m2" }]);
    expect(p.verificaciones).toContain("Cuenta verificada: 19 cajas × 2 m² = 38 m²");
    expect(p.verificaciones.some((v) => v.startsWith("Cantidad de porcelanato 60x60 confirmada"))).toBe(true);
    expect(p.verificaciones.some((v) => v.startsWith("Peso coherente"))).toBe(true);
  });

  it("corrige una cuenta mal hecha con lo que contó y lo que dice la etiqueta", () => {
    const p = unificar(obs({ materiales: [{ ...obs().materiales[0], cantidad: 40 }] }), rev());
    expect(p.materiales[0].cantidad).toBe(38);
    expect(p.verificaciones[0]).toMatch(/^Corregimos una cuenta/);
  });

  it("si la segunda revisión cuenta distinto, le pregunta al vendedor con las dos cifras", () => {
    const p = unificar(obs(), rev({ materiales: [{ indice: 0, cantidad: 36, unidad: "m2", coincide: false, motivo: "Una caja tapada." }] }));
    expect(p.dudas).toEqual([{ campo: "materiales", pregunta: expect.stringMatching(/¿Son 38 m².*contamos 36 m²/) }]);
  });

  it("si no coinciden la categoría o el estado, pregunta cuál es", () => {
    const p = unificar(obs(), rev({ categoria: "Aislantes y durlock", condicion: "sin_uso" }));
    expect(p.dudas.map((d) => d.campo)).toEqual(["categoria", "condicion"]);
  });

  it("controla el peso contra lo esperable para el material, y lo calcula si falta", () => {
    expect(unificar(obs({ peso_kg: 3000 }), rev()).dudas[0]).toEqual({ campo: "peso", pregunta: expect.stringMatching(/~836 kg/) });
    expect(unificar(obs({ peso_kg: null }), rev()).peso_kg).toBe(836);
    expect(pesoEsperado([{ nombre: "Fibra óptica", cantidad: 2000, unidad: "m" }])).toBeNull();
  });

  it("pregunta por datos que la revisión no ve en las fotos, y nunca hace más de 3 preguntas", () => {
    const p = unificar(
      obs({ peso_kg: 5000, confianza: { titulo: "baja", categoria: "baja", condicion: "baja", materiales: "baja", peso: "baja" } }),
      rev({ categoria: "Otros", problemas: ["La marca Ilva no se ve en las fotos"] }),
    );
    expect(p.dudas).toHaveLength(3);
    expect(p.dudas.map((d) => d.campo)).toEqual(["materiales", "categoria", "condicion"]);
    expect(unificar(obs(), rev({ problemas: ["La marca Ilva no se ve en las fotos"] })).dudas[0].pregunta).toMatch(/marca Ilva/);
  });

  it("entiende las unidades como las escribe cualquiera", () => {
    expect(["m²", "M2", "mts2", "metros cuadrados"].map(normalizarUnidad)).toEqual(["m2", "m2", "m2", "m2"]);
    expect(normalizarUnidad("Unidades")).toBe("u");
  });

  it("el proceso completo de prueba pasa por todas las fases", async () => {
    const p = await proponerLoteDesdeFotos([], "", CONSULTAS_DE_PRUEBA);
    expect(p.materiales[0].cantidad).toBe(38); // la IA sumó 40: la cuenta 19 × 2 lo corrige
    expect(p.dudas).toHaveLength(1); // la revisión contó 36
    expect(p.verificaciones.length).toBeGreaterThanOrEqual(3);
  });
});
