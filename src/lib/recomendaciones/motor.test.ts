import { describe, expect, it } from "vitest";
import type { Lote } from "@/lib/datos";
import { cantidadDe, medidas, ordenar, palabras, parecido, recomendar, type Ficha, type Senal } from "./motor";

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

  it("entiende sinónimos de obra", () => {
    expect(palabras("Cerámica")).toEqual(palabras("cerámicos"));
    expect(palabras("tubos")).toEqual(palabras("caño"));
    expect(palabras("canillas")).toEqual(palabras("grifería"));
  });

  it("saca las medidas del producto, no las cantidades", () => {
    expect(medidas("Porcelanato 60 x 60, 45 m2")).toEqual(["med:60x60"]);
    expect(medidas("Cable 2,5 mm x 8 rollos")).toContain("med:2.5mm");
    expect(medidas("Caño PPR 20mm")).toEqual(["med:20mm"]);
    expect(medidas("10 bolsas de 50 kg")).toEqual([]);
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

  it("prefiere la misma medida que lo que viste", () => {
    const visto = lote({ titulo: "Porcelanato 60x60 gris", categoria: "Cerámicos y porcelanatos" });
    const otraMedida = lote({ titulo: "Porcelanato 45x45 gris", categoria: "Cerámicos y porcelanatos" });
    const mismaMedida = lote({ titulo: "Porcelanato 60x60 beige", categoria: "Cerámicos y porcelanatos" });
    const recs = recomendar({ senales: [senal(visto, "vista")], candidatos: [otraMedida, mismaMedida], ahora: AHORA });
    expect(recs[0].lote.id).toBe(mismaMedida.id);
  });

  it("una zona vecina vale más que una lejana", () => {
    const visto = lote({ titulo: "Cable unipolar 2,5 mm", categoria: "Electricidad e iluminación", zona: "CABA" });
    const vecino = lote({ titulo: "Cable unipolar 4 mm", categoria: "Electricidad e iluminación", zona: "GBA Norte" });
    const lejos = lote({ titulo: "Cable unipolar 4 mm", categoria: "Electricidad e iluminación", zona: "La Plata y alrededores" });
    const recs = recomendar({ senales: [senal(visto, "vista")], candidatos: [lejos, vecino], ahora: AHORA });
    expect(recs[0].lote.id).toBe(vecino.id);
  });

  it("lo que guardó en Lo busco aparece primero y lo dice", () => {
    const buscado = lote({ titulo: "Inodoro corto Ferrum", categoria: "Sanitarios y grifería" });
    const recs = recomendar({
      senales: [senal(cable, "vista")],
      busquedas: [{ texto: "inodoro", categoria: null, zona: null, fecha: hace(2) }],
      candidatos: [lote({ titulo: "Cable unipolar 6 mm", categoria: "Electricidad e iluminación" }), buscado],
      ahora: AHORA,
    });
    expect(recs[0].lote.id).toBe(buscado.id);
    expect(recs[0].motivo.tipo).toBe("busqueda");
  });

  it("si algo complementa la compra y además lo busca, sabe las dos cosas", () => {
    const pegamento = lote({ titulo: "Pegamento para porcelanato 30 kg", categoria: "Cales, cementos y morteros" });
    const recs = recomendar({
      senales: [senal(porcelanatoVisto, "compra")],
      busquedas: [{ texto: "pegamento", categoria: null, zona: null, fecha: hace(2) }],
      candidatos: [pegamento, lote({ titulo: "Cable unipolar 6 mm", categoria: "Electricidad e iluminación" })],
      ahora: AHORA,
    });
    expect(recs[0].lote.id).toBe(pegamento.id);
    expect(recs[0].motivo.tipo).toBe("busqueda");
    expect(recs[0].complemento?.tipo).toBe("complemento");
    expect(recs[1].complemento).toBeNull();
  });

  it("a igualdad, prefiere al vendedor que cumple", () => {
    const deCumplidor = lote({ titulo: "Porcelanato 60x60 negro", categoria: "Cerámicos y porcelanatos", vendedor_id: "cumple" });
    const deNuevo = lote({ titulo: "Porcelanato 60x60 negro", categoria: "Cerámicos y porcelanatos", vendedor_id: "nuevo" });
    const recs = recomendar({
      senales: [senal(porcelanatoVisto, "vista")],
      candidatos: [deNuevo, deCumplidor],
      confianza: new Map([["cumple", 1], ["nuevo", 0.5]]),
      ahora: AHORA,
    });
    expect(recs[0].lote.id).toBe(deCumplidor.id);
  });

  it("con 6 lugares, deja uno para descubrir algo de otra categoría", () => {
    const ceramicos = Array.from({ length: 8 }, (_, i) => lote({ titulo: `Porcelanato 60x60 tono ${i}`, categoria: "Cerámicos y porcelanatos" }));
    const distinto = lote({ titulo: "Pintura látex 20 litros", categoria: "Pinturas e impermeabilizantes" });
    const recs = recomendar({ senales: [senal(porcelanatoVisto, "favorito")], candidatos: [...ceramicos, distinto], ahora: AHORA }, 6);
    expect(recs).toHaveLength(6);
    expect(recs[5].lote.id).toBe(distinto.id);
    expect(recs[5].motivo.tipo).toBe("descubrir");
  });

  it("lee cantidades del lote: m², bolsas y kg", () => {
    expect(cantidadDe(lote({ titulo: "Porcelanato 60x60, 45 m²", categoria: "Cerámicos y porcelanatos" }), "m2")).toBe(45);
    expect(cantidadDe(lote({ titulo: "Pegamento x 10 bolsas", categoria: "Cemento, cal y áridos" }), "kg")).toBe(300);
    expect(
      cantidadDe(lote({ titulo: "Pegamento", categoria: "Cemento, cal y áridos", items: [{ nombre: "Pegamento", cantidad: 8, unidad: "bolsas" }] }), "kg"),
    ).toBe(240);
  });

  it("rendimientos: prefiere el complemento cuya cantidad alcanza para lo que compró", () => {
    const compra = lote({ titulo: "Porcelanato 60x60 gris, 45 m²", categoria: "Cerámicos y porcelanatos" });
    const poco = lote({ titulo: "Pegamento para porcelanato x 2 bolsas", categoria: "Cemento, cal y áridos" });
    const justo = lote({ titulo: "Pegamento para porcelanato x 8 bolsas", categoria: "Cemento, cal y áridos" });
    const recs = recomendar({ senales: [senal(compra, "compra")], candidatos: [poco, justo], ahora: AHORA });
    expect(recs[0].lote.id).toBe(justo.id);
    // 45 m² × 5 kg = 225 kg; 8 bolsas × 30 kg = 240 kg -> alcanza para ~48 m².
    expect(recs[0].motivo.texto).toContain("Para tus 45 m²");
    expect(recs[0].motivo.texto).toContain("alcanza para ~48 m²");
  });

  it("etapas de obra: después de la estructura, anticipa los cerramientos", () => {
    const hierro = lote({ titulo: "Hierro del 8 x 50 barras", categoria: "Hierros y perfiles" });
    const cemento = lote({ titulo: "Cemento x 20 bolsas", categoria: "Cemento, cal y áridos" });
    const ventana = lote({ titulo: "Ventana de aluminio 150x110", categoria: "Aberturas" });
    const griferia = lote({ titulo: "Grifería monocomando", categoria: "Sanitarios y grifería" });
    const recs = recomendar(
      { senales: [senal(hierro, "compra"), senal(cemento, "compra")], candidatos: [griferia, ventana], ahora: AHORA },
      2,
    );
    expect(recs[0].lote.id).toBe(ventana.id);
    expect(recs[0].motivo.texto).toContain("próxima etapa");
  });

  it("un solo viaje: sube lo del mismo vendedor que ya tiene para retirar", () => {
    const delMismo = lote({ titulo: "Cable unipolar 4 mm", categoria: "Electricidad e iluminación", vendedor_id: "marta" });
    const deOtro = lote({ titulo: "Cable unipolar 4 mm", categoria: "Electricidad e iluminación", vendedor_id: "otro" });
    const recs = recomendar({
      senales: [senal(cable, "vista")],
      candidatos: [deOtro, delMismo],
      retiros: [{ vendedorId: "marta", zona: "CABA", localidad: "Palermo", titulo: "Porcelanato 60x60" }],
      ahora: AHORA,
    });
    expect(recs[0].lote.id).toBe(delMismo.id);
    expect(recs[0].motivo.tipo).toBe("viaje");
  });

  it("anti-desperdicio: a igualdad, le da lugar al sobrante que casi nadie vio", () => {
    const olvidado = lote({ titulo: "Cable unipolar 4 mm", categoria: "Electricidad e iluminación", publicado_at: hace(20) });
    const visto = lote({ titulo: "Cable unipolar 4 mm", categoria: "Electricidad e iluminación", publicado_at: hace(20) });
    const recs = recomendar({
      senales: [senal(cable, "vista")],
      candidatos: [visto, olvidado],
      popularidad: new Map([[visto.id, 40], [olvidado.id, 0]]),
      ahora: AHORA,
    });
    expect(recs[0].lote.id).toBe(olvidado.id);
  });

  describe("con fichas técnicas (cualquier rubro)", () => {
    const fibra = lote({ titulo: "Fibra óptica monomodo 12 hilos, bobina 1000 m", categoria: "Telecomunicaciones" });
    const fichaFibra: Ficha = {
      material: "fibra óptica monomodo",
      rubro: "telecomunicaciones",
      proceso: "Se tiende por ductos o postes y se fusiona o conectoriza en los extremos.",
      etapa: "instalaciones",
      palabras_clave: ["fibra", "monomodo", "fo", "cable óptico"],
      unidad: "m",
      cantidad: 1000,
      complementos: [
        { material: "conector SC", por_que: "para terminar los hilos y conectarlos", palabras_clave: ["conector", "sc", "fibra"], cantidad_por_unidad: 0.024, unidad: "u" },
        { material: "caja de empalme", por_que: "para proteger las fusiones", palabras_clave: ["caja", "empalme", "manga"], cantidad_por_unidad: null, unidad: "ninguna" },
      ],
    };

    it("después de comprar fibra, recomienda conectores y dice para qué", () => {
      const conectores = lote({ titulo: "Conectores SC para fibra x 30 unidades", categoria: "Telecomunicaciones" });
      const utp = lote({ titulo: "Cable UTP categoría 6, 305 m", categoria: "Telecomunicaciones" });
      const recs = recomendar({
        senales: [senal(fibra, "compra")],
        candidatos: [utp, conectores],
        fichas: new Map([[fibra.id, fichaFibra]]),
        ahora: AHORA,
      });
      expect(recs[0].lote.id).toBe(conectores.id);
      expect(recs[0].motivo.texto).toContain("Va con tu fibra óptica monomodo: para terminar los hilos");
      // 1000 m × 0,024 = 24 conectores; el lote trae 30.
      expect(recs[0].motivo.texto).toContain("te alcanza");
    });

    it("sirve para cualquier producto: después de una consola, los controles", () => {
      const consola = lote({ titulo: "PlayStation 5 sin uso", categoria: "Otros" });
      const ficha: Ficha = {
        material: "consola PlayStation 5",
        rubro: "electrónica",
        proceso: "Se conecta al televisor y se juega con controles.",
        etapa: "otro",
        palabras_clave: ["playstation", "ps5", "consola"],
        unidad: "u",
        cantidad: 1,
        complementos: [
          { material: "joystick", por_que: "para jugar de a dos", palabras_clave: ["control", "joystick", "dualsense"], cantidad_por_unidad: 1, unidad: "u" },
        ],
      };
      const joystick = lote({ titulo: "Joystick DualSense blanco", categoria: "Otros" });
      const silla = lote({ titulo: "Silla de oficina", categoria: "Otros" });
      const recs = recomendar({ senales: [senal(consola, "compra")], candidatos: [silla, joystick], fichas: new Map([[consola.id, ficha]]), ahora: AHORA });
      expect(recs[0].lote.id).toBe(joystick.id);
      expect(recs[0].motivo.texto).toContain("para jugar de a dos");
    });

    it("las palabras clave de la ficha ayudan a encontrar parecidos aunque el título sea distinto", () => {
      const fichaOtra: Ficha = { ...fichaFibra, material: "fibra óptica monomodo", palabras_clave: ["fibra", "monomodo"] };
      const otraFibra = lote({ titulo: "Bobina FO 500 m", categoria: "Telecomunicaciones" });
      const nada = lote({ titulo: "Bobina de manguera 50 m", categoria: "Otros" });
      const recs = recomendar({
        senales: [senal(fibra, "vista")],
        candidatos: [nada, otraFibra],
        fichas: new Map([[fibra.id, fichaFibra], [otraFibra.id, fichaOtra]]),
        ahora: AHORA,
      });
      expect(recs[0].lote.id).toBe(otraFibra.id);
    });
  });

  it("dos lotes de la misma categoría y con palabras en común se parecen más que dos distintos", () => {
    expect(parecido(porcelanatoVisto, porcelanatoParecido)).toBeGreaterThan(parecido(porcelanatoVisto, cable));
  });
});

describe("ordenar (catálogo Para vos)", () => {
  it("pone primero lo que le interesa, no saca lo que ya vio y deja lo reservado al final", () => {
    const visto = lote({ titulo: "Porcelanato 60x60 gris", categoria: "Cerámicos y porcelanatos" });
    const cable = lote({ titulo: "Cable unipolar 2,5 mm", categoria: "Electricidad e iluminación" });
    const reservado = lote({ titulo: "Porcelanato 60x60 beige", categoria: "Cerámicos y porcelanatos", estado: "reservado" });
    const parecidoAlVisto = lote({ titulo: "Porcelanato 60x60 blanco", categoria: "Cerámicos y porcelanatos" });
    const orden = ordenar({
      senales: [{ lote: visto, tipo: "favorito", fecha: hace(1) }],
      candidatos: [cable, reservado, parecidoAlVisto, visto],
      ahora: AHORA,
    });
    expect(orden.map((l) => l.id)).toHaveLength(4);
    expect(orden.indexOf(parecidoAlVisto)).toBeLessThan(orden.indexOf(cable));
    expect(orden.indexOf(visto)).toBeLessThan(orden.indexOf(cable));
    expect(orden[3]).toBe(reservado);
  });
});

describe("complementos que no son", () => {
  it("una descripción con 'cajas cerradas' no lo vuelve complemento de un cable, y la fibra óptica no pide térmicas", () => {
    const cableElectrico = lote({ titulo: "Cable unipolar 2,5 mm x 4 rollos", categoria: "Electricidad e iluminación" });
    const fibra = lote({ titulo: "Bobina de fibra óptica monomodo", categoria: "Otros", items: [{ nombre: "Cable de fibra óptica 12 hilos", cantidad: 2000, unidad: "m" }] });
    const porcelanato = lote({ titulo: "Porcelanato 60x120 calacatta", categoria: "Cerámicos y porcelanatos", descripcion: "Cajas cerradas." });
    const tablero = lote({ titulo: "Tablero con 12 térmicas", categoria: "Electricidad e iluminación" });
    const conCable = recomendar({ senales: [senal(cableElectrico, "compra")], candidatos: [porcelanato, tablero], ahora: AHORA });
    expect(conCable.find((r) => r.lote.id === tablero.id)?.complemento).not.toBeNull();
    expect(conCable.find((r) => r.lote.id === porcelanato.id)?.complemento ?? null).toBeNull();
    const conFibra = recomendar({ senales: [senal(fibra, "compra")], candidatos: [porcelanato, tablero], ahora: AHORA });
    expect(conFibra.every((r) => r.complemento === null)).toBe(true);
    const cajasDeFibra = lote({ titulo: "Conectores y cajas de empalme", categoria: "Otros", items: [{ nombre: "Caja de empalme 24 fibras", cantidad: 6, unidad: "u" }] });
    const cajasDeLuz = lote({ titulo: "Cajas de luz rectangulares x 50", categoria: "Electricidad e iluminación" });
    const otraVez = recomendar({ senales: [senal(cableElectrico, "compra")], candidatos: [cajasDeFibra, cajasDeLuz], ahora: AHORA });
    expect(otraVez.find((r) => r.lote.id === cajasDeLuz.id)?.complemento).not.toBeNull();
    expect(otraVez.find((r) => r.lote.id === cajasDeFibra.id)?.complemento ?? null).toBeNull();
  });

  it("pastina y pegamento no cuentan como repetidos: cubren necesidades distintas", () => {
    const porcelanato = lote({ titulo: "Porcelanato 60x60 gris", categoria: "Cerámicos y porcelanatos", zona: "CABA", items: [{ nombre: "Porcelanato 60x60", cantidad: 38, unidad: "m2" }] });
    const deposito = { zona: "GBA Norte", vendedor_id: "corralon" };
    const pastina = lote({ titulo: "Pastina gris x 15 kg", categoria: "Cemento, cal y áridos", ...deposito });
    const pegamento = lote({ titulo: "Pegamento para porcelanato x 20 bolsas de 30 kg", categoria: "Cemento, cal y áridos", ...deposito });
    const bachas = lote({ titulo: "Bachas de apoyar x 5", categoria: "Sanitarios y grifería", zona: "CABA" });
    const latex = lote({ titulo: "Látex interior x 6 baldes", categoria: "Pinturas e impermeabilizantes", zona: "CABA" });
    const recs = recomendar({ senales: [senal(porcelanato, "compra")], candidatos: [bachas, latex, pastina, pegamento], ahora: AHORA }, 3);
    expect(recs.map((r) => r.lote.id)).toEqual(expect.arrayContaining([pastina.id, pegamento.id]));
  });
});

describe("fibra óptica y telecomunicaciones (sin ficha técnica)", () => {
  const FO = "Fibra óptica y telecomunicaciones";
  it("después de comprar fibra recomienda conectores, splitters y patchcords, no cosas de obra", () => {
    const bobina = lote({ titulo: "Bobina de fibra óptica monomodo 2 km", categoria: FO });
    const conectores = lote({ titulo: "Conectores SC/APC x 200", categoria: FO });
    const splitters = lote({ titulo: "Splitters PLC 1x8", categoria: FO });
    const latiguillos = lote({ titulo: "Latiguillos SC/APC 3 m x 150", categoria: FO });
    const pegamento = lote({ titulo: "Pegamento para porcelanato x 20 bolsas", categoria: "Cemento, cal y áridos" });
    const recs = recomendar({ senales: [senal(bobina, "compra")], candidatos: [pegamento, conectores, splitters, latiguillos], ahora: AHORA }, 3);
    expect(recs.map((r) => r.lote.id)).toEqual(expect.arrayContaining([conectores.id, splitters.id, latiguillos.id]));
    expect(recs.every((r) => r.complemento?.tipo === "complemento")).toBe(true);
  });

  it("entiende los sinónimos del rubro", () => {
    expect(palabras("Latiguillo óptico")).toEqual(palabras("patchcord optica"));
    expect(palabras("Derivador 1x8")).toContain("splitter");
  });
});
