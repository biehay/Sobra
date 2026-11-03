"use client";

import { useRef, useState, useTransition } from "react";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { limpiarFoto } from "@/lib/limpiar-foto";
import { detallesPara } from "@/lib/depreciacion";
import { CATEGORIAS, CONDICIONES, ZONAS, pesos, precioSugerido, urlFoto, type Condicion, type Item, type Lote } from "@/lib/datos";
import { BotonEnviar } from "@/components/boton-enviar";
import { guardarLote } from "../acciones";
import { PrecioConIA } from "./precio-con-ia";
import { completarConFotos } from "./fotos-ia";
import { TarjetaLote } from "@/components/tarjeta-lote";
import type { CampoDuda, PropuestaLote } from "@/lib/lote-desde-fotos";

type Retiro = { direccion: string; horarios: string; indicaciones: string };

const MAX_FOTOS = 10;
// Tope del archivo original; después de limpiarla la foto queda mucho más liviana.
const MAX_BYTES = 25 * 1024 * 1024;

// `inicial`: para un lote nuevo, lo que cargó en la calculadora de la portada.
export function FormLote({
  usuarioId,
  lote,
  retiro,
  precioMinimo,
  inicial,
  soloVista = false,
}: {
  usuarioId: string;
  lote?: Lote;
  retiro?: Retiro | null;
  precioMinimo?: number | null;
  inicial?: { precioLista?: string; condicion?: Condicion; titulo?: string; precioPedido?: number; item?: Item };
  // Para la cuenta admin: ve el formulario entero pero no lo puede enviar.
  soloVista?: boolean;
}) {
  const [items, setItems] = useState<Item[]>(lote?.items.length ? lote.items : inicial?.item ? [inicial.item] : [{ nombre: "", cantidad: 1, unidad: "u" }]);
  const [fotos, setFotos] = useState<string[]>(lote?.fotos ?? []);
  const [subiendo, setSubiendo] = useState(false);
  const [errorFotos, setErrorFotos] = useState("");
  const [precioLista, setPrecioLista] = useState(lote?.precio_lista?.toString() ?? inicial?.precioLista ?? "");
  const [condicion, setCondicion] = useState<Condicion>(lote?.condicion ?? inicial?.condicion ?? "nuevo");
  const [bajaActiva, setBajaActiva] = useState(lote?.baja_semanal_pct != null);
  // "Detalles a tener en cuenta": dependen del rubro y bajan el precio sugerido.
  const [detalles, setDetalles] = useState<string[]>(lote?.detalles ?? []);
  const formulario = useRef<HTMLFormElement>(null);
  const precioPedido = useRef<HTMLInputElement>(null);
  // Completar con fotos: lo que propuso la IA y lo que el vendedor tiene que confirmar.
  const [propuesta, setPropuesta] = useState<PropuestaLote | null>(null);
  const [dudas, setDudas] = useState<{ campo: CampoDuda; pregunta: string }[]>([]);
  const [errorIA, setErrorIA] = useState("");
  const [analizando, analizar] = useTransition();
  const resumen = useRef<HTMLDivElement>(null);
  // Para la vista previa: una copia de los campos de texto, que se actualiza al cambiar algo.
  const precioInicial = lote?.precio_pedido ?? inicial?.precioPedido ?? precioSugerido(Number(inicial?.precioLista) || null, inicial?.condicion ?? "nuevo", lote?.categoria) ?? undefined;
  const [campos, setCampos] = useState<Record<string, string>>({ precio_pedido: precioInicial ? String(precioInicial) : "", categoria: lote?.categoria ?? "" });
  const categoriaActual = campos.categoria || null;
  const opcionesDetalle = detallesPara(categoriaActual);
  const detallesValidos = detalles.filter((d) => opcionesDetalle.some((o) => o.id === d));
  const textoLote = `${campos.titulo ?? lote?.titulo ?? ""} ${items.map((i) => i.nombre).join(" ")}`;
  const sugerido = precioSugerido(Number(precioLista) || null, condicion, categoriaActual, detallesValidos, textoLote);
  const leerCampos = () => {
    if (!formulario.current) return;
    const f = new FormData(formulario.current);
    setCampos(Object.fromEntries(["titulo", "categoria", "zona", "precio_pedido"].map((c) => [c, String(f.get(c) ?? "")])));
  };

  const resolver = (campo: CampoDuda) => setDudas((d) => d.filter((x) => x.campo !== campo));
  const dudaDe = (campo: CampoDuda) => dudas.find((d) => d.campo === campo);

  function completarConIA() {
    setErrorIA("");
    const titulo = (formulario.current?.elements.namedItem("titulo") as HTMLInputElement | null)?.value ?? "";
    analizar(async () => {
      const r = await completarConFotos(fotos, titulo);
      if (!r.ok) {
        setErrorIA(r.error);
        return;
      }
      const p = r.propuesta;
      const campos = formulario.current!.elements;
      (campos.namedItem("titulo") as HTMLInputElement).value = p.titulo;
      (campos.namedItem("categoria") as HTMLSelectElement).value = p.categoria;
      (campos.namedItem("peso_kg") as HTMLInputElement).value = p.peso_kg ? String(p.peso_kg) : "";
      (campos.namedItem("descripcion") as HTMLTextAreaElement).value = p.descripcion;
      setCondicion(p.condicion);
      setDetalles(p.detalles);
      if (p.materiales.length) setItems(p.materiales.map((m) => ({ nombre: m.nombre, cantidad: m.cantidad, unidad: m.unidad })));
      setPropuesta(p);
      setDudas(p.dudas);
      leerCampos();
      setTimeout(() => resumen.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    });
  }

  // Si el vendedor cambia un campo que estaba en duda, ya lo revisó.
  function alCambiar(e: React.FormEvent<HTMLFormElement>) {
    const nombre = (e.target as HTMLInputElement).name;
    const campo = ({ titulo: "titulo", categoria: "categoria", condicion: "condicion", peso_kg: "peso" } as Record<string, CampoDuda>)[nombre];
    if (campo) resolver(campo);
    leerCampos();
  }

  // Lo que la IA necesita para tasar: lo que ya está escrito en el formulario.
  function datosDelLote() {
    const f = new FormData(formulario.current!);
    return {
      titulo: String(f.get("titulo") ?? ""),
      categoria: String(f.get("categoria") ?? ""),
      condicion,
      descripcion: String(f.get("descripcion") ?? ""),
      items: items.filter((i) => i.nombre.trim() && i.cantidad > 0),
      detalles: detallesValidos,
    };
  }

  function usarPrecioIA(mercado: number, sugeridoIA: number) {
    setPrecioLista(String(mercado));
    if (precioPedido.current) precioPedido.current.value = String(sugeridoIA);
    leerCampos();
  }

  async function subirFotos(archivos: FileList | null) {
    if (!archivos?.length) return;
    setErrorFotos("");
    const lista = Array.from(archivos).slice(0, MAX_FOTOS - fotos.length);
    if (lista.some((a) => a.size > MAX_BYTES)) {
      setErrorFotos("Cada foto puede pesar hasta 25 MB.");
      return;
    }
    setSubiendo(true);
    const supabase = crearClienteNavegador();
    const nuevas: string[] = [];
    for (const archivo of lista) {
      const ruta = `${usuarioId}/${crypto.randomUUID()}.jpg`;
      let foto: Blob;
      try {
        foto = await limpiarFoto(archivo);
      } catch {
        setErrorFotos(`No pudimos leer ${archivo.name}. Probá con una foto JPG o PNG.`);
        break;
      }
      const { error } = await supabase.storage.from("lotes").upload(ruta, foto, { contentType: "image/jpeg" });
      if (error) {
        setErrorFotos(`No se pudo subir ${archivo.name}: ${error.message}`);
        break;
      }
      nuevas.push(ruta);
    }
    setFotos((actuales) => [...actuales, ...nuevas]);
    setSubiendo(false);
  }

  function cambiarItem(i: number, cambio: Partial<Item>) {
    resolver("materiales");
    setItems((actuales) => actuales.map((item, j) => (j === i ? { ...item, ...cambio } : item)));
  }

  const itemsValidos = items.filter((item) => item.nombre.trim() && item.cantidad > 0);
  const valor = (campo: string, otro = "") => campos[campo] || otro;
  const vistaPrevia: Lote = {
    id: lote?.id ?? "vista-previa",
    vendedor_id: usuarioId,
    titulo: valor("titulo", lote?.titulo ?? "Título del lote"),
    descripcion: "",
    categoria: valor("categoria", lote?.categoria ?? "Categoría"),
    condicion,
    items: itemsValidos,
    zona: valor("zona", lote?.zona ?? "Zona"),
    localidad: "",
    precio_lista: Number(precioLista) || null,
    precio_pedido: Number(valor("precio_pedido")) || lote?.precio_pedido || 0,
    precio_sugerido: null,
    precio_publicado: Number(valor("precio_pedido")) || lote?.precio_pedido || null,
    peso_kg: null,
    baja_semanal_pct: null,
    ultima_baja_at: null,
    fotos,
    estado: "publicado",
    nota_admin: null,
    publicado_at: null,
    created_at: "",
  };

  return (
    <form ref={formulario} action={guardarLote} onChange={alCambiar} className="space-y-6">
      {lote && <input type="hidden" name="id" value={lote.id} />}
      <input type="hidden" name="items" value={JSON.stringify(itemsValidos)} />
      <input type="hidden" name="fotos" value={JSON.stringify(fotos)} />
      <input type="hidden" name="detalles" value={JSON.stringify(detallesValidos)} />

      <section className="tarjeta space-y-4 p-6">
        <h2 className="text-lg font-bold">1. Fotos</h2>
        <p className="text-sm text-stone-600">Hasta {MAX_FOTOS} fotos. La primera es la portada. Mostrá el material completo y el estado.</p>
        {fotos.length > 0 && (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
            {fotos.map((foto, i) => (
              <div key={foto} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={urlFoto(foto)} alt={`Foto ${i + 1}`} className="aspect-square w-full rounded-lg border border-stone-200 object-cover" />
                <button type="button" onClick={() => setFotos(fotos.filter((f) => f !== foto))} className="absolute right-1 top-1 rounded-full bg-white/90 px-2 text-sm shadow" aria-label="Quitar foto">
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
        {fotos.length < MAX_FOTOS && (
          <label className="btn-sec cursor-pointer">
            {subiendo ? "Subiendo..." : "Agregar fotos"}
            <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" disabled={subiendo} onChange={(e) => subirFotos(e.target.files)} />
          </label>
        )}
        {errorFotos && <p className="text-sm text-red-700">{errorFotos}</p>}

        {fotos.length > 0 && (
          <div className="rounded-lg border border-celeste/50 bg-celeste-claro p-4 text-petroleo">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold">¿Te completamos el resto con tus fotos?</p>
                <p className="text-sm text-petroleo/80">
                  La IA mira las fotos y completa título, categoría, estado, materiales, cantidades y peso. Vos revisás todo antes de enviarlo.
                </p>
              </div>
              <button type="button" onClick={completarConIA} disabled={analizando || subiendo} className="btn-celeste shrink-0">
                {analizando ? "Mirando las fotos..." : propuesta ? "Volver a completar" : "Completar con IA"}
              </button>
            </div>
            {analizando && (
              <p className="mt-3 text-sm">
                Mirando las fotos, revisándolas una segunda vez y controlando las cuentas. Tarda alrededor de un minuto.
              </p>
            )}
            {errorIA && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{errorIA}</p>}
          </div>
        )}
      </section>

      {propuesta && (
        <div ref={resumen} data-resumen-ia className="scroll-mt-24 rounded-xl border-2 border-celeste bg-white p-5">
          <p className="font-bold">Esto completamos con tus fotos</p>
          <p className="text-sm text-stone-600">Revisalo y cambiá lo que haga falta: vos decidís si lo enviás.</p>
          <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
            <dt className="text-stone-500">Título</dt>
            <dd className="font-medium">{propuesta.titulo}</dd>
            <dt className="text-stone-500">Categoría</dt>
            <dd>{propuesta.categoria}</dd>
            <dt className="text-stone-500">Estado</dt>
            <dd>{CONDICIONES[propuesta.condicion]}</dd>
            <dt className="text-stone-500">Materiales</dt>
            <dd>{propuesta.materiales.map((m) => `${m.nombre}: ${m.cantidad.toLocaleString("es-AR")} ${m.unidad === "m2" ? "m²" : m.unidad}`).join(" · ") || "—"}</dd>
            <dt className="text-stone-500">Peso</dt>
            <dd>{propuesta.peso_kg ? `${propuesta.peso_kg} kg aprox.` : "Sin estimar"}</dd>
          </dl>
          {propuesta.verificaciones.length > 0 && (
            <div className="mt-3 text-sm">
              <p className="font-semibold">Controles que hicimos</p>
              <ul className="mt-1 space-y-0.5 text-green-800">
                {propuesta.verificaciones.map((v) => (
                  <li key={v}>✓ {v}</li>
                ))}
              </ul>
            </div>
          )}
          {dudas.length > 0 ? (
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {dudas.length === 1 ? "Hay 1 dato" : `Hay ${dudas.length} datos`} que no pudimos ver bien: están marcados en amarillo abajo.
            </p>
          ) : (
            <p className="mt-3 text-sm text-green-800">✓ Todo revisado. Falta el precio y el retiro.</p>
          )}
        </div>
      )}


      <section className="tarjeta space-y-4 p-6">
        <h2 className="text-lg font-bold">2. Qué vendés</h2>
        <div>
          <label htmlFor="titulo" className="etiqueta">Título del lote</label>
          <input id="titulo" name="titulo" required minLength={5} maxLength={120} defaultValue={lote?.titulo ?? inicial?.titulo} className={`campo ${dudaDe("titulo") ? "border-amber-400 ring-2 ring-amber-200" : ""}`} placeholder="Ej.: Porcelanato 60x60 gris, 45 m² + pegamento" />
          <Duda duda={dudaDe("titulo")} alConfirmar={() => resolver("titulo")} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="categoria" className="etiqueta">Categoría</label>
            <select id="categoria" name="categoria" required defaultValue={lote?.categoria ?? ""} className={`campo ${dudaDe("categoria") ? "border-amber-400 ring-2 ring-amber-200" : ""}`}>
              <option value="" disabled>Elegí una categoría</option>
              {CATEGORIAS.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <Duda duda={dudaDe("categoria")} alConfirmar={() => resolver("categoria")} />
          </div>
          <div>
            <label htmlFor="condicion" className="etiqueta">Estado del material</label>
            <select id="condicion" name="condicion" value={condicion} onChange={(e) => setCondicion(e.target.value as Condicion)} className={`campo ${dudaDe("condicion") ? "border-amber-400 ring-2 ring-amber-200" : ""}`}>
              {Object.entries(CONDICIONES).map(([valor, texto]) => (
                <option key={valor} value={valor}>{texto}</option>
              ))}
            </select>
            <Duda duda={dudaDe("condicion")} alConfirmar={() => resolver("condicion")} />
          </div>
        </div>

        {opcionesDetalle.length > 0 && (
          <fieldset data-detalles>
            <legend className="etiqueta">Detalles a tener en cuenta (opcional)</legend>
            <p className="mb-2 text-sm text-stone-500">Marcá lo que corresponda: el comprador lo ve en el lote y ajusta el precio sugerido.</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {opcionesDetalle.map((d) => (
                <label key={d.id} className="flex items-start gap-2 rounded-lg border border-stone-200 px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={detallesValidos.includes(d.id)}
                    onChange={(e) => setDetalles((ds) => (e.target.checked ? [...ds, d.id] : ds.filter((x) => x !== d.id)))}
                    className="mt-0.5 size-4 accent-marca"
                  />
                  {d.texto}
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <div>
          <p className="etiqueta">Materiales incluidos</p>
          <div className={`space-y-2 ${dudaDe("materiales") ? "rounded-lg p-2 ring-2 ring-amber-200" : ""}`}>
            {items.map((item, i) => (
              <div key={i} className="grid grid-cols-[1fr_5rem_5rem_auto] gap-2">
                <input aria-label="Material" value={item.nombre} onChange={(e) => cambiarItem(i, { nombre: e.target.value })} className="campo" placeholder="Material" />
                <input aria-label="Cantidad" type="number" min={0} step="any" value={item.cantidad} onChange={(e) => cambiarItem(i, { cantidad: Number(e.target.value) })} className="campo" />
                <input aria-label="Unidad" value={item.unidad} onChange={(e) => cambiarItem(i, { unidad: e.target.value })} className="campo" placeholder="m², u, kg" />
                <button type="button" onClick={() => setItems(items.filter((_, j) => j !== i))} className="px-2 text-stone-400 hover:text-red-600" aria-label="Quitar material">
                  ✕
                </button>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => setItems([...items, { nombre: "", cantidad: 1, unidad: "u" }])} className="mt-2 text-sm font-semibold text-marca hover:underline">
            + Agregar material
          </button>
          <Duda duda={dudaDe("materiales")} alConfirmar={() => resolver("materiales")} />
        </div>

        <div>
          <label htmlFor="peso_kg" className="etiqueta">Peso aproximado del lote (kg)</label>
          <input id="peso_kg" name="peso_kg" type="number" min={1} step="any" defaultValue={lote?.peso_kg ?? ""} className={`campo max-w-48 ${dudaDe("peso") ? "border-amber-400 ring-2 ring-amber-200" : ""}`} placeholder="Ej.: 900" />
          <Duda duda={dudaDe("peso")} alConfirmar={() => resolver("peso")} />
          <p className="mt-1 text-sm text-stone-500">
            Con esto calculamos cuánto material salvaste de ir a residuos (y lo ves en tu constancia de impacto). Referencias:
            porcelanato o cerámico, unos 20 kg por m²; una bolsa de cemento, 50 kg; un inodoro, unos 25 kg; una placa de durlock,
            unos 20 kg; una bobina de 2 km de fibra óptica, unos 150 kg. Lo confirmamos al revisar el lote.
          </p>
        </div>

        <div>
          <label htmlFor="descripcion" className="etiqueta">Descripción (opcional)</label>
          <textarea id="descripcion" name="descripcion" rows={4} maxLength={3000} defaultValue={lote?.descripcion} className="campo" placeholder="Marca, modelo, por qué sobró, si está en su embalaje original..." />
        </div>
      </section>

      <section className="tarjeta space-y-4 p-6">
        <h2 className="text-lg font-bold">3. Precio</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="precio_lista" className="etiqueta">Precio de lista hoy (opcional)</label>
            <input id="precio_lista" name="precio_lista" type="number" min={1} value={precioLista} onChange={(e) => setPrecioLista(e.target.value)} className="campo" placeholder="Lo que cuesta nuevo" />
          </div>
          <div>
            <label htmlFor="precio_pedido" className="etiqueta">¿Cuánto querés recuperar?</label>
            <input ref={precioPedido} id="precio_pedido" name="precio_pedido" type="number" min={1} required defaultValue={precioInicial} className="campo" />
          </div>
        </div>
        {sugerido && (
          <p className="rounded-lg bg-stone-50 px-4 py-3 text-sm text-stone-700">
            Según el precio de lista que cargaste, sugerimos alrededor de <strong>{pesos(sugerido)}</strong>. Al revisarlo te confirmamos el precio de publicación.
          </p>
        )}
        <PrecioConIA datosDelLote={datosDelLote} alUsar={usarPrecioIA} />
        <p className="text-sm text-stone-500">Sobrá cobra 12% de comisión solo si se vende.</p>

        <div className="rounded-lg border border-stone-200 p-4">
          <label className="flex items-start gap-3">
            <input type="checkbox" checked={bajaActiva} onChange={(e) => setBajaActiva(e.target.checked)} className="mt-1 size-4 accent-marca" />
            <span>
              <span className="block font-medium">Bajar el precio solo si no se vende (opcional)</span>
              <span className="text-sm text-stone-500">
                Cada semana sin vender, el precio baja el porcentaje que elijas, hasta el mínimo que pongas. Los compradores que
                lo guardaron reciben un aviso en cada baja. El mínimo no se muestra a nadie.
              </span>
            </span>
          </label>
          {bajaActiva && (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="baja_semanal_pct" className="etiqueta">Cuánto baja por semana</label>
                <select id="baja_semanal_pct" name="baja_semanal_pct" defaultValue={lote?.baja_semanal_pct ?? 10} className="campo">
                  {[5, 10, 15].map((p) => (
                    <option key={p} value={p}>{p}% por semana</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="precio_minimo" className="etiqueta">Precio mínimo</label>
                <input id="precio_minimo" name="precio_minimo" type="number" min={1} required defaultValue={precioMinimo ?? ""} className="campo" placeholder="No baja de este precio" />
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="tarjeta space-y-4 p-6">
        <h2 className="text-lg font-bold">4. Retiro</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="zona" className="etiqueta">Zona</label>
            <select id="zona" name="zona" required defaultValue={lote?.zona ?? ""} className="campo">
              <option value="" disabled>Elegí una zona</option>
              {ZONAS.map((z) => (
                <option key={z}>{z}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="localidad" className="etiqueta">Localidad o barrio</label>
            <input id="localidad" name="localidad" defaultValue={lote?.localidad} className="campo" placeholder="Ej.: Lanús" />
          </div>
        </div>
        <p className="text-sm text-stone-500">Estos datos solo los ve el comprador después de pagar:</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="direccion" className="etiqueta">Dirección de retiro (obligatoria para publicar)</label>
            <input id="direccion" name="direccion" defaultValue={retiro?.direccion} className="campo" />
          </div>
          <div>
            <label htmlFor="horarios" className="etiqueta">Horarios</label>
            <input id="horarios" name="horarios" defaultValue={retiro?.horarios} className="campo" placeholder="Lun a vie de 8 a 17" />
          </div>
        </div>
        <div>
          <label htmlFor="indicaciones" className="etiqueta">Indicaciones (opcional)</label>
          <input id="indicaciones" name="indicaciones" defaultValue={retiro?.indicaciones} className="campo" placeholder="Ej.: hace falta camioneta, hay montacargas" />
        </div>
      </section>

      {fotos.length > 0 && (
        <section className="tarjeta space-y-3 p-6">
          <h2 className="text-lg font-bold">Así se va a ver</h2>
          <p className="text-sm text-stone-600">Se actualiza mientras editás. Antes de publicarlo lo revisa Sobrá.</p>
          <div inert className="pointer-events-none max-w-xs">
            <TarjetaLote lote={vistaPrevia} />
          </div>
        </section>
      )}

      {dudas.length > 0 && (
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Te {dudas.length === 1 ? "queda 1 dato" : `quedan ${dudas.length} datos`} por confirmar (marcados en amarillo). Podés enviarlo igual: vos decidís.
        </p>
      )}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <BotonEnviar name="intencion" value="borrador" className="btn-sec" disabled={subiendo || soloVista} pendiente="Guardando...">
          Guardar borrador
        </BotonEnviar>
        <BotonEnviar name="intencion" value="revision" className="btn" disabled={subiendo || soloVista}>
          Enviar a revisión
        </BotonEnviar>
      </div>
    </form>
  );
}

// Lo que la IA no pudo ver bien: una pregunta corta y un botón para confirmarlo.
// Si el vendedor cambia el campo, también queda revisado.
function Duda({ duda, alConfirmar }: { duda?: { pregunta: string }; alConfirmar: () => void }) {
  if (!duda) return null;
  return (
    <div data-duda className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
      <span className="flex-1">{duda.pregunta}</span>
      <button type="button" onClick={alConfirmar} className="rounded-md bg-white px-2.5 py-1 font-semibold ring-1 ring-amber-300 hover:bg-amber-100">
        Sí, es correcto
      </button>
    </div>
  );
}
