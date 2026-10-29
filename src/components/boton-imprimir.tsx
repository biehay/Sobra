"use client";

// Abre el diálogo de impresión: desde ahí se guarda como PDF.
export function BotonImprimir({ children }: { children: React.ReactNode }) {
  return (
    <button type="button" onClick={() => window.print()} className="btn print:hidden">
      {children}
    </button>
  );
}
