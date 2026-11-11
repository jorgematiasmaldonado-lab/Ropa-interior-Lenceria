/*
 * Cotización del dólar (opcional, solo con internet).
 * Fuente pública: dolarapi.com. No se envía ningún dato del negocio.
 */
export async function obtenerCotizacion(tipo = 'oficial') {
  if (!navigator.onLine) throw new Error('Sin conexión: cargá la cotización a mano.');
  if (!['oficial', 'blue'].includes(tipo)) throw new Error('Tipo de cotización no válido.');
  const control = new AbortController();
  const espera = setTimeout(() => control.abort(), 7000);
  try {
    const r = await fetch(`https://dolarapi.com/v1/dolares/${tipo}`, { signal: control.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!r.ok) throw new Error();
    const datos = await r.json();
    const venta = Number(datos?.venta);
    if (!(venta > 0 && venta < 1e7)) throw new Error();
    return venta;
  } catch {
    throw new Error('No se pudo obtener la cotización. Cargala a mano.');
  } finally {
    clearTimeout(espera);
  }
}
