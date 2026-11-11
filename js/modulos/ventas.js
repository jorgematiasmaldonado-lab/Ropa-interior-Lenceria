/*
 * Ventas: nueva venta (rápida), historial, detalle, comprobante, cambios y anulación.
 * Rutas: #/ventas (nueva venta) · #/ventas/historial · #/ventas/v/<id>
 */
import { el, montar } from '../util/dom.js';
import { pesos, leerNumero, redondear, fecha, fechaHora, inicioPeriodo, normalizar, fechaParaInput, fechaDesdeInput } from '../util/formato.js';
import { campo, volver, pestanas } from '../util/formulario.js';
import { avisar, confirmar, pedirTexto, formularioDialogo } from '../util/avisos.js';
import { listar, crear, obtener, leerUnico } from '../datos/repositorios.js';
import { leerPorIndice } from '../datos/db.js';
import { cargarCatalogo, textoVariante, precioVariante } from '../datos/catalogo.js';
import { registrarVenta, anularVenta, cambiarVariante } from '../datos/operaciones.js';
import { crearSelector } from './selector.js';
import { generarComprobante, textoComprobante } from '../util/comprobante.js';
import { compartirODescargar, descargar } from '../util/archivos.js';
import { abrirWhatsApp } from '../util/whatsapp.js';
import * as validar from '../util/validacion.js';

/** Venta en curso: se conserva si la usuaria cambia de pantalla. */
let carrito = nuevoCarrito();
function nuevoCarrito() {
  return { items: [], clienteId: '', canal: 'WhatsApp', entrega: 'Retira', costoEnvio: '', descuento: '', efectivo: '', transferencia: '', nota: '', fecha: '' };
}

let periodoHistorial = 'mes';
let busquedaHistorial = '';

export async function mostrar(contenedor, ruta, resto = []) {
  const [a, b] = resto;
  if (a === 'v' && b) return detalleVenta(contenedor, b);
  if (a === 'historial') return historial(contenedor);
  return nuevaVenta(contenedor);
}

const pestanasVentas = (activa) => pestanas([['#/ventas', 'Nueva venta', 'nueva'], ['#/ventas/historial', 'Historial', 'historial']], activa);

/* =========================================================
   Nueva venta
   ========================================================= */
async function nuevaVenta(contenedor) {
  const [cat, clientes, listas] = await Promise.all([cargarCatalogo(), listar('clientes'), listar('listas')]);
  const canales = listas.filter((l) => l.tipo === 'canal').sort((a, b) => a.orden - b.orden).map((l) => l.valor);
  const entregas = ['Retira', 'Envío en zona (gratis)', 'Envío con costo'];
  clientes.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  // Refrescar datos del carrito con el stock actual
  carrito.items = carrito.items.filter((it) => cat.variantes.some((v) => v.id === it.varianteId));

  const zonaCarrito = el('div');
  const zonaTotales = el('div', { clase: 'tarjeta totales', 'aria-live': 'polite' });

  function agregar(v, p) {
    const existente = carrito.items.find((it) => it.varianteId === v.id);
    if (existente) {
      if (existente.cantidad + 1 > v.stock) { avisar(`Solo hay ${v.stock} en stock.`, 'error'); return; }
      existente.cantidad += 1;
    } else {
      carrito.items.push({ varianteId: v.id, nombre: p.nombre, detalle: textoVariante(v), cantidad: 1, precio: String(precioVariante(v, p)).replace('.', ','), stock: v.stock, mayorista: p.precioMayorista });
    }
    dibujarCarrito();
  }

  function dibujarCarrito() {
    if (!carrito.items.length) {
      montar(zonaCarrito, el('p', { clase: 'vacio' }, 'Buscá un producto para empezar la venta.'));
    } else {
      montar(zonaCarrito, el('ul', { clase: 'lista-edicion' }, carrito.items.map((it, i) => el('li', {},
        el('div', { clase: 'fila fila--item' },
          el('span', { clase: 'fila__nombre' }, el('strong', {}, it.nombre), el('small', {}, ` ${it.detalle} · stock ${it.stock}`)),
          el('div', { clase: 'contador' },
            el('button', { type: 'button', clase: 'boton-icono', 'aria-label': 'Restar uno', onClick: () => {
              if (it.cantidad > 1) it.cantidad -= 1; else carrito.items.splice(i, 1);
              dibujarCarrito();
            } }, '−'),
            el('span', { clase: 'contador__valor' }, String(it.cantidad)),
            el('button', { type: 'button', clase: 'boton-icono', 'aria-label': 'Sumar uno', onClick: () => {
              if (it.cantidad + 1 > it.stock) { avisar(`Solo hay ${it.stock} en stock.`, 'error'); return; }
              it.cantidad += 1; dibujarCarrito();
            } }, '+')),
          el('label', { clase: 'mini-campo' }, 'Precio c/u',
            el('input', { type: 'text', inputmode: 'decimal', maxlength: 12, clase: 'entrada-media', value: it.precio,
              onInput: (e) => { it.precio = e.target.value; dibujarTotales(); } })),
          it.mayorista ? el('button', { type: 'button', clase: 'boton boton--texto boton--mini', onClick: () => {
            it.precio = String(it.mayorista).replace('.', ','); dibujarCarrito();
          } }, 'Mayorista') : null
        )))));
    }
    dibujarTotales();
  }

  // ----- Datos de la venta -----
  const selCliente = campo({ etiqueta: 'Cliente (opcional)', tipo: 'select', vacio: 'Sin cliente', opciones: clientes.map((c) => [c.id, c.nombre]) });
  selCliente.valor = carrito.clienteId;
  selCliente.entrada.addEventListener('change', () => { carrito.clienteId = selCliente.valor; dibujarTotales(); });
  const botonCliente = el('button', { type: 'button', clase: 'boton boton--texto', onClick: async () => {
    const r = await formularioDialogo({ titulo: 'Nuevo cliente', campos: [
      { clave: 'nombre', etiqueta: 'Nombre', max: 60 }, { clave: 'whatsapp', etiqueta: 'WhatsApp (opcional)', tipo: 'tel', max: 20 }] });
    if (!r) return;
    try {
      const nombre = validar.texto('nombre', r.nombre, { obligatorio: true, max: 60, etiqueta: 'El nombre' });
      const whatsapp = validar.whatsapp('whatsapp', r.whatsapp);
      const nuevo = await crear('clientes', { nombre, whatsapp, instagram: '', talles: '', notas: '' });
      selCliente.entrada.append(el('option', { value: nuevo.id }, nuevo.nombre));
      selCliente.valor = nuevo.id;
      carrito.clienteId = nuevo.id;
      avisar('Cliente agregado');
      dibujarTotales();
    } catch (error) { avisar(error.message, 'error'); }
  } }, '+ Nuevo cliente');

  const selCanal = campo({ etiqueta: 'Canal', tipo: 'select', opciones: canales });
  selCanal.valor = canales.includes(carrito.canal) ? carrito.canal : canales[0] || '';
  carrito.canal = selCanal.valor;
  selCanal.entrada.addEventListener('change', () => { carrito.canal = selCanal.valor; });

  const campoEnvio = campo({ etiqueta: 'Costo del envío', tipo: 'dinero', prefijo: '$', valor: carrito.costoEnvio });
  campoEnvio.entrada.addEventListener('input', () => { carrito.costoEnvio = campoEnvio.valor; dibujarTotales(); });
  const mostrarEnvio = () => campoEnvio.nodo.classList.toggle('oculto', carrito.entrega !== 'Envío con costo');
  const selectorEntrega = el('div', { clase: 'segmentado segmentado--columna', role: 'radiogroup', 'aria-label': 'Entrega' },
    entregas.map((e) => el('label', {}, el('input', { type: 'radio', name: 'entrega', value: e, checked: carrito.entrega === e,
      onChange: () => { carrito.entrega = e; mostrarEnvio(); dibujarTotales(); } }), e)));
  mostrarEnvio();

  const campoDescuento = campo({ etiqueta: 'Descuento sobre el total', tipo: 'dinero', prefijo: '$', valor: carrito.descuento });
  campoDescuento.entrada.addEventListener('input', () => { carrito.descuento = campoDescuento.valor; dibujarTotales(); });

  const campoEfectivo = campo({ etiqueta: 'Efectivo', tipo: 'dinero', prefijo: '$', valor: carrito.efectivo });
  const campoTransf = campo({ etiqueta: 'Transferencia', tipo: 'dinero', prefijo: '$', valor: carrito.transferencia });
  campoEfectivo.entrada.addEventListener('input', () => { carrito.efectivo = campoEfectivo.valor; dibujarTotales(); });
  campoTransf.entrada.addEventListener('input', () => { carrito.transferencia = campoTransf.valor; dibujarTotales(); });

  const campoNota = campo({ etiqueta: 'Nota para el comprobante (opcional)', max: 120, valor: carrito.nota });
  campoNota.entrada.addEventListener('input', () => { carrito.nota = campoNota.valor; });
  const campoFecha = campo({ etiqueta: 'Fecha', tipo: 'date', valor: carrito.fecha || fechaParaInput() });
  campoFecha.entrada.addEventListener('change', () => { carrito.fecha = campoFecha.valor; });

  function calcular() {
    const subtotal = carrito.items.reduce((s, it) => s + it.cantidad * (leerNumero(it.precio) || 0), 0);
    const descuento = leerNumero(carrito.descuento) || 0;
    const envio = carrito.entrega === 'Envío con costo' ? (leerNumero(carrito.costoEnvio) || 0) : 0;
    const total = redondear(subtotal - descuento + envio);
    const pagado = (leerNumero(carrito.efectivo) || 0) + (leerNumero(carrito.transferencia) || 0);
    return { subtotal, descuento, envio, total, pagado: redondear(pagado), saldo: redondear(total - pagado) };
  }

  function dibujarTotales() {
    const t = calcular();
    montar(zonaTotales,
      el('div', { clase: 'linea' }, el('span', {}, 'Subtotal'), el('span', {}, pesos(t.subtotal))),
      t.descuento ? el('div', { clase: 'linea' }, el('span', {}, 'Descuento'), el('span', {}, `− ${pesos(t.descuento)}`)) : null,
      carrito.entrega !== 'Retira' ? el('div', { clase: 'linea' }, el('span', {}, 'Envío'), el('span', {}, t.envio ? pesos(t.envio) : 'Gratis')) : null,
      el('div', { clase: 'linea linea--total' }, el('span', {}, 'Total'), el('span', {}, pesos(t.total))),
      t.pagado ? el('div', { clase: 'linea' }, el('span', {}, 'Cobrado'), el('span', {}, pesos(t.pagado))) : null,
      t.saldo > 0 && t.pagado ? el('div', { clase: 'linea texto-alerta' }, el('span', {}, carrito.clienteId ? 'Queda debiendo' : 'Falta cobrar'), el('span', {}, pesos(t.saldo))) : null,
      t.saldo < 0 ? el('div', { clase: 'linea texto-alerta' }, el('span', {}, 'Cobraste de más'), el('span', {}, pesos(-t.saldo))) : null
    );
  }

  const todoEn = (medio) => () => {
    const { total } = calcular();
    carrito.efectivo = medio === 'efectivo' ? String(total).replace('.', ',') : '';
    carrito.transferencia = medio === 'transferencia' ? String(total).replace('.', ',') : '';
    campoEfectivo.valor = carrito.efectivo;
    campoTransf.valor = carrito.transferencia;
    dibujarTotales();
  };

  async function cobrar(e) {
    const boton = e.currentTarget;
    if (!carrito.items.length) { avisar('Agregá al menos un producto.', 'error'); return; }
    for (const it of carrito.items) {
      if (!(leerNumero(it.precio) >= 0)) { avisar(`Precio no válido en ${it.nombre}.`, 'error'); return; }
    }
    const t = calcular();
    if (!(t.descuento >= 0)) { avisar('Descuento no válido.', 'error'); return; }
    if (t.pagado === 0 && !carrito.clienteId) {
      avisar('Indicá cuánto te pagó (efectivo o transferencia).', 'error'); return;
    }
    if (t.saldo > 0 && !carrito.clienteId) { avisar(`Faltan ${pesos(t.saldo)}. Para dejarlo a cuenta (fiado), elegí un cliente.`, 'error'); return; }
    if (t.saldo > 0) {
      const cliente = clientes.find((c) => c.id === carrito.clienteId) || { nombre: 'el cliente' };
      if (!await confirmar({ titulo: 'Venta con saldo pendiente', mensaje: `${cliente.nombre} queda debiendo ${pesos(t.saldo)}. ¿Confirmás?`, aceptar: 'Confirmar' })) return;
    }
    boton.disabled = true;
    try {
      const cliente = clientes.find((c) => c.id === carrito.clienteId);
      const pagos = [];
      if (leerNumero(carrito.efectivo) > 0) pagos.push({ medio: 'Efectivo', monto: leerNumero(carrito.efectivo) });
      if (leerNumero(carrito.transferencia) > 0) pagos.push({ medio: 'Transferencia', monto: leerNumero(carrito.transferencia) });
      const venta = await registrarVenta({
        fecha: fechaDesdeInput(carrito.fecha || fechaParaInput()),
        clienteId: carrito.clienteId || '',
        clienteNombre: cliente?.nombre || '',
        canal: carrito.canal,
        entrega: carrito.entrega,
        costoEnvio: t.envio,
        descuento: t.descuento,
        nota: carrito.nota.trim().slice(0, 120)
      }, carrito.items.map((it) => ({ varianteId: it.varianteId, cantidad: it.cantidad, precioUnit: leerNumero(it.precio) })), pagos);
      carrito = nuevoCarrito();
      avisar(`Venta N° ${venta.numero} registrada`);
      location.hash = `#/ventas/v/${venta.id}`;
    } catch (error) {
      avisar(error.message || 'No se pudo registrar la venta.', 'error');
      boton.disabled = false;
    }
  }

  montar(contenedor,
    pestanasVentas('nueva'),
    el('h1', { clase: 'titulo-pantalla' }, 'Nueva venta'),
    el('div', { clase: 'tarjeta' },
      crearSelector({ catalogo: cat, soloConStock: true, alElegir: agregar }),
      zonaCarrito),
    el('div', { clase: 'tarjeta' },
      selCliente.nodo, botonCliente,
      el('div', { clase: 'dos-columnas' }, selCanal.nodo, campoFecha.nodo),
      el('div', { clase: 'campo' }, el('span', { clase: 'campo__etiqueta' }, 'Entrega'), selectorEntrega),
      campoEnvio.nodo,
      campoDescuento.nodo),
    el('div', { clase: 'tarjeta' },
      el('h2', { clase: 'campo__etiqueta' }, 'Cobro'),
      el('div', { clase: 'botonera' },
        el('button', { type: 'button', clase: 'boton boton--chico boton--secundario', onClick: todoEn('efectivo') }, 'Todo en efectivo'),
        el('button', { type: 'button', clase: 'boton boton--chico boton--secundario', onClick: todoEn('transferencia') }, 'Todo por transferencia')),
      el('div', { clase: 'dos-columnas' }, campoEfectivo.nodo, campoTransf.nodo),
      el('p', { clase: 'campo__ayuda' }, 'Si te paga una parte, cargá lo que pagó: el resto queda como deuda del cliente.'),
      campoNota.nodo),
    zonaTotales,
    el('div', { clase: 'botonera' },
      el('button', { type: 'button', clase: 'boton boton--grande', onClick: cobrar }, 'Registrar venta'),
      carrito.items.length ? el('button', { type: 'button', clase: 'boton boton--texto', onClick: async () => {
        if (await confirmar({ titulo: '¿Vaciar la venta?', aceptar: 'Vaciar' })) { carrito = nuevoCarrito(); nuevaVenta(contenedor); }
      } }, 'Vaciar') : null)
  );
  dibujarCarrito();
}

/* =========================================================
   Historial
   ========================================================= */
async function historial(contenedor) {
  const todas = (await listar('ventas')).sort((a, b) => b.fecha.localeCompare(a.fecha));
  const zona = el('div');

  function dibujar() {
    const desde = periodoHistorial === 'todas' ? '' : inicioPeriodo(periodoHistorial).toISOString();
    const t = normalizar(busquedaHistorial);
    const ventas = todas.filter((v) => v.fecha >= desde)
      .filter((v) => !t || normalizar(`${v.numero} ${v.clienteNombre} ${v.canal}`).includes(t));
    const activas = ventas.filter((v) => v.estado !== 'anulada');
    montar(zona,
      el('div', { clase: 'tarjeta' }, el('div', { clase: 'linea linea--total' },
        el('span', {}, `${activas.length} ${activas.length === 1 ? 'venta' : 'ventas'}`),
        el('span', {}, pesos(activas.reduce((s, v) => s + v.total, 0))))),
      ventas.length ? el('ul', { clase: 'lista' }, ventas.map((v) => el('li', {},
        el('a', { href: `#/ventas/v/${v.id}`, clase: 'lista__item' },
          el('span', {}, `N° ${v.numero} · ${v.clienteNombre || 'Sin cliente'}`,
            el('small', {}, `${fechaHora(v.fecha)} · ${v.canal || ''}`)),
          el('span', { clase: 'lista__monto' }, pesos(v.total),
            v.estado === 'anulada' ? el('small', { clase: 'texto-alerta' }, 'Anulada')
              : v.saldo > 0 ? el('small', { clase: 'texto-alerta' }, `Debe ${pesos(v.saldo)}`) : null))))) :
        el('p', { clase: 'vacio' }, 'No hay ventas en este período.'));
  }

  const chip = (valor, texto) => el('button', { type: 'button', clase: 'filtro', 'aria-pressed': String(periodoHistorial === valor),
    onClick: (e) => {
      periodoHistorial = valor;
      e.currentTarget.parentElement.querySelectorAll('.filtro').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget)));
      dibujar();
    } }, texto);

  montar(contenedor,
    pestanasVentas('historial'),
    el('h1', { clase: 'titulo-pantalla' }, 'Historial de ventas'),
    el('div', { clase: 'buscador' }, el('input', { type: 'search', placeholder: 'Buscar por número o cliente…', 'aria-label': 'Buscar ventas',
      value: busquedaHistorial, onInput: (e) => { busquedaHistorial = e.target.value; dibujar(); } })),
    el('div', { clase: 'filtros' }, chip('dia', 'Hoy'), chip('semana', 'Semana'), chip('mes', 'Mes'), chip('todas', 'Todas')),
    zona);
  dibujar();
}

/* =========================================================
   Detalle de venta
   ========================================================= */
async function detalleVenta(contenedor, id) {
  const venta = await obtener('ventas', id);
  if (!venta) { montar(contenedor, volver('#/ventas/historial'), el('p', {}, 'No se encontró la venta.')); return; }
  const [items, pagos, negocio, cliente] = await Promise.all([
    leerPorIndice('ventas_items', 'ventaId', id),
    leerPorIndice('pagos', 'ventaId', id),
    leerUnico('negocio'),
    venta.clienteId ? obtener('clientes', venta.clienteId) : null
  ]);
  items.sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
  const datos = { venta, items, pagos, negocio, cliente };
  const nombreArchivo = `comprobante_${String(venta.numero).padStart(5, '0')}.png`;

  async function compartirImagen() {
    try {
      const blob = await generarComprobante(datos);
      const r = await compartirODescargar(nombreArchivo, blob, { titulo: `Comprobante N° ${venta.numero}` });
      if (r === 'descargado') avisar('Imagen descargada. Adjuntala en WhatsApp.');
    } catch (error) { avisar(error.message, 'error'); }
  }
  async function descargarImagen() {
    try { descargar(nombreArchivo, await generarComprobante(datos)); } catch (error) { avisar(error.message, 'error'); }
  }
  function enviarTexto() {
    abrirWhatsApp(cliente?.whatsapp || '', textoComprobante(datos));
  }

  async function anular() {
    const motivo = await pedirTexto({ titulo: `Anular venta N° ${venta.numero}`, etiqueta: 'Motivo', max: 80 });
    if (motivo === null) return;
    if (!motivo.trim()) { avisar('Escribí el motivo.', 'error'); return; }
    if (!await confirmar({ titulo: '¿Anular la venta?', mensaje: 'Los productos vuelven al stock y se cancela la deuda que haya generado. La venta queda registrada como anulada.', aceptar: 'Anular', peligro: true })) return;
    try { await anularVenta(id, motivo.trim().slice(0, 80)); avisar('Venta anulada'); detalleVenta(contenedor, id); }
    catch (error) { avisar(error.message, 'error'); }
  }

  async function cambio(item) {
    const cat = await cargarCatalogo();
    const opciones = (cat.variantesPorProducto.get(item.productoId) || [])
      .filter((v) => v.id !== item.varianteId && v.stock >= item.cantidad)
      .map((v) => [v.id, `${textoVariante(v)} (stock ${v.stock})`]);
    if (!opciones.length) { avisar('No hay otros talles o colores con stock de este producto.', 'error'); return; }
    const r = await formularioDialogo({
      titulo: `Cambio de ${item.descripcion}`,
      mensaje: `Ahora: ${[item.talle ? `Talle ${item.talle}` : '', item.color].filter(Boolean).join(' · ') || 'Único'}. El precio no cambia.`,
      campos: [{ clave: 'variante', etiqueta: 'Cambiar por', tipo: 'select', opciones }],
      aceptar: 'Hacer el cambio'
    });
    if (!r?.variante) return;
    try { await cambiarVariante(item.id, r.variante); avisar('Cambio registrado'); detalleVenta(contenedor, id); }
    catch (error) { avisar(error.message, 'error'); }
  }

  const anulada = venta.estado === 'anulada';
  montar(contenedor,
    volver('#/ventas/historial'),
    el('h1', { clase: 'titulo-pantalla' }, `Venta N° ${venta.numero}`),
    el('p', { clase: 'campo__ayuda' }, [fechaHora(venta.fecha), venta.canal, venta.entrega].filter(Boolean).join(' · ')),
    anulada ? el('div', { clase: 'alerta' }, `Anulada el ${fecha(venta.anuladaEn || venta.modificadoEn)}: ${venta.motivoAnulacion || ''}`) : null,
    cliente ? el('p', {}, 'Cliente: ', el('a', { href: `#/mas/clientes/${cliente.id}` }, cliente.nombre)) : null,
    el('ul', { clase: 'lista-simple' }, items.map((it) => el('li', {},
      el('span', {}, el('strong', {}, it.descripcion),
        el('small', {}, [it.talle ? `Talle ${it.talle}` : '', it.color, `${it.cantidad} × ${pesos(it.precioUnit)}`].filter(Boolean).join(' · ')),
        it.cambios?.length ? el('small', {}, `Cambiado: ${it.cambios.map((c) => `${c.de} → ${c.a}`).join(', ')}`) : null,
        !anulada ? el('button', { type: 'button', clase: 'boton boton--texto boton--mini', onClick: () => cambio(it) }, 'Cambio de talle/color') : null),
      el('strong', {}, pesos(it.subtotal))))),
    el('div', { clase: 'tarjeta totales' },
      el('div', { clase: 'linea' }, el('span', {}, 'Subtotal'), el('span', {}, pesos(venta.subtotal))),
      venta.descuento ? el('div', { clase: 'linea' }, el('span', {}, 'Descuento'), el('span', {}, `− ${pesos(venta.descuento)}`)) : null,
      venta.entrega !== 'Retira' ? el('div', { clase: 'linea' }, el('span', {}, 'Envío'), el('span', {}, venta.costoEnvio ? pesos(venta.costoEnvio) : 'Gratis')) : null,
      el('div', { clase: 'linea linea--total' }, el('span', {}, 'Total'), el('span', {}, pesos(venta.total))),
      pagos.map((p) => el('div', { clase: 'linea' }, el('span', {}, p.medio), el('span', {}, pesos(p.monto)))),
      venta.saldo > 0 ? el('div', { clase: 'linea texto-alerta' }, el('span', {}, 'Saldo que quedó debiendo'), el('span', {}, pesos(venta.saldo))) : null,
      el('div', { clase: 'linea campo__ayuda' }, el('span', {}, 'Ganancia de esta venta'), el('span', {}, pesos(venta.total - venta.costoTotal)))),
    venta.nota ? el('p', { clase: 'campo__ayuda' }, `Nota: ${venta.nota}`) : null,
    el('h2', { clase: 'subtitulo' }, 'Comprobante'),
    el('div', { clase: 'botonera' },
      el('button', { type: 'button', clase: 'boton', onClick: compartirImagen }, 'Compartir imagen'),
      el('button', { type: 'button', clase: 'boton boton--secundario', onClick: enviarTexto }, 'Enviar por WhatsApp'),
      el('button', { type: 'button', clase: 'boton boton--texto', onClick: descargarImagen }, 'Descargar')),
    el('div', { clase: 'botonera' },
      el('a', { href: '#/ventas', clase: 'boton boton--secundario' }, '+ Otra venta')),
    !anulada ? el('div', { clase: 'botonera botonera--fin' },
      el('button', { type: 'button', clase: 'boton boton--texto texto-peligro', onClick: anular }, 'Anular venta')) : null
  );
}
