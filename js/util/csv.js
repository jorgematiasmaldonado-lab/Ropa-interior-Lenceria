/*
 * Exportación a CSV (se abre con Excel o Google Sheets).
 * Usa punto y coma y números con coma decimal, como Excel en Argentina.
 */
import { descargar, marcaTiempo } from './archivos.js';

function celda(valor) {
  if (valor === null || valor === undefined) return '';
  let t = typeof valor === 'number' ? String(valor).replace('.', ',') : String(valor);
  // Evita que Excel interprete el texto como fórmula (seguridad)
  if (/^[=+\-@\t\r]/.test(t) && typeof valor !== 'number') t = `'${t}`;
  if (/[";\n\r]/.test(t)) t = `"${t.replace(/"/g, '""')}"`;
  return t;
}

/**
 * @param {Array<object>} filas
 * @param {Array<[string, string|function]>} columnas - [titulo, campo o función]
 */
export function aCSV(filas, columnas) {
  const encabezado = columnas.map(([titulo]) => celda(titulo)).join(';');
  const cuerpo = filas.map((f) => columnas.map(([, c]) => celda(typeof c === 'function' ? c(f) : f[c])).join(';'));
  return '﻿' + [encabezado, ...cuerpo].join('\r\n');
}

export function descargarCSV(nombreBase, filas, columnas) {
  const blob = new Blob([aCSV(filas, columnas)], { type: 'text/csv;charset=utf-8' });
  descargar(`${nombreBase}_${marcaTiempo()}.csv`, blob);
}
