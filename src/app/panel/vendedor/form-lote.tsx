"use client";

import { useState } from "react";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { CATEGORIAS, CONDICIONES, ZONAS, pesos, precioSugerido, urlFoto, type Condicion, type Item, type Lote } from "@/lib/datos";
import { BotonEnviar } from "@/components/boton-enviar";
import { guardarLote } from "../acciones";

type Retiro = { direccion: string; horarios: string; indicaciones: string };

const MAX_FOTOS = 10;
const MAX_BYTES = 5 * 1024 * 1024;

export function FormLote({ usuarioId, lote, retiro }: { usuarioId: string; lote?: Lote; retiro?: Retiro | null }) {
  const [items, setItems] = useState<Item[]>(lote?.items.length ? lote.items : [{ nombre: "", cantidad: 1, unidad: "u" }]);
  const [fotos, setFotos] = useState<string[]>(lote?.fotos ?? []);
  const [subiendo, setSubiendo] = useState(false);
  const [errorFotos, setErrorFotos] = useState("");
  const [precioLista, setPrecioLista] = useState(lote?.precio_lista?.toString() ?? "");
  const [condicion, setCondicion] = useState<Condicion>(lote?.condicion ?? "nuevo");
  const sugerido = precioSugerido(Number(precioLista) || null, condicion);

  async function subirFotos(archivos: FileList | null) {
    if (!archivos?.length) return;
    setErrorFotos("");
    const lista = Array.from(archivos).slice(0, MAX_FOTOS - fotos.length);
    if (lista.some((a) => a.size > MAX_BYTES)) {
      setErrorFotos("Cada foto puede pesar hasta 5 MB.");
      return;
    }
    setSubiendo(true);
    const supabase = crearClienteNavegador();
    const nuevas: string[] = [];
    for (const archivo of lista) {
      const extension = archivo.name.split(".").pop()?.toLowerCase() || "jpg";
      const ruta = `${usuarioId}/${crypto.randomUUID()}.${extension}`;
      const { error } = await supabase.storage.from("lotes").upload(ruta, archivo, { contentType: archivo.type });
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
    setItems((actuales) => actuales.map((item, j) => (j === i ? { ...item, ...cambio } : item)));
  }

  const itemsValidos = items.filter((item) => item.nombre.trim() && item.cantidad > 0);

  return (
    <form action={guardarLote} className="space-y-6">
      {lote && <input type="hidden" name="id" value={lote.id} />}
      <input type="hidden" name="items" value={JSON.stringify(itemsValidos)} />
      <input type="hidden" name="fotos" value={JSON.stringify(fotos)} />

      <section className="tarjeta space-y-4 p-6">
        <h2 className="text-lg font-bold">1. Qué vendés</h2>
        <div>
          <label htmlFor="titulo" className="etiqueta">Título del lote</label>
          <input id="titulo" name="titulo" required minLength={5} maxLength={120} defaultValue={lote?.titulo} className="campo" placeholder="Ej.: Porcelanato 60x60 gris, 45 m² + pegamento" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="categoria" className="etiqueta">Categoría</label>
            <select id="categoria" name="categoria" required defaultValue={lote?.categoria ?? ""} className="campo">
              <option value="" disabled>Elegí una categoría</option>
              {CATEGORIAS.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="condicion" className="etiqueta">Estado del material</label>
            <select id="condicion" name="condicion" value={condicion} onChange={(e) => setCondicion(e.target.value as Condicion)} className="campo">
              {Object.entries(CONDICIONES).map(([valor, texto]) => (
                <option key={valor} value={valor}>{texto}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <p className="etiqueta">Materiales incluidos</p>
          <div className="space-y-2">
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
        </div>

        <div>
          <label htmlFor="descripcion" className="etiqueta">Descripción (opcional)</label>
          <textarea id="descripcion" name="descripcion" rows={4} maxLength={3000} defaultValue={lote?.descripcion} className="campo" placeholder="Marca, modelo, por qué sobró, si está en su embalaje original..." />
        </div>
      </section>

      <section className="tarjeta space-y-4 p-6">
        <h2 className="text-lg font-bold">2. Fotos</h2>
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
            <input id="precio_pedido" name="precio_pedido" type="number" min={1} required defaultValue={lote?.precio_pedido} className="campo" />
          </div>
        </div>
        {sugerido && (
          <p className="rounded-lg bg-marca-claro px-4 py-3 text-sm text-marca-oscuro">
            Para que se venda rápido sugerimos alrededor de <strong>{pesos(sugerido)}</strong>. Al revisarlo te confirmamos el precio de publicación.
          </p>
        )}
        <p className="text-sm text-stone-500">Sobrá cobra 12% de comisión solo si se vende.</p>
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
            <label htmlFor="direccion" className="etiqueta">Dirección de retiro</label>
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

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <BotonEnviar name="intencion" value="borrador" className="btn-sec" disabled={subiendo} pendiente="Guardando...">
          Guardar borrador
        </BotonEnviar>
        <BotonEnviar name="intencion" value="revision" className="btn" disabled={subiendo}>
          Enviar a revisión
        </BotonEnviar>
      </div>
    </form>
  );
}
