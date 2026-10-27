import Link from "next/link";

export default function NoEncontrado() {
  return (
    <div className="contenedor max-w-lg py-24 text-center">
      <p className="text-sm font-semibold text-marca">404</p>
      <h1 className="mt-2 text-3xl font-bold">No encontramos esta página</h1>
      <p className="mt-2 text-stone-600">Puede que el lote ya no esté publicado o que el link esté mal.</p>
      <Link href="/lotes" className="btn mt-6">Ver lotes disponibles</Link>
    </div>
  );
}
