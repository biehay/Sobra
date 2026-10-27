// Redibuja la foto en un canvas antes de subirla. Así se pierden los metadatos
// EXIF, incluidas las coordenadas GPS que guardan los celulares (que revelarían
// la ubicación del depósito antes del pago), y de paso se achica el archivo.
const LADO_MAXIMO = 2000;
const CALIDAD = 0.85;

export function medidasReducidas(ancho: number, alto: number, maximo = LADO_MAXIMO) {
  const escala = Math.min(1, maximo / Math.max(ancho, alto));
  return { ancho: Math.round(ancho * escala), alto: Math.round(alto * escala) };
}

export async function limpiarFoto(archivo: File): Promise<Blob> {
  // "from-image" respeta la rotación del celular antes de descartar el EXIF.
  const imagen = await createImageBitmap(archivo, { imageOrientation: "from-image" });
  const { ancho, alto } = medidasReducidas(imagen.width, imagen.height);
  const canvas = document.createElement("canvas");
  canvas.width = ancho;
  canvas.height = alto;
  canvas.getContext("2d")!.drawImage(imagen, 0, 0, ancho, alto);
  imagen.close();

  return new Promise((resolver, rechazar) =>
    canvas.toBlob((blob) => (blob ? resolver(blob) : rechazar(new Error("No se pudo procesar la foto"))), "image/jpeg", CALIDAD),
  );
}
