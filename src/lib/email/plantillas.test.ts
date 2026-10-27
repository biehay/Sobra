import { describe, expect, it } from "vitest";
import { plantillas, urlSitio } from "./plantillas";

describe("plantillas de email", () => {
  it("escapa el HTML que viene de los usuarios", () => {
    const { html } = plantillas.loteObservado("<script>alert(1)</script>", 'Fotos "borrosas" & oscuras', "abc");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Fotos &quot;borrosas&quot; &amp; oscuras");
  });

  it("incluye monto y link al panel en el aviso de nueva oferta", () => {
    const { asunto, html } = plantillas.nuevaOferta("Porcelanato 60x60", 450000);
    expect(asunto).toBe('Nueva oferta por "Porcelanato 60x60"');
    expect(html).toContain("450.000");
    expect(html).toContain(urlSitio("/panel/vendedor"));
  });

  it("le manda el código de retiro al comprador", () => {
    expect(plantillas.pagoConfirmadoComprador("Lote", "482915").html).toContain("482915");
  });

  it("al vendedor le informa el neto después de la comisión", () => {
    expect(plantillas.pagoConfirmadoVendedor("Lote", 396000).html).toContain("396.000");
  });

  it("todas las plantillas devuelven asunto y HTML", () => {
    const casos = [
      plantillas.ofertaAceptada("L", 1),
      plantillas.ofertaRechazada("L"),
      plantillas.ofertaCancelada("L"),
      plantillas.pagoConfirmadoComprador("L", "123456"),
      plantillas.reclamoAbiertoAdmin("L", "comprador", "No coincide", "Detalle"),
      plantillas.reclamoAbiertoContraparte("L", "No coincide", "/panel/vendedor"),
      plantillas.reclamoResuelto("L", "Se devolvió el pago", "Detalle", "/panel/comprador"),
      plantillas.retiroConfirmado("L", 1),
      plantillas.liquidada("L", 1),
      plantillas.lotePublicado("L", 1, "id"),
      plantillas.compradorVerificado(),
      plantillas.adminLoteEnRevision("L", "V"),
      plantillas.adminNuevoUsuario("N", "comprador"),
      plantillas.adminPagoInformado("L", 1),
    ];
    for (const { asunto, html } of casos) {
      expect(asunto.length).toBeGreaterThan(5);
      expect(html).toMatch(/^<!doctype html>/);
    }
  });
});
