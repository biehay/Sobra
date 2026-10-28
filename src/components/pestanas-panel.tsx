import Link from "next/link";

const PESTANAS = [
  { id: "ventas", texto: "Mis ventas", ruta: "/panel/vendedor" },
  { id: "compras", texto: "Mis compras", ruta: "/panel/comprador" },
  { id: "datos", texto: "Mis datos", ruta: "/panel/perfil" },
] as const;

// Navegación del panel: con una sola cuenta se compra y se vende.
export function PestanasPanel({ activa }: { activa: (typeof PESTANAS)[number]["id"] }) {
  return (
    <nav aria-label="Secciones de mi panel" className="mb-8 flex gap-1 overflow-x-auto border-b border-stone-200">
      {PESTANAS.map((p) => (
        <Link
          key={p.id}
          href={p.ruta}
          aria-current={p.id === activa ? "page" : undefined}
          className={`-mb-px shrink-0 border-b-2 px-4 py-2.5 text-sm font-semibold ${
            p.id === activa ? "border-marca text-marca" : "border-transparent text-stone-500 hover:text-stone-800"
          }`}
        >
          {p.texto}
        </Link>
      ))}
    </nav>
  );
}
