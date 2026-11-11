/*
 * Validación de datos ingresados.
 * Cada función devuelve el valor limpio o lanza un ErrorValidacion
 * con un mensaje claro para mostrar en pantalla.
 */

export class ErrorValidacion extends Error {
  constructor(campo, mensaje) {
    super(mensaje);
    this.campo = campo;
  }
}

/** Texto: quita espacios de más y controla largo. */
export function texto(campo, valor, { obligatorio = false, max = 80, etiqueta = 'Este campo' } = {}) {
  const limpio = String(valor ?? '').replace(/\s+/g, ' ').trim();
  if (obligatorio && !limpio) throw new ErrorValidacion(campo, `${etiqueta} es obligatorio.`);
  if (limpio.length > max) throw new ErrorValidacion(campo, `${etiqueta} no puede tener más de ${max} caracteres.`);
  return limpio;
}

/** Texto largo (notas): conserva saltos de línea. */
export function textoLargo(campo, valor, { max = 300, etiqueta = 'Este campo' } = {}) {
  const limpio = String(valor ?? '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  if (limpio.length > max) throw new ErrorValidacion(campo, `${etiqueta} no puede tener más de ${max} caracteres.`);
  return limpio;
}

/** WhatsApp argentino: deja solo números. Acepta vacío. */
export function whatsapp(campo, valor) {
  const numeros = String(valor ?? '').replace(/\D/g, '');
  if (!numeros) return '';
  if (numeros.length < 10 || numeros.length > 13) {
    throw new ErrorValidacion(campo, 'Ingresá el número con código de área, sin 0 ni 15. Ej.: 3541 123456');
  }
  return numeros;
}

/** Instagram: sin @, solo letras, números, punto y guion bajo. Acepta vacío. */
export function instagram(campo, valor) {
  const limpio = String(valor ?? '').trim().replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/\/.*$/, '');
  if (!limpio) return '';
  if (!/^[A-Za-z0-9._]{1,30}$/.test(limpio)) {
    throw new ErrorValidacion(campo, 'Usuario de Instagram no válido (solo letras, números, punto y guion bajo).');
  }
  return limpio;
}

/** CUIT/CUIL: 11 números con dígito verificador correcto. Acepta vacío. */
export function cuit(campo, valor) {
  const n = String(valor ?? '').replace(/\D/g, '');
  if (!n) return '';
  if (n.length !== 11) throw new ErrorValidacion(campo, 'El CUIT debe tener 11 números.');
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const suma = pesos.reduce((s, p, i) => s + p * Number(n[i]), 0);
  let dv = 11 - (suma % 11);
  if (dv === 11) dv = 0;
  if (dv === 10) dv = 9;
  if (dv !== Number(n[10])) throw new ErrorValidacion(campo, 'El CUIT no es válido. Revisá los números.');
  return `${n.slice(0, 2)}-${n.slice(2, 10)}-${n.slice(10)}`;
}

/** Número entero dentro de un rango. */
export function entero(campo, valor, { min = 0, max = Number.MAX_SAFE_INTEGER, etiqueta = 'El valor' } = {}) {
  const n = Number(valor);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new ErrorValidacion(campo, `${etiqueta} debe ser un número entre ${min} y ${max}.`);
  }
  return n;
}
