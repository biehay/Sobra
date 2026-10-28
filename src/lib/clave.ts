// Reglas de la contraseña: mínimo 8 caracteres, con letras, números y algún
// signo (cualquier carácter que no sea letra, número ni espacio: ! @ # $ % & * - _ . ? etc.).
export const REGLAS_CLAVE = [
  { id: "largo", texto: "Al menos 8 caracteres", cumple: (c: string) => c.length >= 8 },
  { id: "letra", texto: "Una letra", cumple: (c: string) => /\p{L}/u.test(c) },
  { id: "numero", texto: "Un número", cumple: (c: string) => /\d/.test(c) },
  { id: "signo", texto: "Un signo, por ejemplo ! @ # $ % & * - _ .", cumple: (c: string) => /[^\p{L}\d\s]/u.test(c) },
] as const;

// Devuelve el texto de la primera regla que no se cumple, o null si la contraseña es válida.
export function problemaClave(clave: string): string | null {
  const falta = REGLAS_CLAVE.find((regla) => !regla.cumple(clave));
  if (!falta) return null;
  return falta.id === "largo"
    ? "La contraseña debe tener al menos 8 caracteres"
    : `A la contraseña le falta: ${falta.texto.toLowerCase()}`;
}
