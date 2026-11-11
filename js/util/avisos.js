/*
 * Mensajes en pantalla: avisos breves ("Guardado") y ventanas de confirmación.
 * Se usan ventanas propias en lugar de alert()/confirm() del navegador.
 */
import { el } from './dom.js';

/** Aviso breve que desaparece solo. */
export function avisar(mensaje, tipo = 'ok') {
  let zona = document.getElementById('zona-avisos');
  if (!zona) {
    zona = el('div', { id: 'zona-avisos', clase: 'zona-avisos', role: 'status', 'aria-live': 'polite' });
    document.body.append(zona);
  }
  const aviso = el('div', { clase: `aviso aviso--${tipo}` }, mensaje);
  zona.append(aviso);
  setTimeout(() => aviso.remove(), 2600);
}

function abrirDialogo(contenido, alCerrar) {
  const dialogo = el('dialog', { clase: 'dialogo' }, contenido);
  document.body.append(dialogo);
  dialogo.addEventListener('close', () => { alCerrar(dialogo.returnValue); dialogo.remove(); });
  dialogo.addEventListener('cancel', () => { dialogo.returnValue = ''; });
  dialogo.showModal();
  return dialogo;
}

/**
 * Pide confirmación. Devuelve true si la usuaria acepta.
 * @param {{titulo:string, mensaje?:string, aceptar?:string, peligro?:boolean}} opciones
 */
export function confirmar({ titulo, mensaje = '', aceptar = 'Aceptar', peligro = false }) {
  return new Promise((resolver) => {
    const form = el('form', { method: 'dialog' },
      el('h2', { clase: 'dialogo__titulo' }, titulo),
      mensaje ? el('p', {}, mensaje) : null,
      el('div', { clase: 'dialogo__botones' },
        el('button', { type: 'submit', value: '', clase: 'boton boton--secundario' }, 'Cancelar'),
        el('button', { type: 'submit', value: 'si', clase: `boton ${peligro ? 'boton--peligro' : ''}` }, aceptar)
      )
    );
    abrirDialogo(form, (valor) => resolver(valor === 'si'));
  });
}

/**
 * Pide un texto (ej.: renombrar). Devuelve el texto o null si cancela.
 */
export function pedirTexto({ titulo, etiqueta = 'Nombre', valor = '', max = 40 }) {
  return new Promise((resolver) => {
    const entrada = el('input', { type: 'text', value: valor, maxlength: max, required: true, autocomplete: 'off', id: 'dialogo-texto' });
    const form = el('form', { method: 'dialog' },
      el('h2', { clase: 'dialogo__titulo' }, titulo),
      el('label', { clase: 'campo' }, el('span', { clase: 'campo__etiqueta' }, etiqueta), entrada),
      el('div', { clase: 'dialogo__botones' },
        el('button', { type: 'submit', value: '', clase: 'boton boton--secundario', formnovalidate: true }, 'Cancelar'),
        el('button', { type: 'submit', value: 'ok', clase: 'boton' }, 'Guardar')
      )
    );
    abrirDialogo(form, (r) => resolver(r === 'ok' ? entrada.value : null));
    entrada.select();
  });
}

/**
 * Ventana con varios campos. Devuelve un objeto {clave: valor} o null si cancela.
 * @param {{titulo:string, mensaje?:string, campos:Array<{clave,etiqueta,tipo?,valor?,opciones?,ayuda?}>, aceptar?:string}} o
 */
export async function formularioDialogo({ titulo, mensaje = '', campos, aceptar = 'Guardar' }) {
  const { campo } = await import('./formulario.js');
  const creados = campos.map((c) => ({ clave: c.clave, ...campo({ ...c }) }));
  return new Promise((resolver) => {
    const form = el('form', { method: 'dialog' },
      el('h2', { clase: 'dialogo__titulo' }, titulo),
      mensaje ? el('p', { clase: 'campo__ayuda' }, mensaje) : null,
      creados.map((c) => c.nodo),
      el('div', { clase: 'dialogo__botones' },
        el('button', { type: 'submit', value: '', clase: 'boton boton--secundario', formnovalidate: true }, 'Cancelar'),
        el('button', { type: 'submit', value: 'ok', clase: 'boton' }, aceptar)
      )
    );
    abrirDialogo(form, (r) => {
      if (r !== 'ok') return resolver(null);
      resolver(Object.fromEntries(creados.map((c) => [c.clave, c.entrada.value])));
    });
    creados[0]?.entrada.focus();
  });
}
