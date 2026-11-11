/*
 * Campos de formulario reutilizables (con etiqueta, ayuda y error).
 */
import { el } from './dom.js';

let contador = 0;

/**
 * @param {object} o
 * @param {string} o.etiqueta
 * @param {'text'|'tel'|'date'|'number'|'dinero'|'textarea'|'select'} [o.tipo]
 * @param {any} [o.valor]
 * @param {Array<[string,string]>|string[]} [o.opciones] - para select
 */
export function campo({ etiqueta, tipo = 'text', valor = '', opciones = [], ayuda = '', max = 80, obligatorio = false, placeholder = '', prefijo = '', alCambiar = null, vacio = null }) {
  const id = `c${++contador}`;
  const idError = `${id}-e`;
  const comunes = { id, 'aria-describedby': idError, required: obligatorio, placeholder: placeholder || null };
  let entrada;
  if (tipo === 'textarea') {
    entrada = el('textarea', { ...comunes, maxlength: max });
  } else if (tipo === 'select') {
    entrada = el('select', comunes,
      vacio !== null ? el('option', { value: '' }, vacio) : null,
      opciones.map((o) => {
        const [v, t] = Array.isArray(o) ? o : [o, o];
        return el('option', { value: v }, t);
      }));
  } else if (tipo === 'dinero') {
    entrada = el('input', { ...comunes, type: 'text', inputmode: 'decimal', maxlength: 16, autocomplete: 'off' });
  } else if (tipo === 'entero') {
    entrada = el('input', { ...comunes, type: 'text', inputmode: 'numeric', maxlength: 6, autocomplete: 'off' });
  } else {
    entrada = el('input', { ...comunes, type: tipo, maxlength: tipo === 'date' ? null : max, autocomplete: 'off' });
  }
  // En las listas desplegables, un valor vacío dejaría sin opción elegida: se respeta la primera.
  if (valor !== null && valor !== undefined && !(tipo === 'select' && valor === '')) entrada.value = valor;
  if (alCambiar) entrada.addEventListener(tipo === 'select' || tipo === 'date' ? 'change' : 'input', alCambiar);

  const error = el('span', { clase: 'campo__error', id: idError, role: 'alert' });
  const nodo = el('div', { clase: 'campo' },
    el('label', { for: id, clase: 'campo__etiqueta' }, etiqueta, obligatorio ? ' *' : ''),
    prefijo ? el('div', { clase: 'prefijo' }, el('span', { clase: 'prefijo__texto' }, prefijo), entrada) : entrada,
    ayuda ? el('span', { clase: 'campo__ayuda' }, ayuda) : null,
    error
  );
  return {
    nodo,
    entrada,
    get valor() { return entrada.value; },
    set valor(v) { entrada.value = v ?? ''; },
    error(mensaje) {
      error.textContent = mensaje;
      entrada.setAttribute('aria-invalid', 'true');
      entrada.focus();
    },
    limpiar() { error.textContent = ''; entrada.removeAttribute('aria-invalid'); }
  };
}

/** Limpia los errores de varios campos. */
export function limpiarTodos(campos) {
  Object.values(campos).forEach((c) => c?.limpiar?.());
}

/** Botón "Volver". */
export function volver(href) {
  return el('p', { clase: 'volver' }, el('a', { href, clase: 'boton boton--secundario boton--chico' }, '‹ Volver'));
}

/** Pestañas superiores simples (enlaces). */
export function pestanas(opciones, activa) {
  return el('nav', { clase: 'pestanas', 'aria-label': 'Secciones' },
    opciones.map(([href, texto, clave]) => el('a', { href, clase: 'pestana', 'aria-current': clave === activa ? 'page' : null }, texto)));
}
