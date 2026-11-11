/*
 * Buscador de productos para ventas y compras.
 * Escribís parte del nombre, marca, talle o color y elegís la variante.
 */
import { el, montar } from '../util/dom.js';
import { pesos, normalizar } from '../util/formato.js';
import { textoVariante, precioVariante, textoBusqueda } from '../datos/catalogo.js';
import { esImagenSegura } from '../util/imagenes.js';

/**
 * @param {object} o
 * @param {object} o.catalogo - resultado de cargarCatalogo()
 * @param {boolean} [o.soloConStock]
 * @param {(variante, producto) => void} o.alElegir
 * @param {string} [o.placeholder]
 */
export function crearSelector({ catalogo, soloConStock = false, alElegir, placeholder = 'Buscar producto, marca, talle o color…' }) {
  const entrada = el('input', { type: 'search', placeholder, autocomplete: 'off', 'aria-label': placeholder, clase: 'buscador__entrada' });
  const resultados = el('ul', { clase: 'resultados', role: 'listbox' });

  const filas = catalogo.variantes
    .map((v) => ({ v, p: catalogo.productoPorId.get(v.productoId) }))
    .filter(({ p }) => p && p.activo !== false)
    .map((x) => ({ ...x, texto: textoBusqueda(x.v, x.p) }));

  function dibujar() {
    const terminos = normalizar(entrada.value).split(/\s+/).filter(Boolean);
    if (!terminos.length) { montar(resultados); return; }
    const encontrados = filas
      .filter(({ texto }) => terminos.every((t) => texto.includes(t)))
      .filter(({ v }) => !soloConStock || v.stock > 0)
      .slice(0, 30);
    if (!encontrados.length) {
      montar(resultados, el('li', { clase: 'vacio' }, soloConStock ? 'No hay productos con stock que coincidan.' : 'No se encontraron productos.'));
      return;
    }
    montar(resultados, encontrados.map(({ v, p }) => el('li', {},
      el('button', {
        type: 'button', clase: 'resultado', role: 'option',
        onClick: () => { alElegir(v, p); entrada.value = ''; montar(resultados); entrada.focus(); }
      },
        esImagenSegura(p.foto) ? el('img', { src: p.foto, alt: '', clase: 'miniatura' }) : el('span', { clase: 'miniatura miniatura--vacia', 'aria-hidden': 'true' }, (p.nombre || '?')[0]),
        el('span', { clase: 'resultado__texto' },
          el('strong', {}, p.nombre), p.marca ? ` · ${p.marca}` : '',
          el('small', {}, textoVariante(v))
        ),
        el('span', { clase: 'resultado__dato' },
          pesos(precioVariante(v, p)),
          el('small', { clase: v.stock > 0 ? '' : 'texto-alerta' }, `Stock ${v.stock}`)
        )
      )
    )));
  }

  entrada.addEventListener('input', dibujar);
  return el('div', { clase: 'buscador' }, entrada, resultados);
}
