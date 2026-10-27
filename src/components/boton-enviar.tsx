"use client";

import type { ComponentProps } from "react";
import { useFormStatus } from "react-dom";

// Botón de envío que se deshabilita mientras el formulario se procesa,
// para evitar ofertas o lotes duplicados por doble clic. Con `confirmar`,
// pide confirmación antes de una acción que no se puede deshacer.
export function BotonEnviar({
  children,
  pendiente = "Enviando...",
  confirmar,
  disabled,
  onClick,
  ...props
}: ComponentProps<"button"> & { pendiente?: string; confirmar?: string }) {
  const { pending, data } = useFormStatus();
  // Con varios botones en el mismo form, solo el que se apretó muestra el texto de espera.
  const esEste = pending && (!props.name || data?.get(props.name) === props.value);
  return (
    <button
      {...props}
      disabled={pending || disabled}
      aria-busy={esEste}
      onClick={(e) => {
        if (confirmar && !window.confirm(confirmar)) {
          e.preventDefault();
          return;
        }
        onClick?.(e);
      }}
    >
      {esEste ? pendiente : children}
    </button>
  );
}
