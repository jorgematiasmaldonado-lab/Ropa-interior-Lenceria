/*
 * Ingreso de mercadería (compras a proveedores) en pesos o dólares, y proveedores.
 */
import { el, montar } from '../util/dom.js';
import { pesos, dolares, leerNumero, redondear, fecha, fechaParaInput, fechaDesdeInput } from '../util/formato.js';
import { campo, volver } from '../util/formulario.js';
import { avisar, confirmar, pedirTexto, formularioDialogo } from '../util/avisos.js';
import { listar, crear, actualizar, eliminar, obtener } from '../datos/repositorios.js';
import { leerPorIndice } from '../datos/db.js';
import { cargarCatalogo, textoVariante } from '../datos/catalogo.js';
import { registrarCompra, anularCompra } from '../datos/operaciones.js';
import { obtenerCotizacion } from '../util/cotizacion.js';
import { crearSelector } from './selector.js';
import { pestanasInventario } from './inventario.js';

export async function mostrar(contenedor, resto) {
  const [a, b] = resto;
  if (a === 'compra') return nuevaCompra(contenedor, b);
  if (a === 'compras' && b) return detalleCompra(contenedor, b);
  if (a === 'compras') return listaCompras(contenedor);
  if (a === 'proveedores') return proveedores(contenedor);
}

/* =========================================================
   Nueva compra
   ========================================================= */
async function nuevaCompra(contenedor, productoId) {
  const cat = await cargarCatalogo();
  const pref = await obtener('preferencias', 'principal');
  const items = []; // {variante, producto, cantidad, costo}
  let moneda = 'ARS';

  const f = {
    fecha: campo({ etiqueta: 'Fecha', tipo: 'date', valor: fechaParaInput() }),
    proveedor: campo({ etiqueta: 'Proveedor', tipo: 'select', vacio: 'Sin proveedor', opciones: cat.proveedores.map((p) => [p.id, p.nombre]) }),
    cotizacion: campo({ etiqueta: 'Cotización del dólar (pesos por USD)', tipo: 'dinero', prefijo: '$', valor: pref?.cotizacionDolar ? String(pref.cotizacionDolar).replace('.', ',') : '' }),
    adicionales: campo({ etiqueta: 'Gastos adicionales en pesos (envío, comisiones…)', tipo: 'dinero', prefijo: '$', ayuda: 'Se reparten en el costo de cada producto.' }),
    nota: campo({ etiqueta: 'Nota (opcional)', max: 120 })
  };

  // Moneda
  const zonaCotizacion = el('div', { clase: 'oculto' }, f.cotizacion.nodo,
    el('div', { clase: 'botonera' },
      ['oficial', 'blue'].map((tipo) => el('button', { type: 'button', clase: 'boton boton--chico boton--secundario', onClick: async (e) => {
        const boton = e.currentTarget;
        boton.disabled = true;
        try {
          const valor = await obtenerCotizacion(tipo);
          f.cotizacion.valor = String(valor).replace('.', ',');
          avisar(`Dólar ${tipo}: ${pesos(valor)}`);
          dibujarItems();
        } catch (error) { avisar(error.message, 'error'); }
        boton.disabled = false;
      } }, `Usar dólar ${tipo}`))),
    el('p', { clase: 'campo__ayuda' }, 'Necesita internet. Siempre podés escribirla a mano.'));

  const selectorMoneda = el('div', { clase: 'segmentado', role: 'radiogroup', 'aria-label': 'Moneda' },
    [['ARS', 'Pesos'], ['USD', 'Dólares']].map(([valor, texto]) => el('label', {},
      el('input', { type: 'radio', name: 'moneda', value: valor, checked: valor === 'ARS', onChange: () => {
        moneda = valor;
        zonaCotizacion.classList.toggle('oculto', valor !== 'USD');
        dibujarItems();
      } }), texto)));

  // Productos
  const zonaItems = el('div');
  const totales = el('div', { clase: 'tarjeta totales', 'aria-live': 'polite' });

  function agregar(variante, producto) {
    const existente = items.find((it) => it.variante.id === variante.id);
    if (existente) { existente.cantidad += 1; dibujarItems(); return; }
    const cot = leerNumero(f.cotizacion.valor);
    const costoSugerido = moneda === 'USD' && cot > 0 ? redondear((variante.costo || producto.costo || 0) / cot) : (variante.costo || producto.costo || 0);
    items.push({ variante, producto, cantidad: 1, costo: costoSugerido ? String(costoSugerido).replace('.', ',') : '' });
    dibujarItems();
  }

  function dibujarItems() {
    const simbolo = moneda === 'USD' ? 'USD' : '$';
    if (!items.length) {
      montar(zonaItems, el('p', { clase: 'vacio' }, 'Buscá y agregá los productos que compraste.'));
    } else {
      montar(zonaItems, el('ul', { clase: 'lista-edicion' }, items.map((it, i) => el('li', {},
        el('div', { clase: 'fila fila--item' },
          el('span', { clase: 'fila__nombre' }, el('strong', {}, it.producto.nombre), el('small', {}, ` ${textoVariante(it.variante)}`)),
          el('label', { clase: 'mini-campo' }, 'Cant.',
            el('input', { type: 'text', inputmode: 'numeric', maxlength: 4, clase: 'entrada-chica', value: it.cantidad,
              onInput: (e) => { it.cantidad = Number(e.target.value); actualizarTotales(); } })),
          el('label', { clase: 'mini-campo' }, `Costo c/u (${simbolo})`,
            el('input', { type: 'text', inputmode: 'decimal', maxlength: 12, clase: 'entrada-media', value: it.costo,
              onInput: (e) => { it.costo = e.target.value; actualizarTotales(); } })),
          el('button', { type: 'button', clase: 'boton-icono boton-icono--peligro', 'aria-label': `Quitar ${it.producto.nombre}`,
            onClick: () => { items.splice(i, 1); dibujarItems(); } }, '✕')
        )))));
    }
    actualizarTotales();
  }

  function actualizarTotales() {
    const cot = moneda === 'USD' ? leerNumero(f.cotizacion.valor) : 1;
    const subtotal = items.reduce((s, it) => s + (Number(it.cantidad) || 0) * (leerNumero(it.costo) || 0), 0);
    const adic = leerNumero(f.adicionales.valor) || 0;
    const unidades = items.reduce((s, it) => s + (Number(it.cantidad) || 0), 0);
    const subtotalArs = cot > 0 ? subtotal * cot : 0;
    montar(totales,
      el('div', { clase: 'linea' }, el('span', {}, `Productos (${unidades} u.)`), el('span', {}, moneda === 'USD' ? dolares(subtotal) : pesos(subtotal))),
      moneda === 'USD' ? el('div', { clase: 'linea' }, el('span', {}, 'En pesos'), el('span', {}, cot > 0 ? pesos(subtotalArs) : 'Falta cotización')) : null,
      adic ? el('div', { clase: 'linea' }, el('span', {}, 'Gastos adicionales'), el('span', {}, pesos(adic))) : null,
      el('div', { clase: 'linea linea--total' }, el('span', {}, 'Total en pesos'), el('span', {}, pesos(subtotalArs + adic))));
  }
  f.adicionales.entrada.addEventListener('input', actualizarTotales);
  f.cotizacion.entrada.addEventListener('input', actualizarTotales);

  // Preselección desde la ficha del producto
  if (productoId && cat.productoPorId.has(productoId)) {
    const p = cat.productoPorId.get(productoId);
    (cat.variantesPorProducto.get(productoId) || []).forEach((v) => agregar(v, p));
  }

  async function guardar() {
    Object.values(f).forEach((c) => c.limpiar());
    if (!items.length) { avisar('Agregá al menos un producto.', 'error'); return; }
    const cot = moneda === 'USD' ? leerNumero(f.cotizacion.valor) : 1;
    if (moneda === 'USD' && !(cot > 0)) return f.cotizacion.error('Ingresá la cotización. Ej.: 1450');
    const adic = f.adicionales.valor.trim() ? leerNumero(f.adicionales.valor) : 0;
    if (!(adic >= 0)) return f.adicionales.error('Monto no válido.');
    const lista = [];
    for (const it of items) {
      const cantidad = Number(it.cantidad);
      const costo = leerNumero(it.costo);
      const nombre = `${it.producto.nombre} ${textoVariante(it.variante)}`;
      if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 9999) { avisar(`Cantidad no válida en ${nombre}.`, 'error'); return; }
      if (!(costo >= 0)) { avisar(`Costo no válido en ${nombre}.`, 'error'); return; }
      lista.push({ varianteId: it.variante.id, cantidad, costoUnitOriginal: costo, descripcion: nombre });
    }
    const prov = cat.proveedores.find((p) => p.id === f.proveedor.valor);
    try {
      const compra = await registrarCompra({
        fecha: fechaDesdeInput(f.fecha.valor), proveedorId: f.proveedor.valor, proveedorNombre: prov?.nombre || '',
        moneda, cotizacion: cot, adicionalesArs: adic, nota: f.nota.valor.trim().slice(0, 120)
      }, lista);
      if (moneda === 'USD') await actualizar('preferencias', 'principal', { cotizacionDolar: cot }).catch(() => {});
      avisar('Compra registrada. Stock actualizado.');
      location.hash = `#/inventario/compras/${compra.id}`;
    } catch (error) {
      avisar(error.message || 'No se pudo guardar.', 'error');
    }
  }

  montar(contenedor,
    volver('#/inventario/compras'),
    el('h1', { clase: 'titulo-pantalla' }, 'Ingreso de mercadería'),
    el('div', { clase: 'tarjeta' },
      el('div', { clase: 'dos-columnas' }, f.fecha.nodo, f.proveedor.nodo),
      el('div', { clase: 'campo' }, el('span', { clase: 'campo__etiqueta' }, 'Moneda de la compra'), selectorMoneda),
      zonaCotizacion),
    el('div', { clase: 'tarjeta' },
      el('h2', { clase: 'campo__etiqueta' }, 'Productos'),
      crearSelector({ catalogo: cat, alElegir: agregar }),
      el('p', { clase: 'campo__ayuda' }, '¿Es un producto nuevo? Crealo primero en Inventario › Nuevo producto.'),
      zonaItems),
    el('div', { clase: 'tarjeta' }, f.adicionales.nodo, f.nota.nodo),
    totales,
    el('div', { clase: 'botonera' },
      el('button', { type: 'button', clase: 'boton boton--grande', onClick: guardar }, 'Registrar compra'))
  );
  dibujarItems();
}

/* =========================================================
   Lista y detalle de compras
   ========================================================= */
async function listaCompras(contenedor) {
  const compras = (await listar('compras')).sort((a, b) => b.fecha.localeCompare(a.fecha));
  const inicioMes = new Date(); inicioMes.setDate(1); inicioMes.setHours(0, 0, 0, 0);
  const delMes = compras.filter((c) => c.estado !== 'anulada' && new Date(c.fecha) >= inicioMes);
  montar(contenedor,
    pestanasInventario('compras'),
    el('div', { clase: 'cabecera-lista' },
      el('h1', { clase: 'titulo-pantalla' }, 'Compras'),
      el('a', { href: '#/inventario/compra', clase: 'boton' }, '+ Ingreso de mercadería')),
    el('div', { clase: 'tarjeta' }, el('div', { clase: 'linea linea--total' },
      el('span', {}, 'Compras de este mes'), el('span', {}, pesos(delMes.reduce((s, c) => s + c.totalArs, 0))))),
    compras.length ? el('ul', { clase: 'lista' }, compras.map((c) => el('li', {},
      el('a', { href: `#/inventario/compras/${c.id}`, clase: 'lista__item' },
        el('span', {}, `${fecha(c.fecha)} · ${c.proveedorNombre || 'Sin proveedor'}`,
          el('small', {}, c.moneda === 'USD' ? `${dolares(c.totalOriginal)} × ${pesos(c.cotizacion)}` : (c.nota || 'En pesos'))),
        el('span', { clase: 'lista__monto' }, pesos(c.totalArs), c.estado === 'anulada' ? el('small', { clase: 'texto-alerta' }, 'Anulada') : null)
      )))) : el('p', { clase: 'vacio' }, 'Todavía no registraste compras.')
  );
}

async function detalleCompra(contenedor, id) {
  const c = await obtener('compras', id);
  if (!c) { montar(contenedor, volver('#/inventario/compras'), el('p', {}, 'No se encontró la compra.')); return; }
  const items = (await leerPorIndice('compras_items', 'compraId', id)).sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
  const usd = c.moneda === 'USD';

  async function anular() {
    const motivo = await pedirTexto({ titulo: 'Anular compra', etiqueta: 'Motivo', max: 80 });
    if (motivo === null) return;
    if (!await confirmar({ titulo: '¿Anular la compra?', mensaje: 'Se descuenta del stock lo que había ingresado.', aceptar: 'Anular', peligro: true })) return;
    try { await anularCompra(id, motivo.trim()); avisar('Compra anulada'); detalleCompra(contenedor, id); }
    catch (error) { avisar(error.message, 'error'); }
  }

  montar(contenedor,
    volver('#/inventario/compras'),
    el('h1', { clase: 'titulo-pantalla' }, `Compra del ${fecha(c.fecha)}`),
    c.estado === 'anulada' ? el('div', { clase: 'alerta' }, `Anulada${c.motivoAnulacion ? `: ${c.motivoAnulacion}` : ''}`) : null,
    el('p', { clase: 'campo__ayuda' }, [c.proveedorNombre || 'Sin proveedor', usd ? `Dólar a ${pesos(c.cotizacion)}` : 'En pesos', c.nota].filter(Boolean).join(' · ')),
    el('ul', { clase: 'lista-simple' }, items.map((it) => el('li', {},
      el('span', {}, it.descripcion, el('small', {}, `${it.cantidad} × ${usd ? dolares(it.costoUnitOriginal) : pesos(it.costoUnitOriginal)} · costo final ${pesos(it.costoUnitArs)} c/u`)),
      el('strong', {}, usd ? dolares(it.cantidad * it.costoUnitOriginal) : pesos(it.cantidad * it.costoUnitOriginal))))),
    el('div', { clase: 'tarjeta totales' },
      usd ? el('div', { clase: 'linea' }, el('span', {}, 'Total en dólares'), el('span', {}, dolares(c.subtotalOriginal))) : null,
      el('div', { clase: 'linea' }, el('span', {}, 'Productos en pesos'), el('span', {}, pesos(c.subtotalArs))),
      c.adicionalesArs ? el('div', { clase: 'linea' }, el('span', {}, 'Gastos adicionales'), el('span', {}, pesos(c.adicionalesArs))) : null,
      el('div', { clase: 'linea linea--total' }, el('span', {}, 'Total'), el('span', {}, pesos(c.totalArs)))),
    c.estado !== 'anulada' ? el('div', { clase: 'botonera botonera--fin' },
      el('button', { type: 'button', clase: 'boton boton--texto texto-peligro', onClick: anular }, 'Anular compra')) : null
  );
}

/* =========================================================
   Proveedores
   ========================================================= */
async function proveedores(contenedor) {
  const lista = (await listar('proveedores')).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  async function editar(p) {
    const r = await formularioDialogo({
      titulo: p ? 'Editar proveedor' : 'Nuevo proveedor',
      campos: [
        { clave: 'nombre', etiqueta: 'Nombre', valor: p?.nombre || '', max: 60 },
        { clave: 'contacto', etiqueta: 'Contacto (teléfono, Instagram…)', valor: p?.contacto || '', max: 60 },
        { clave: 'notas', etiqueta: 'Notas', tipo: 'textarea', valor: p?.notas || '', max: 200 }
      ]
    });
    if (!r) return;
    const nombre = r.nombre.replace(/\s+/g, ' ').trim().slice(0, 60);
    if (!nombre) { avisar('El nombre es obligatorio.', 'error'); return; }
    const datos = { nombre, contacto: r.contacto.trim().slice(0, 60), notas: r.notas.trim().slice(0, 200) };
    if (p) await actualizar('proveedores', p.id, datos); else await crear('proveedores', datos);
    avisar('Proveedor guardado');
    proveedores(contenedor);
  }

  async function borrar(p) {
    if (!await confirmar({ titulo: `¿Eliminar a ${p.nombre}?`, mensaje: 'Las compras anteriores no se modifican.', aceptar: 'Eliminar', peligro: true })) return;
    await eliminar('proveedores', p.id);
    avisar('Proveedor eliminado');
    proveedores(contenedor);
  }

  montar(contenedor,
    pestanasInventario('proveedores'),
    el('div', { clase: 'cabecera-lista' },
      el('h1', { clase: 'titulo-pantalla' }, 'Proveedores'),
      el('button', { type: 'button', clase: 'boton', onClick: () => editar(null) }, '+ Nuevo')),
    lista.length ? el('ul', { clase: 'lista-edicion' }, lista.map((p) => el('li', {},
      el('div', { clase: 'fila' },
        el('span', { clase: 'fila__nombre' }, p.nombre, p.contacto ? el('small', {}, ` · ${p.contacto}`) : null),
        el('button', { type: 'button', clase: 'boton boton--texto', onClick: () => editar(p) }, 'Editar'),
        el('button', { type: 'button', clase: 'boton boton--texto texto-peligro', onClick: () => borrar(p) }, 'Eliminar'))))) :
      el('p', { clase: 'vacio' }, 'Todavía no cargaste proveedores.')
  );
}
