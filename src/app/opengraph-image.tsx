import { ImageResponse } from "next/og";
import { coloresOG, fuentesOG, logoOG, TAMANO_OG } from "@/lib/og";

// La imagen que se ve al compartir el sitio (la portada o cualquier página sin una propia).
export const alt = "Sobrá: sobrantes de obra y telecomunicaciones con descuento, en el AMBA";
export const size = TAMANO_OG;
export const contentType = "image/png";

const RUBROS = ["Porcelanatos", "Cables", "Fibra óptica", "Sanitarios", "Cemento", "Durlock"];

export default async function Imagen() {
  const [fuentes, c, logo] = await Promise.all([fuentesOG(), coloresOG(), logoOG()]);
  return new ImageResponse(
    (
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: "100%", height: "100%", padding: "64px 72px", fontFamily: "Geist", background: c.petroleo, color: "#ffffff" }}>
        <img src={logo} alt="" width={291} height={72} style={{ width: 291, height: 72 }} />
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.05 }}>Lo que sobró de una obra,</div>
          <div style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.05, color: c.celeste }}>a mitad de precio.</div>
          <div style={{ fontSize: 30, marginTop: 24, color: "rgba(255,255,255,0.85)" }}>
            Comprá y vendé sobrantes de obra e instalaciones en el AMBA, con pago protegido.
          </div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap" }}>
          {RUBROS.map((r) => (
            <div key={r} style={{ display: "flex", fontSize: 24, padding: "8px 20px", marginRight: 12, borderRadius: 999, background: "rgba(255,255,255,0.12)" }}>
              {r}
            </div>
          ))}
          <div style={{ display: "flex", fontSize: 24, padding: "8px 20px", borderRadius: 999, background: c.marca, fontWeight: 700 }}>Publicar es gratis</div>
        </div>
      </div>
    ),
    { ...size, fonts: fuentes },
  );
}
