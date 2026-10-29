import { desdeCuando, porcentaje, sellosComprador, sellosVendedor, tiempo, type Reputacion } from "@/lib/reputacion";

// Reputación de un usuario como vendedor o como comprador, con sus sellos.
// `compacta`: una línea, para listas (por ejemplo, las ofertas recibidas).
export function TarjetaReputacion({ r, como, compacta = false }: { r: Reputacion; como: "vendedor" | "comprador"; compacta?: boolean }) {
  const total = como === "vendedor" ? r.ventas : r.compras;
  const ok = como === "vendedor" ? r.ventasOk : r.comprasOk;
  const sellos = como === "vendedor" ? sellosVendedor(r) : sellosComprador(r);
  const nuevo = total < 3;

  if (compacta) {
    return (
      <span className="inline-flex flex-wrap items-center gap-1.5 text-xs">
        {nuevo ? (
          <span className="rounded-full bg-stone-100 px-2 py-0.5 font-semibold text-stone-600">
            Nuevo en Sobrá{total ? ` · ${total} ${como === "vendedor" ? "ventas" : "compras"}` : ""}
          </span>
        ) : (
          <span className="rounded-full bg-stone-100 px-2 py-0.5 font-semibold text-stone-700">
            {total} {como === "vendedor" ? "ventas" : "compras"} · {porcentaje(ok, total)} {como === "vendedor" ? "sin reclamos" : "retiradas"}
          </span>
        )}
        {sellos.map((s) => (
          <span key={s.texto} title={s.detalle} className="rounded-full bg-celeste-claro px-2 py-0.5 font-semibold text-celeste-oscuro">
            ✓ {s.texto}
          </span>
        ))}
      </span>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <Dato valor={String(total)} texto={como === "vendedor" ? "ventas completadas" : "compras completadas"} />
        {!nuevo && <Dato valor={porcentaje(ok, total)} texto={como === "vendedor" ? "sin reclamos por el material" : "retiradas a tiempo"} />}
        {como === "vendedor" && r.horasRespuesta != null && <Dato valor={tiempo(r.horasRespuesta)} texto="para responder ofertas" />}
      </div>
      {sellos.length > 0 ? (
        <ul className="space-y-1.5">
          {sellos.map((s) => (
            <li key={s.texto} className="flex items-start gap-2 text-sm">
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-celeste text-xs font-bold text-petroleo">✓</span>
              <span>
                <strong>{s.texto}</strong> <span className="text-stone-500">· {s.detalle}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : nuevo ? (
        <p className="text-sm text-stone-500">Nuevo en Sobrá: todavía tiene pocas operaciones para mostrar porcentajes.</p>
      ) : null}
      {r.desde && <p className="text-xs text-stone-500">En Sobrá desde {desdeCuando(r.desde)}</p>}
    </div>
  );
}

function Dato({ valor, texto }: { valor: string; texto: string }) {
  return (
    <p>
      <span className="block text-lg font-bold text-petroleo">{valor}</span>
      <span className="text-stone-500">{texto}</span>
    </p>
  );
}
