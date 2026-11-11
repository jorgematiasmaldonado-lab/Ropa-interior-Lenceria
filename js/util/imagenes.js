/*
 * Procesamiento de imágenes subidas (logo, y más adelante fotos de productos).
 * Seguridad: solo se aceptan PNG, JPG y WEBP (no SVG, que puede contener código),
 * con tamaño máximo, y se vuelven a dibujar en un lienzo nuevo: así se descarta
 * cualquier dato extra que traiga el archivo original.
 */

const TIPOS_PERMITIDOS = ['image/png', 'image/jpeg', 'image/webp'];
const TAMANO_MAXIMO = 8 * 1024 * 1024; // 8 MB

/**
 * Valida y achica una imagen. Devuelve un "data URL" PNG o JPEG.
 * @param {File} archivo
 * @param {{lado?: number, formato?: 'image/png'|'image/jpeg', calidad?: number}} opciones
 */
export async function procesarImagen(archivo, { lado = 256, formato = 'image/png', calidad = 0.85 } = {}) {
  if (!archivo) throw new Error('No se eligió ningún archivo.');
  if (!TIPOS_PERMITIDOS.includes(archivo.type)) throw new Error('El archivo debe ser una imagen PNG, JPG o WEBP.');
  if (archivo.size > TAMANO_MAXIMO) throw new Error('La imagen es muy pesada (máximo 8 MB).');

  const imagen = await cargar(archivo);
  const escala = Math.min(1, lado / Math.max(imagen.width, imagen.height));
  const ancho = Math.max(1, Math.round(imagen.width * escala));
  const alto = Math.max(1, Math.round(imagen.height * escala));

  const lienzo = document.createElement('canvas');
  lienzo.width = ancho;
  lienzo.height = alto;
  const ctx = lienzo.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(imagen, 0, 0, ancho, alto);
  imagen.close?.();
  return lienzo.toDataURL(formato, calidad);
}

async function cargar(archivo) {
  if ('createImageBitmap' in window) {
    try { return await createImageBitmap(archivo); } catch { /* se intenta de otra forma */ }
  }
  const url = URL.createObjectURL(archivo);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } catch {
    throw new Error('No se pudo leer la imagen. Probá con otro archivo.');
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Solo acepta imágenes guardadas por la propia app (data URL de imagen). */
export function esImagenSegura(valor) {
  return typeof valor === 'string' && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(valor);
}
