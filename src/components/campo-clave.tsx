"use client";

import { useState } from "react";
import { REGLAS_CLAVE } from "@/lib/clave";

// Campo de contraseña nueva con la lista de requisitos, que se van tildando
// mientras se escribe. El servidor vuelve a validar las mismas reglas.
export function CampoClave({ id = "password", etiqueta = "Contraseña" }: { id?: string; etiqueta?: string }) {
  const [clave, setClave] = useState("");
  const [visible, setVisible] = useState(false);

  return (
    <div>
      <label htmlFor={id} className="etiqueta">{etiqueta}</label>
      <div className="relative">
        <input
          id={id}
          name={id}
          type={visible ? "text" : "password"}
          value={clave}
          onChange={(e) => setClave(e.target.value)}
          minLength={8}
          required
          autoComplete="new-password"
          aria-describedby={`${id}-reglas`}
          className="campo pr-16"
        />
        <button
          type="button"
          onClick={() => setVisible(!visible)}
          className="absolute inset-y-0 right-0 px-3 text-xs font-semibold text-stone-500 hover:text-stone-800"
        >
          {visible ? "Ocultar" : "Ver"}
        </button>
      </div>
      <ul id={`${id}-reglas`} className="mt-2 grid gap-1 text-xs">
        {REGLAS_CLAVE.map((regla) => {
          const ok = regla.cumple(clave);
          return (
            <li key={regla.id} className={ok ? "text-green-700" : "text-stone-500"}>
              <span aria-hidden>{ok ? "✓" : "○"}</span> {regla.texto}
              <span className="sr-only">{ok ? " (cumplido)" : " (falta)"}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
