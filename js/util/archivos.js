/*
 * Descargar y compartir archivos (respaldos, comprobantes, CSV).
 */

/** Descarga un archivo en el dispositivo. */
export function descargar(nombre, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.rel = 'noopener';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/** ¿Este dispositivo puede compartir archivos (WhatsApp, Drive, mail…)? */
export function puedeCompartir(archivo) {
  try {
    return !!(navigator.canShare && navigator.share && navigator.canShare({ files: [archivo] }));
  } catch {
    return false;
  }
}

/**
 * Abre el menú de compartir del dispositivo. Si no se puede, descarga el archivo.
 * Devuelve 'compartido' | 'descargado' | 'cancelado'.
 */
export async function compartirODescargar(nombre, blob, { titulo = '', texto = '' } = {}) {
  const archivo = new File([blob], nombre, { type: blob.type });
  if (puedeCompartir(archivo)) {
    try {
      await navigator.share({ files: [archivo], title: titulo || nombre, text: texto || undefined });
      return 'compartido';
    } catch (e) {
      if (e?.name === 'AbortError') return 'cancelado';
    }
  }
  descargar(nombre, blob);
  return 'descargado';
}

/** Marca de fecha y hora para nombres de archivo: 2026-11-11_1530 */
export function marcaTiempo(f = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${f.getFullYear()}-${p(f.getMonth() + 1)}-${p(f.getDate())}_${p(f.getHours())}${p(f.getMinutes())}`;
}

/** Lee un archivo de texto elegido por la usuaria. */
export function leerTexto(archivo) {
  return new Promise((resolver, rechazar) => {
    const lector = new FileReader();
    lector.onload = () => resolver(String(lector.result));
    lector.onerror = () => rechazar(new Error('No se pudo leer el archivo.'));
    lector.readAsText(archivo);
  });
}
