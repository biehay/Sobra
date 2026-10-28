"use client";

import { useState } from "react";
import { cuitValido, formatearCuit } from "@/lib/datos";

// Campo de CUIT que pone los guiones mientras se escribe y avisa si el
// dígito verificador no coincide. El servidor lo vuelve a validar.
export function CampoCuit({ defaultValue = "" }: { defaultValue?: string }) {
  const [cuit, setCuit] = useState(formatearCuit(defaultValue));
  const completo = cuit.replace(/\D/g, "").length === 11;
  const invalido = completo && !cuitValido(cuit);

  return (
    <div>
      <label htmlFor="cuit" className="etiqueta">CUIT (opcional)</label>
      <input
        id="cuit"
        name="cuit"
        value={cuit}
        onChange={(e) => setCuit(formatearCuit(e.target.value))}
        inputMode="numeric"
        autoComplete="off"
        maxLength={13}
        placeholder="30-12345678-9"
        aria-invalid={invalido}
        aria-describedby={invalido ? "cuit-error" : undefined}
        className={`campo ${invalido ? "border-red-400 focus:border-red-500 focus:ring-red-200" : ""}`}
      />
      {invalido && (
        <p id="cuit-error" className="mt-1 text-xs text-red-700">
          Revisá el CUIT: el último número no coincide.
        </p>
      )}
    </div>
  );
}
