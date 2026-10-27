"use client";

import Link from "next/link";

export default function ErrorPagina({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="contenedor max-w-lg py-24 text-center">
      <h1 className="text-3xl font-bold">Algo salió mal</h1>
      <p className="mt-2 text-stone-600">Probá de nuevo en unos segundos. Si sigue pasando, escribinos.</p>
      <div className="mt-6 flex justify-center gap-3">
        <button onClick={reset} className="btn">Reintentar</button>
        <Link href="/" className="btn-sec">Ir al inicio</Link>
      </div>
    </div>
  );
}
