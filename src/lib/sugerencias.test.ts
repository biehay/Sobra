import { describe, expect, it } from "vitest";
import { sugerir, type LoteBuscable } from "./sugerencias";

let n = 0;
const lote = (titulo: string, categoria: string, materiales: string[] = []): LoteBuscable => ({
  id: String(++n),
  titulo,
  categoria,
  zona: "CABA",
  items: materiales.map((nombre) => ({ nombre })),
  fotos: [],
  precio_publicado: 1000,
  precio_pedido: 1000,
});

const porcelanato = lote("Porcelanato 60x60 gris símil cemento", "Cerámicos y porcelanatos");
const pegamento = lote("Pegamento para porcelanato x 20 bolsas", "Cemento, cal y áridos");
const placas = lote("Placas de yeso x 40", "Aislantes y durlock", ["Placa de yeso estándar 12,5 mm"]);
const cable = lote("Cable unipolar 2,5 mm", "Electricidad e iluminación");
const caños = lote("Caños termofusión 20 mm", "Plomería y gas");
const bobina = lote("Bobina de fibra óptica monomodo 2 km", "Fibra óptica y telecomunicaciones", ["Cable de fibra óptica 12 hilos"]);
const patchcords = lote("Patchcords SC/APC 3 m x 150", "Fibra óptica y telecomunicaciones");
const lotes = [porcelanato, pegamento, placas, cable, caños, bobina, patchcords];
const CATEGORIAS = ["Cerámicos y porcelanatos", "Aislantes y durlock", "Plomería y gas", "Electricidad e iluminación"];
const ids = (q: string) => sugerir(q, lotes, CATEGORIAS).lotes.map((l) => l.id);

describe("sugerencias del buscador", () => {
  it("con una sola letra no sugiere nada", () => {
    expect(sugerir("p", lotes, CATEGORIAS).lotes).toEqual([]);
  });

  it("sugiere con la palabra a medio escribir, primero lo que la tiene en el título", () => {
    expect(ids("porc")).toEqual([porcelanato.id, pegamento.id]);
  });

  it("ignora tildes y mayúsculas", () => {
    expect(ids("CAÑO")).toEqual([caños.id]);
    expect(ids("cano")).toEqual([caños.id]);
  });

  it("entiende plurales y sinónimos de obra", () => {
    expect(ids("placa ")).toEqual([placas.id]);
    expect(ids("durlock ")).toContain(placas.id);
  });

  it("todas las palabras tienen que estar; si ninguna combinación está, muestra lo parecido", () => {
    expect(ids("porcelanato gris")).toEqual([porcelanato.id]);
    const parecido = sugerir("porcelanato negro", lotes, CATEGORIAS);
    expect(parecido.lotes.map((l) => l.id)).toContain(porcelanato.id);
    expect(parecido.lotes.every((l) => l.parecido)).toBe(true);
  });

  it("sugiere categorías por nombre", () => {
    expect(sugerir("plom", lotes, CATEGORIAS).categorias).toEqual(["Plomería y gas"]);
  });

  it("encuentra fibra óptica con tildes, a medio escribir y por sinónimos", () => {
    // Primero la que lo dice en el título; después la que es de la categoría.
    expect(ids("fibr")).toEqual([bobina.id, patchcords.id]);
    expect(ids("optico ")).toContain(bobina.id);
    expect(ids("latiguillo ")).toEqual([patchcords.id]);
    expect(sugerir("fibra", lotes, ["Fibra óptica y telecomunicaciones"]).categorias).toEqual(["Fibra óptica y telecomunicaciones"]);
  });

  it("encuentra por la marca", () => {
    const conMarca = { ...lote("Bobina de fibra ADSS 24 hilos", "Fibra óptica y telecomunicaciones"), items: [{ nombre: "Cable ADSS 24 hilos", marca: "Fibrex" }] };
    expect(sugerir("fibrex", [...lotes, conMarca], CATEGORIAS).lotes.map((l) => l.id)).toEqual([conMarca.id]);
  });
});
