"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { crearClienteNavegador } from "@/lib/supabase/client";

// Pantallas de la verificación en dos pasos con una app autenticadora
// (Google Authenticator, Microsoft Authenticator, 1Password, etc.).
// Hablan directo con Supabase desde el navegador: el secreto y el código nunca
// pasan por el servidor de la app.

function rutaSegura(volver: string) {
  return volver.startsWith("/") && !volver.startsWith("//") ? volver : "/panel";
}

function CampoCodigo({ codigo, setCodigo }: { codigo: string; setCodigo: (c: string) => void }) {
  return (
    <div>
      <label htmlFor="codigo" className="etiqueta">Código de 6 dígitos</label>
      <input
        id="codigo"
        value={codigo}
        onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))}
        required
        autoFocus
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder="123456"
        className="campo text-center font-mono text-2xl tracking-[0.4em]"
      />
    </div>
  );
}

export function Activar({ volver }: { volver: string }) {
  const router = useRouter();
  const [factor, setFactor] = useState<{ id: string; qr: string; secreto: string } | null>(null);
  const [codigo, setCodigo] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  async function generar() {
    setCargando(true);
    setError("");
    const supabase = crearClienteNavegador();
    // Borra intentos anteriores que quedaron sin terminar.
    const { data: factores } = await supabase.auth.mfa.listFactors();
    for (const f of factores?.all ?? []) {
      if (f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: `Sobrá ${new Date().toISOString()}`,
    });
    setCargando(false);
    if (error) return setError(`No pudimos generar el código QR: ${error.message}`);
    setFactor({ id: data.id, qr: data.totp.qr_code, secreto: data.totp.secret });
  }

  async function confirmar(e: React.FormEvent) {
    e.preventDefault();
    if (!factor) return;
    setCargando(true);
    setError("");
    const { error } = await crearClienteNavegador().auth.mfa.challengeAndVerify({ factorId: factor.id, code: codigo });
    if (error) {
      setCargando(false);
      setCodigo("");
      return setError("El código no es correcto. Fijate que la hora del celular esté bien y probá con el siguiente.");
    }
    router.replace(rutaSegura(volver));
    router.refresh();
  }

  if (!factor) {
    return (
      <div className="tarjeta space-y-4 p-6">
        <ol className="list-decimal space-y-2 pl-5 text-sm text-stone-700">
          <li>Instalá en tu celular una app autenticadora, por ejemplo <strong>Google Authenticator</strong>.</li>
          <li>Generá el código QR y escanealo con la app.</li>
          <li>Escribí el código de 6 dígitos que te muestra la app.</li>
        </ol>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <button onClick={generar} disabled={cargando} className="btn w-full">
          {cargando ? "Generando..." : "Generar código QR"}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={confirmar} className="tarjeta space-y-4 p-6">
      <p className="text-sm text-stone-700">Escaneá este código con la app autenticadora:</p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={factor.qr} alt="Código QR para la app autenticadora" className="mx-auto h-52 w-52 rounded-lg border border-stone-200 bg-white p-2" />
      <details className="text-sm text-stone-600">
        <summary className="cursor-pointer">¿No podés escanearlo? Cargá esta clave a mano</summary>
        <code className="mt-2 block break-all rounded bg-stone-100 p-2 font-mono text-xs">{factor.secreto}</code>
      </details>
      <CampoCodigo codigo={codigo} setCodigo={setCodigo} />
      {error && <p className="text-sm text-red-700">{error}</p>}
      <button disabled={cargando || codigo.length !== 6} className="btn w-full">
        {cargando ? "Verificando..." : "Activar"}
      </button>
    </form>
  );
}

export function Verificar({ volver }: { volver: string }) {
  const router = useRouter();
  const [codigo, setCodigo] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  async function confirmar(e: React.FormEvent) {
    e.preventDefault();
    setCargando(true);
    setError("");
    const supabase = crearClienteNavegador();
    const { data: factores } = await supabase.auth.mfa.listFactors();
    const factor = factores?.totp[0];
    if (!factor) {
      setCargando(false);
      return setError("No encontramos tu app autenticadora. Escribinos para recuperar el acceso.");
    }
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: codigo });
    if (error) {
      setCargando(false);
      setCodigo("");
      return setError("El código no es correcto o ya venció. Probá con el que muestra ahora la app.");
    }
    router.replace(rutaSegura(volver));
    router.refresh();
  }

  return (
    <form onSubmit={confirmar} className="tarjeta space-y-4 p-6">
      <CampoCodigo codigo={codigo} setCodigo={setCodigo} />
      {error && <p className="text-sm text-red-700">{error}</p>}
      <button disabled={cargando || codigo.length !== 6} className="btn w-full">
        {cargando ? "Verificando..." : "Continuar"}
      </button>
    </form>
  );
}

export function Desactivar() {
  const router = useRouter();
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  async function desactivar() {
    if (!confirm("¿Seguro que querés desactivar la verificación en dos pasos? Tu cuenta va a quedar protegida solo por la contraseña.")) return;
    setCargando(true);
    const supabase = crearClienteNavegador();
    const { data: factores } = await supabase.auth.mfa.listFactors();
    for (const f of factores?.all ?? []) {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: f.id });
      if (error) {
        setCargando(false);
        return setError(error.message);
      }
    }
    // La sesión sigue en aal2 hasta renovarse; se refresca para bajarla a aal1.
    await supabase.auth.refreshSession();
    router.refresh();
  }

  return (
    <div>
      <button onClick={desactivar} disabled={cargando} className="btn-peligro w-full">
        {cargando ? "Desactivando..." : "Desactivar verificación en dos pasos"}
      </button>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
