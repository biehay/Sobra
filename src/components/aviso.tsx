// Mensaje de resultado que llega por la URL (?ok=... o ?error=...) después de una acción.
export function Aviso({ ok, error }: { ok?: string | string[]; error?: string | string[] }) {
  if (typeof error === "string") {
    return <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>;
  }
  if (typeof ok === "string") {
    return <p className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">{ok}</p>;
  }
  return null;
}
