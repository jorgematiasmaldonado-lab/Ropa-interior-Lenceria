/*
 * Enlaces de WhatsApp con mensaje prearmado.
 */

/** Número argentino guardado (ej.: 3541123456) → formato internacional 5493541123456 */
export function numeroInternacional(numero) {
  const n = String(numero || '').replace(/\D/g, '');
  if (!n) return '';
  if (n.startsWith('54')) return n.startsWith('549') ? n : `549${n.slice(2)}`;
  return `549${n}`;
}

/** Arma el enlace wa.me. Si no hay número, WhatsApp deja elegir el contacto. */
export function enlaceWhatsApp(numero, mensaje) {
  const destino = numeroInternacional(numero);
  return `https://wa.me/${destino}?text=${encodeURIComponent(mensaje)}`;
}

export function abrirWhatsApp(numero, mensaje) {
  window.open(enlaceWhatsApp(numero, mensaje), '_blank', 'noopener,noreferrer');
}
