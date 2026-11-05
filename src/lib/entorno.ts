// Modos de prueba (para el recorrido y para desarrollar sin gastar la API ni mandar
// emails). En la app publicada en Vercel NUNCA se activan, aunque alguien deje la
// variable configurada por error: ahí la IA moderaría de mentira y los códigos de
// acceso quedarían escritos en los registros del servidor.
const enProduccionPublicada = () => process.env.VERCEL_ENV === "production";

export const iaDePrueba = () => process.env.SOBRA_IA_DE_PRUEBA === "1" && !enProduccionPublicada();

export const codigosEnConsola = () =>
  !enProduccionPublicada() && (process.env.NODE_ENV === "development" || process.env.SOBRA_CODIGOS_EN_CONSOLA === "1");
