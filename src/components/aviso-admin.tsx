// Para la cuenta admin: ve todas las secciones (para revisar cómo quedan), con
// un aviso de lo que no puede hacer.
export function AvisoAdmin({ children }: { children: React.ReactNode }) {
  return (
    <p data-aviso-admin className="mb-6 rounded-lg border border-stone-200 bg-stone-100 px-4 py-3 text-sm text-stone-700">
      <strong>Estás con la cuenta admin.</strong> {children}
    </p>
  );
}
