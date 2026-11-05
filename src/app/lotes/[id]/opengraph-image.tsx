import { ImageResponse } from "next/og";
import { createClient } from "@supabase/supabase-js";
import { descuento, pesos, urlFoto } from "@/lib/datos";
import { coloresOG, fuentesOG, logoOG, TAMANO_OG } from "@/lib/og";

// La imagen que se ve al compartir un lote (WhatsApp, redes): la foto, el
// descuento, el título, el precio y dónde se retira. Se regenera cada 10 minutos
// (por si baja el precio); WhatsApp igual la guarda un tiempo por su cuenta.
export const alt = "Sobrante de obra en Sobrá";
export const size = TAMANO_OG;
export const contentType = "image/png";
export const revalidate = 600;

type LoteOG = {
  titulo: string;
  categoria: string;
  zona: string;
  localidad: string | null;
  precio_publicado: number | null;
  precio_pedido: number;
  precio_lista: number | null;
  fotos: string[];
  estado: string;
};

async function fotoComoDato(ruta: string | undefined) {
  if (!ruta) return null;
  try {
    const r = await fetch(urlFoto(ruta), { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return null;
    const tipo = r.headers.get("content-type") ?? "image/jpeg";
    if (!/^image\/(jpeg|png)/.test(tipo)) return null;
    return `data:${tipo};base64,${Buffer.from(await r.arrayBuffer()).toString("base64")}`;
  } catch {
    return null;
  }
}

// Sin cortar palabras al medio.
function recortar(texto: string, maximo: number) {
  if (texto.length <= maximo) return texto;
  return `${texto.slice(0, maximo).replace(/\s+\S*$/, "")}…`;
}

export default async function Imagen({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [fuentes, c, logo] = await Promise.all([fuentesOG(), coloresOG(), logoOG()]);
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data } = /^[0-9a-f-]{36}$/.test(id)
    ? await supabase
        .from("lotes")
        .select("titulo, categoria, zona, localidad, precio_publicado, precio_pedido, precio_lista, fotos, estado")
        .eq("id", id)
        .maybeSingle()
    : { data: null };
  const lote = data as LoteOG | null;
  const foto = await fotoComoDato(lote?.fotos[0]);
  const precio = lote ? (lote.precio_publicado ?? lote.precio_pedido) : null;
  const off = lote && precio ? descuento(precio, lote.precio_lista) : null;
  const cerrado = lote?.estado === "vendido" ? "Vendido" : lote?.estado === "reservado" ? "Reservado" : null;

  return new ImageResponse(
    (
      <div style={{ display: "flex", width: "100%", height: "100%", fontFamily: "Geist", background: c.petroleo }}>
        {/* La foto, con el descuento */}
        <div style={{ display: "flex", position: "relative", width: 600, height: 630, background: c.celesteClaro }}>
          {foto ? (
             
            <img src={foto} alt="" width={600} height={630} style={{ width: 600, height: 630, objectFit: "cover" }} />
          ) : (
            <div style={{ display: "flex", width: "100%", height: "100%", alignItems: "center", justifyContent: "center", fontSize: 40, color: c.petroleo }}>
              Sin fotos
            </div>
          )}
          {off ? (
            <div style={{ display: "flex", position: "absolute", top: 32, left: 32, background: c.marca, color: "#ffffff", fontSize: 44, fontWeight: 700, padding: "8px 22px", borderRadius: 999 }}>
              -{off}%
            </div>
          ) : null}
          {cerrado ? (
            <div style={{ display: "flex", position: "absolute", bottom: 32, left: 32, background: "#ffffff", color: c.petroleo, fontSize: 34, fontWeight: 700, padding: "8px 22px", borderRadius: 999 }}>
              {cerrado}
            </div>
          ) : null}
        </div>

        {/* Los datos */}
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 600, padding: "48px 52px", color: "#ffffff" }}>
          <img src={logo} alt="" width={194} height={48} style={{ width: 194, height: 48, flexShrink: 0 }} />
          {lote ? (
            // El bloque del medio se achica si hace falta: el renglón de abajo (retiro) siempre se ve.
            <div style={{ display: "flex", flexDirection: "column", flexShrink: 1, overflow: "hidden", margin: "20px 0" }}>
              <div style={{ fontSize: 20, letterSpacing: 1, textTransform: "uppercase", color: c.celeste, fontWeight: 700 }}>{recortar(lote.categoria, 34)}</div>
              {/* Títulos largos: letra más chica y como mucho tres renglones. */}
              <div style={{ fontSize: lote.titulo.length > 45 ? 38 : 50, fontWeight: 700, lineHeight: 1.12, marginTop: 12 }}>
                {recortar(lote.titulo, lote.titulo.length > 45 ? 62 : 70)}
              </div>
              <div style={{ display: "flex", alignItems: "baseline", marginTop: 26 }}>
                <div style={{ fontSize: 72, fontWeight: 700 }}>{precio ? pesos(precio) : "A convenir"}</div>
              </div>
              {off && lote.precio_lista ? (
                <div style={{ display: "flex", fontSize: 28, marginTop: 4 }}>
                  <span style={{ textDecoration: "line-through", color: "rgba(255,255,255,0.6)" }}>{pesos(lote.precio_lista)}</span>
                  <span style={{ marginLeft: 14, color: "#ffffff" }}>nuevo · {off}% menos</span>
                </div>
              ) : null}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: 50, fontWeight: 700, lineHeight: 1.12 }}>Sobrantes de obra con descuento</div>
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", flexShrink: 0, fontSize: 24, color: "rgba(255,255,255,0.85)" }}>
            {lote ? <span>Retiro en {lote.localidad ? `${lote.zona}, ${lote.localidad}` : lote.zona}</span> : null}
            <span style={{ marginTop: 6 }}>Pago protegido hasta que retirás</span>
          </div>
        </div>
      </div>
    ),
    { ...size, fonts: fuentes },
  );
}
