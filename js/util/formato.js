/*
 * Formatos argentinos: $ 12.345,67 y DD/MM/AAAA.
 */

const formatoPesos = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const formatoDolares = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'USD',
  currencyDisplay: 'code',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

/** 12345.67 → "$ 12.345,67" */
export function pesos(valor) {
  return formatoPesos.format(Number(valor) || 0).replace(/ /g, ' ');
}

/** 100 → "USD 100,00" */
export function dolares(valor) {
  return formatoDolares.format(Number(valor) || 0).replace(/ /g, ' ');
}

/** Fecha → "11/11/2026" */
export function fecha(valor) {
  const f = valor instanceof Date ? valor : new Date(valor);
  const dd = String(f.getDate()).padStart(2, '0');
  const mm = String(f.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${f.getFullYear()}`;
}

/** Fecha y hora → "11/11/2026 15:30" */
export function fechaHora(valor) {
  const f = valor instanceof Date ? valor : new Date(valor);
  const hh = String(f.getHours()).padStart(2, '0');
  const mi = String(f.getMinutes()).padStart(2, '0');
  return `${fecha(f)} ${hh}:${mi}`;
}

/** Inicio del día, semana (lunes) o mes, en hora local. */
export function inicioPeriodo(periodo, referencia = new Date()) {
  const f = new Date(referencia);
  f.setHours(0, 0, 0, 0);
  if (periodo === 'semana') {
    const dia = (f.getDay() + 6) % 7; // lunes = 0
    f.setDate(f.getDate() - dia);
  } else if (periodo === 'mes') {
    f.setDate(1);
  }
  return f;
}

/** Redondea a centavos. */
export function redondear(valor) {
  return Math.round((Number(valor) || 0) * 100) / 100;
}

/**
 * Convierte lo que escribe la usuaria en número.
 * Acepta "12000", "12.000", "12.000,50", "12000,5", "$ 12.000".
 * Devuelve NaN si no es un número.
 */
export function leerNumero(texto) {
  let t = String(texto ?? '').replace(/[$\s]/g, '').replace(/^USD/i, '');
  if (!t) return NaN;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
}

/** Número sin símbolo: 12345.5 → "12.345,50" (para mostrar dentro de campos). */
export function numeroTexto(valor, decimales = 2) {
  return new Intl.NumberFormat('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: decimales }).format(Number(valor) || 0);
}

/** Fecha para un <input type="date">: "2026-11-11" (hora local). */
export function fechaParaInput(valor = new Date()) {
  const f = valor instanceof Date ? valor : new Date(valor);
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
}

/** De "2026-11-11" a fecha ISO. Si es hoy, usa la hora actual; si no, el mediodía. */
export function fechaDesdeInput(texto) {
  const [a, m, d] = String(texto || '').split('-').map(Number);
  if (!a || !m || !d) return new Date().toISOString();
  const hoy = new Date();
  if (a === hoy.getFullYear() && m === hoy.getMonth() + 1 && d === hoy.getDate()) return hoy.toISOString();
  return new Date(a, m - 1, d, 12, 0, 0).toISOString();
}

/** Texto para buscar sin tildes ni mayúsculas. */
export function normalizar(texto) {
  return String(texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}
