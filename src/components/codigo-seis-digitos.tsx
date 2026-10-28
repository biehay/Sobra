"use client";

import { useRef, useState } from "react";

// Seis casilleros para el código del email: avanza solo al escribir, vuelve con
// borrar, acepta pegar el código entero y envía el formulario al completarse.
export function CodigoSeisDigitos({ nombre = "codigo" }: { nombre?: string }) {
  const [digitos, setDigitos] = useState<string[]>(Array(6).fill(""));
  const casilleros = useRef<(HTMLInputElement | null)[]>([]);

  function completar(nuevos: string[], foco: number) {
    setDigitos(nuevos);
    casilleros.current[Math.min(foco, 5)]?.focus();
    if (nuevos.every(Boolean)) {
      // Espera a que React escriba el valor en el campo oculto antes de enviar.
      setTimeout(() => casilleros.current[0]?.form?.requestSubmit(), 0);
    }
  }

  function escribir(i: number, valor: string) {
    const numeros = valor.replace(/\D/g, "");
    if (!numeros) {
      const nuevos = [...digitos];
      nuevos[i] = "";
      setDigitos(nuevos);
      return;
    }
    // Si pegan o el celular autocompleta varios números, se reparten desde acá.
    const nuevos = [...digitos];
    numeros.slice(0, 6 - i).split("").forEach((n, j) => (nuevos[i + j] = n));
    completar(nuevos, i + numeros.length);
  }

  function tecla(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digitos[i] && i > 0) {
      const nuevos = [...digitos];
      nuevos[i - 1] = "";
      setDigitos(nuevos);
      casilleros.current[i - 1]?.focus();
      e.preventDefault();
    }
    if (e.key === "ArrowLeft" && i > 0) casilleros.current[i - 1]?.focus();
    if (e.key === "ArrowRight" && i < 5) casilleros.current[i + 1]?.focus();
  }

  return (
    <div>
      <input type="hidden" name={nombre} value={digitos.join("")} />
      <div className="flex justify-center gap-2" role="group" aria-label="Código de 6 dígitos">
        {digitos.map((d, i) => (
          <input
            key={i}
            ref={(el) => {
              casilleros.current[i] = el;
            }}
            value={d}
            onChange={(e) => escribir(i, e.target.value)}
            onKeyDown={(e) => tecla(i, e)}
            onFocus={(e) => e.target.select()}
            onPaste={(e) => {
              e.preventDefault();
              escribir(i, e.clipboardData.getData("text"));
            }}
            inputMode="numeric"
            autoComplete={i === 0 ? "one-time-code" : "off"}
            autoFocus={i === 0}
            maxLength={6}
            aria-label={`Dígito ${i + 1}`}
            className="h-14 w-11 rounded-lg border border-stone-300 bg-white text-center font-mono text-2xl font-bold outline-none focus:border-marca focus:ring-2 focus:ring-marca/20 sm:h-16 sm:w-13"
          />
        ))}
      </div>
    </div>
  );
}
