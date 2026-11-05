// Para los "volver a..." que llegan de afuera (?volver=, formularios): solo se
// aceptan direcciones internas de Sobrá. Así nadie puede armar un link de Sobrá
// que termine en otro sitio (por ejemplo, una copia falsa para robar contraseñas).
// Ojo con los trucos: "//otro.com", "/\otro.com" y "/<tab>/otro.com" los navegadores
// los toman como otro sitio; por eso, además de las reglas, se verifica con URL().
const BASE = "http://sobra.invalid";

export function rutaInterna(valor: unknown, porDefecto = "/panel"): string {
  if (typeof valor !== "string" || valor.length === 0 || valor.length > 2000) return porDefecto;
  // Tiene que empezar con una sola "/" y no puede tener barras invertidas, espacios ni caracteres de control.
  if (!valor.startsWith("/") || valor.startsWith("//") || /[\\\s\u0000-\u001f\u007f]/.test(valor)) return porDefecto;
  try {
    const url = new URL(valor, BASE);
    if (url.origin !== BASE) return porDefecto;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return porDefecto;
  }
}
