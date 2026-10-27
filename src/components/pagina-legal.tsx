import type { ReactNode } from "react";

export const EMAIL_CONTACTO = process.env.NEXT_PUBLIC_EMAIL_CONTACTO ?? "hola@sobra.com.ar";

export function PaginaLegal({ titulo, actualizada, children }: { titulo: string; actualizada: string; children: ReactNode }) {
  return (
    <article className="contenedor max-w-3xl py-12">
      <h1 className="text-3xl font-bold">{titulo}</h1>
      <p className="mt-1 text-sm text-stone-500">Última actualización: {actualizada}</p>
      <div className="mt-8 space-y-4 text-stone-700 [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-stone-900 [&_li]:ml-5 [&_li]:list-disc [&_table]:w-full [&_table]:text-sm [&_td]:border-t [&_td]:border-stone-200 [&_td]:py-2 [&_td]:pr-3 [&_td]:align-top [&_th]:pb-2 [&_th]:pr-3 [&_th]:text-left [&_th]:font-semibold [&_ul]:space-y-1">
        {children}
      </div>
    </article>
  );
}
