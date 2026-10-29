import type { ReactNode } from "react";

export const EMAIL_CONTACTO = process.env.NEXT_PUBLIC_EMAIL_CONTACTO ?? "hola@sobra.com.ar";

// Compromisos con los usuarios: se definen antes de lanzar (en .env.local).
// Mientras estén vacíos, los textos muestran "[a definir]".
export const COMPROMISOS = {
  plazoDefectos: process.env.NEXT_PUBLIC_PLAZO_AVISO_DEFECTOS || "[plazo a definir]",
  plazoReembolso: process.env.NEXT_PUBLIC_PLAZO_REEMBOLSO || "[plazo a definir]",
  horarioSoporte: process.env.NEXT_PUBLIC_HORARIO_SOPORTE || "[horario a definir]",
};

// Datos del titular de Sobrá que exige la ley (se completan en .env.local).
export const TITULAR = {
  nombre: process.env.NEXT_PUBLIC_TITULAR_NOMBRE || "[nombre o razón social a completar]",
  cuit: process.env.NEXT_PUBLIC_TITULAR_CUIT || "[CUIT a completar]",
  domicilio: process.env.NEXT_PUBLIC_TITULAR_DOMICILIO || "[domicilio a completar]",
};

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
