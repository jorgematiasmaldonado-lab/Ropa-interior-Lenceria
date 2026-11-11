/*
 * Gastos del emprendimiento (publicidad, envíos, packaging…), en pesos o dólares.
 * Rutas: #/gastos · #/gastos/nuevo · #/gastos/g/<id>
 */
import { el, montar } from '../util/dom.js';
import { pesos, dolares, leerNumero, redondear, fecha, inicioPeriodo, fechaParaInput, fechaDesdeInput } from '../util/formato.js';
import { campo, volver } from '../util/formulario.js';
import { avisar, confirmar } from '../util/avisos.js';
import { listar, crear, actualizar, eliminar, obtener } from '../datos/repositorios.js';
import { procesarImagen, esImagenSegura } from '../util/imagenes.js';
import { obtenerCotizacion } from '../util/cotizacion.js';

let periodo = 'mes';

export async function mostrar(contenedor, ruta, resto = []) {
  const [a, b] = resto;
  if (a === 'nuevo') return formulario(contenedor, null);
  if (a === 'g' && b) return formulario(contenedor, b);
  return lista(contenedor);
}

async function lista(contenedor) {
  const [gastos, compras] = await Promise.all([listar('gastos'), listar('compras')]);
  gastos.sort((a, b) => b.fecha.localeCompare(a.fecha));
  const zona = el('div');

  function dibujar() {
    const desde = periodo === 'todos' ? '' : inicioPeriodo(periodo).toISOString();
    const delPeriodo = gastos.filter((g) => g.fecha >= desde);
    const comprasPeriodo = compras.filter((c) => c.estado !== 'anulada' && c.fecha >= desde);
    const total = delPeriodo.reduce((s, g) => s + g.montoArs, 0);
    const totalCompras = comprasPeriodo.reduce((s, c) => s + c.totalArs, 0);
    const porCategoria = new Map();
    for (const g of delPeriodo) porCategoria.set(g.categoria, (porCategoria.get(g.categoria) || 0) + g.montoArs);

    montar(zona,
      el('div', { clase: 'tarjeta totales' },
        el('div', { clase: 'linea linea--total' }, el('span', {}, 'Gastos'), el('span', {}, pesos(total))),
        [...porCategoria.entries()].sort((a, b) => b[1] - a[1]).map(([c, m]) => el('div', { clase: 'linea campo__ayuda' }, el('span', {}, c), el('span', {}, pesos(m)))),
        el('div', { clase: 'linea' }, el('a', { href: '#/inventario/compras' }, 'Compras de mercadería'), el('span', {}, pesos(totalCompras))),
        el('div', { clase: 'linea campo__ayuda' }, el('span', {}, 'Total que salió de caja'), el('span', {}, pesos(total + totalCompras)))),
      delPeriodo.length ? el('ul', { clase: 'lista' }, delPeriodo.map((g) => el('li', {},
        el('a', { href: `#/gastos/g/${g.id}`, clase: 'lista__item' },
          el('span', {}, g.descripcion || g.categoria, el('small', {}, `${fecha(g.fecha)} · ${g.categoria}${g.medio ? ` · ${g.medio}` : ''}`)),
          el('span', { clase: 'lista__monto' }, pesos(g.montoArs), g.moneda === 'USD' ? el('small', {}, dolares(g.montoOriginal)) : null))))) :
        el('p', { clase: 'vacio' }, 'No hay gastos en este período.'));
  }

  const chip = (valor, texto) => el('button', { type: 'button', clase: 'filtro', 'aria-pressed': String(periodo === valor),
    onClick: (e) => {
      periodo = valor;
      e.currentTarget.parentElement.querySelectorAll('.filtro').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget)));
      dibujar();
    } }, texto);

  montar(contenedor,
    el('div', { clase: 'cabecera-lista' },
      el('h1', { clase: 'titulo-pantalla' }, 'Gastos'),
      el('a', { href: '#/gastos/nuevo', clase: 'boton' }, '+ Nuevo gasto')),
    el('div', { clase: 'filtros' }, chip('dia', 'Hoy'), chip('semana', 'Semana'), chip('mes', 'Mes'), chip('todos', 'Todos')),
    zona);
  dibujar();
}

async function formulario(contenedor, id) {
  const existente = id ? await obtener('gastos', id) : null;
  if (id && (!existente || existente.eliminado)) { montar(contenedor, volver('#/gastos'), el('p', {}, 'No se encontró el gasto.')); return; }
  const [listas, pref] = await Promise.all([listar('listas'), obtener('preferencias', 'principal')]);
  const categorias = listas.filter((l) => l.tipo === 'categoriaGasto').sort((a, b) => a.orden - b.orden).map((l) => l.valor);
  const g = existente || { moneda: 'ARS', medio: 'Efectivo' };
  let moneda = g.moneda || 'ARS';
  let foto = g.foto || null;

  const f = {
    fecha: campo({ etiqueta: 'Fecha', tipo: 'date', valor: fechaParaInput(g.fecha ? new Date(g.fecha) : new Date()) }),
    categoria: campo({ etiqueta: 'Categoría', tipo: 'select', opciones: g.categoria && !categorias.includes(g.categoria) ? [...categorias, g.categoria] : categorias }),
    descripcion: campo({ etiqueta: 'Descripción', valor: g.descripcion, max: 80, placeholder: 'Ej.: Publicidad en Instagram' }),
    monto: campo({ etiqueta: 'Monto', tipo: 'dinero', obligatorio: true, valor: g.montoOriginal ? String(g.montoOriginal).replace('.', ',') : '' }),
    cotizacion: campo({ etiqueta: 'Cotización del dólar', tipo: 'dinero', prefijo: '$', valor: (g.cotizacion && g.moneda === 'USD' ? g.cotizacion : pref?.cotizacionDolar) ? String(g.cotizacion && g.moneda === 'USD' ? g.cotizacion : pref.cotizacionDolar).replace('.', ',') : '' }),
    medio: campo({ etiqueta: 'Pagado con', tipo: 'select', opciones: ['Efectivo', 'Transferencia', 'Tarjeta', 'Otro'] })
  };
  f.categoria.valor = g.categoria || categorias[0] || '';
  f.medio.valor = g.medio || 'Efectivo';

  const enPesos = el('p', { clase: 'campo__ayuda', 'aria-live': 'polite' });
  const calcular = () => {
    const m = leerNumero(f.monto.valor);
    const c = leerNumero(f.cotizacion.valor);
    enPesos.textContent = moneda === 'USD' && m > 0 && c > 0 ? `Equivale a ${pesos(m * c)}` : '';
  };
  f.monto.entrada.addEventListener('input', calcular);
  f.cotizacion.entrada.addEventListener('input', calcular);

  const zonaUSD = el('div', { clase: moneda === 'USD' ? '' : 'oculto' }, f.cotizacion.nodo,
    el('div', { clase: 'botonera' }, ['oficial', 'blue'].map((tipo) => el('button', { type: 'button', clase: 'boton boton--chico boton--secundario', onClick: async () => {
      try { const v = await obtenerCotizacion(tipo); f.cotizacion.valor = String(v).replace('.', ','); calcular(); avisar(`Dólar ${tipo}: ${pesos(v)}`); }
      catch (error) { avisar(error.message, 'error'); }
    } }, `Usar dólar ${tipo}`))), enPesos);

  const selectorMoneda = el('div', { clase: 'segmentado', role: 'radiogroup', 'aria-label': 'Moneda' },
    [['ARS', 'Pesos'], ['USD', 'Dólares']].map(([valor, texto]) => el('label', {},
      el('input', { type: 'radio', name: 'moneda-gasto', value: valor, checked: moneda === valor, onChange: () => {
        moneda = valor; zonaUSD.classList.toggle('oculto', valor !== 'USD'); calcular();
      } }), texto)));

  // Foto del comprobante
  let vista = el('span');
  const dibujarFoto = () => {
    const nueva = esImagenSegura(foto) ? el('img', { src: foto, alt: 'Comprobante del gasto', clase: 'foto-editor__vista' }) : el('span', { clase: 'foto-editor__vista foto-editor__vacia' }, 'Sin foto');
    vista.replaceWith(nueva); vista = nueva;
  };
  const archivo = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', clase: 'archivo-oculto', id: 'archivo-gasto',
    onChange: async (e) => {
      const a = e.target.files?.[0]; e.target.value = '';
      if (!a) return;
      try { foto = await procesarImagen(a, { lado: 1000, formato: 'image/jpeg', calidad: 0.75 }); dibujarFoto(); }
      catch (error) { avisar(error.message, 'error'); }
    } });

  async function guardar(e) {
    e.preventDefault();
    Object.values(f).forEach((c) => c.limpiar());
    const monto = leerNumero(f.monto.valor);
    if (!(monto > 0)) return f.monto.error('Ingresá un monto mayor a cero.');
    const cot = moneda === 'USD' ? leerNumero(f.cotizacion.valor) : 1;
    if (!(cot > 0)) return f.cotizacion.error('Ingresá la cotización.');
    const datos = {
      fecha: fechaDesdeInput(f.fecha.valor),
      categoria: f.categoria.valor,
      descripcion: f.descripcion.valor.replace(/\s+/g, ' ').trim().slice(0, 80),
      moneda,
      montoOriginal: redondear(monto),
      cotizacion: cot,
      montoArs: redondear(monto * cot),
      medio: f.medio.valor,
      foto: esImagenSegura(foto) ? foto : null
    };
    try {
      if (existente) await actualizar('gastos', existente.id, datos); else await crear('gastos', datos);
      if (moneda === 'USD') await actualizar('preferencias', 'principal', { cotizacionDolar: cot }).catch(() => {});
      avisar(existente ? 'Gasto actualizado' : 'Gasto registrado');
      location.hash = '#/gastos';
    } catch (error) { avisar(error.message || 'No se pudo guardar.', 'error'); }
  }

  async function borrar() {
    if (!await confirmar({ titulo: '¿Eliminar este gasto?', aceptar: 'Eliminar', peligro: true })) return;
    await eliminar('gastos', existente.id);
    avisar('Gasto eliminado');
    location.hash = '#/gastos';
  }

  montar(contenedor,
    volver('#/gastos'),
    el('h1', { clase: 'titulo-pantalla' }, existente ? 'Editar gasto' : 'Nuevo gasto'),
    el('form', { novalidate: true, onSubmit: guardar },
      el('div', { clase: 'tarjeta' },
        el('div', { clase: 'dos-columnas' }, f.fecha.nodo, f.categoria.nodo),
        f.descripcion.nodo,
        el('div', { clase: 'campo' }, el('span', { clase: 'campo__etiqueta' }, 'Moneda'), selectorMoneda),
        f.monto.nodo, zonaUSD, f.medio.nodo),
      el('div', { clase: 'tarjeta' },
        el('h2', { clase: 'campo__etiqueta' }, 'Foto del comprobante (opcional)'),
        el('div', { clase: 'foto-editor' }, vista,
          el('div', { clase: 'botonera' },
            el('label', { for: 'archivo-gasto', clase: 'boton boton--chico', role: 'button', tabindex: '0' }, 'Elegir foto'),
            el('button', { type: 'button', clase: 'boton boton--texto', onClick: () => { foto = null; dibujarFoto(); } }, 'Quitar')),
          archivo)),
      el('div', { clase: 'botonera' },
        el('button', { type: 'submit', clase: 'boton boton--grande' }, existente ? 'Guardar cambios' : 'Registrar gasto'),
        existente ? el('button', { type: 'button', clase: 'boton boton--texto texto-peligro', onClick: borrar }, 'Eliminar') : null))
  );
  dibujarFoto();
  calcular();
}
