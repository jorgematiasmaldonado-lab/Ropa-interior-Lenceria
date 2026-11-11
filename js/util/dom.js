/*
 * Ayudantes para crear elementos de la pantalla de forma SEGURA.
 * Regla de seguridad: los textos siempre se insertan con textContent,
 * nunca con innerHTML, para evitar inyección de código (XSS).
 */

/**
 * Crea un elemento HTML.
 * @param {string} etiqueta - ej.: 'div', 'button'
 * @param {object} [atributos] - atributos y eventos (onClick, onInput…)
 * @param {...(Node|string|number|null|false)} hijos - contenido (los textos se escapan solos)
 */
export function el(etiqueta, atributos = {}, ...hijos) {
  const nodo = document.createElement(etiqueta);
  for (const [clave, valor] of Object.entries(atributos || {})) {
    if (valor === null || valor === undefined || valor === false) continue;
    if (clave.startsWith('on') && typeof valor === 'function') {
      nodo.addEventListener(clave.slice(2).toLowerCase(), valor);
    } else if (clave === 'clase') {
      nodo.className = valor;
    } else {
      nodo.setAttribute(clave, valor === true ? '' : String(valor));
    }
  }
  agregarHijos(nodo, hijos);
  return nodo;
}

function agregarHijos(nodo, hijos) {
  for (const hijo of hijos.flat(Infinity)) {
    if (hijo === null || hijo === undefined || hijo === false) continue;
    nodo.append(hijo instanceof Node ? hijo : document.createTextNode(String(hijo)));
  }
}

/**
 * Crea un ícono SVG a partir de trazos (atributo "d").
 * Solo se usa con trazos fijos definidos en el código, nunca con datos de la usuaria.
 */
export function icono(...trazos) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of trazos) {
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}

/** Reemplaza todo el contenido de un contenedor. */
export function montar(contenedor, ...hijos) {
  contenedor.replaceChildren();
  agregarHijos(contenedor, hijos);
}

export const ICONOS = {
  bolsa: ['M6 7h12l-1 13H7L6 7Zm3 0a3 3 0 0 1 6 0'],
  billete: ['M4 6h16v12H4zM4 10h16M8 15h3'],
  caja: ['M4 7.5 12 4l8 3.5v9L12 20l-8-3.5v-9ZM4 7.5l8 3.5 8-3.5M12 11v9'],
  herramienta: ['M14.5 5.5a4 4 0 0 0-5 5L4 16l4 4 5.5-5.5a4 4 0 0 0 5-5l-2.5 2.5-2.5-.5-.5-2.5 2.5-2.5Z']
};
