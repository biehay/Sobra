import { describe, expect, it } from "vitest";
import type { Lote } from "@/lib/datos";
import { palabras, parecido, recomendar, type Senal } from "./motor";

const AHORA = new Date("2026-11-02T12:00:00Z").getTime();
const hace = (dias: number) => new Date(AHORA - dias * 86_400_000).toISOString();

let n = 0;
function lote(datos: Partial<Lote> & Pick<Lote, "titulo" | "categoria">): Lote {
  n++;
  return {
    id: `lote-${n}`,
    vendedor_id: "vendedor",
    descripcion: "",
    condicion: "nuevo",
    items: [],
    zona: "CABA",
    localidad: "",
    precio_lista: null,
    precio_pedido: 100_000,
    precio_sugerido: null,
    precio_publicado: 100_000,
    peso_kg: null,
    baja_semanal_pct: null,
    ultima_baja_at: null,
    fotos: [],
    estado: "publicado",
    nota_admin: null,
    publicado_at: hace(3),
    created_at: hace(3),
    ...datos,
  };
}

const senal = (l: Lote, tipo: Senal["tipo"], dias = 1): Senal => ({ lote: l, tipo, fecha: hace(dias) });

describe("palabras", () => {
  it("ignora tildes, plurales y palabras vacías", () => {
    expect(palabras("Caños de PPR")).toEqual(palabras("caño ppr"));
    expect(palabras("Perfiles")).toEqual(palabras("perfil"));
    expect(palabras("Llaves")).toEqual(palabras("llave"));
    expect(palabras("Porcelanato 60x60")).toContain("60x60");
  });
});

describe("recomendar", () => {
  const porcelanatoVisto = lote({ titulo: "Porcelanato 60x60 gris", categoria: "Cerámicos y porcelanatos" });
  const porcelanatoParecido = lote({ titulo: "Porcelanato 60x60 beige", categoria: "Cerámicos y porcelanatos" });
  const pegamento = lote({ titulo: "Pegamento para porcelanato x 20 bolsas", categoria: "Cemento, cal y áridos" });
  const cable = lote({ titulo: "Cable unipolar 2,5 mm", categoria: "Electricidad e iluminación" });
  const inodoro = lote({ titulo: "Inodoro largo Ferrum", categoria: "Sanitarios y grifería" });

  it("después de ver algo, recomienda lo parecido antes que lo que no tiene nada que ver", () => {
    const recs = recomendar({ senales: [senal(porcelanatoVisto, "vista")], candidatos: [cable, porcelanatoParecido], ahora: AHORA });
    expect(recs[0].lote.id).toBe(porcelanatoParecido.id);
    expect(recs[0].motivo.texto).toContain("Porque viste");
  });

  it("después de comprar, prioriza lo que va con la compra (complementos de obra)", () => {
    const recs = recomendar({
      senales: [senal(porcelanatoVisto, "compra")],
      candidatos: [porcelanatoParecido, pegamento, cable],
      ahora: AHORA,
    });
    expect(recs[0].lote.id).toBe(pegamento.id);
    expect(recs[0].motivo.tipo).toBe("complemento");
    expect(recs[0].motivo.texto).toContain("Va con");
  });

  it("no recomienda lo propio, lo ya comprado ni lo que no está publicado", () => {
    const propio = lote({ titulo: "Porcelanato 60x60 negro", categoria: "Cerámicos y porcelanatos", vendedor_id: "yo" });
    const vendido = lote({ titulo: "Porcelanato 60x60 blanco", categoria: "Cerámicos y porcelanatos", estado: "vendido" });
    const recs = recomendar({
      senales: [senal(porcelanatoVisto, "compra")],
      candidatos: [porcelanatoVisto, propio, vendido, pegamento],
      usuarioId: "yo",
      ahora: AHORA,
    });
    const ids = recs.map((r) => r.lote.id);
    expect(ids).not.toContain(propio.id);
    expect(ids).not.toContain(vendido.id);
    expect(ids).not.toContain(porcelanatoVisto.id);
  });

  it("lo reciente pesa más que lo viejo", () => {
    const recs = recomendar({
      senales: [senal(cable, "vista", 60), senal(inodoro, "vista", 1)],
      candidatos: [
        lote({ titulo: "Cable unipolar 4 mm", categoria: "Electricidad e iluminación" }),
        lote({ titulo: "Inodoro corto Ferrum", categoria: "Sanitarios y grifería" }),
      ],
      ahora: AHORA,
    });
    expect(recs[0].lote.titulo).toContain("Inodoro");
  });

  it("da variedad: no llena la lista con la misma categoría si hay alternativas buenas", () => {
    const ceramicos = Array.from({ length: 6 }, (_, i) => lote({ titulo: `Porcelanato 60x60 modelo ${i}`, categoria: "Cerámicos y porcelanatos" }));
    const recs = recomendar(
      { senales: [senal(porcelanatoVisto, "compra"), senal(porcelanatoVisto, "favorito")], candidatos: [...ceramicos, pegamento], ahora: AHORA },
      4,
    );
    expect(recs.map((r) => r.lote.id)).toContain(pegamento.id);
  });

  it("usa lo que vieron otros cuando hay coincidencias", () => {
    const sinRelacion = lote({ titulo: "Membrana asfáltica", categoria: "Pinturas e impermeabilizantes" });
    const otro = lote({ titulo: "Membrana líquida", categoria: "Pinturas e impermeabilizantes" });
    const recs = recomendar({
      senales: [senal(cable, "vista")],
      candidatos: [sinRelacion, otro],
      colectivas: new Map([[otro.id, { en_comun: 5, popularidad: 6 }]]),
      ahora: AHORA,
    });
    expect(recs[0].lote.id).toBe(otro.id);
    expect(recs[0].motivo.tipo).toBe("colectiva");
  });

  it("sin historial, muestra lo nuevo, con descuento y cerca", () => {
    const viejoCaro = lote({ titulo: "Aberturas usadas", categoria: "Aberturas", publicado_at: hace(60), zona: "GBA Sur" });
    const nuevoBarato = lote({ titulo: "Pintura látex", categoria: "Pinturas e impermeabilizantes", precio_lista: 300_000, publicado_at: hace(1) });
    const recs = recomendar({ senales: [], candidatos: [viejoCaro, nuevoBarato], zonaUsuario: "CABA", ahora: AHORA });
    expect(recs[0].lote.id).toBe(nuevoBarato.id);
  });

  it("dos lotes de la misma categoría y con palabras en común se parecen más que dos distintos", () => {
    expect(parecido(porcelanatoVisto, porcelanatoParecido)).toBeGreaterThan(parecido(porcelanatoVisto, cable));
  });
});
