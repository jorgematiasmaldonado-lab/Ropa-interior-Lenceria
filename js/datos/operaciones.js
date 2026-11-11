/*
 * Operaciones del negocio que tocan varias tablas a la vez.
 * Cada una se hace en UNA transacción: o se guarda todo, o no se guarda nada.
 * Así el stock y el dinero nunca quedan a medias.
 */
import { transaccion, promesa } from './db.js';
import { nuevoId } from './repositorios.js';
import { redondear } from '../util/formato.js';

const ahora = () => new Date().toISOString();

function base(extra = {}) {
  const t = ahora();
  return { id: nuevoId(), creadoEn: t, modificadoEn: t, eliminado: false, version: 1, ...extra };
}

function auditar(tx, accion, tabla, registroId, detalle = null) {
  tx.objectStore('auditoria').add(base({ fecha: ahora(), accion, tabla, registroId, detalle }));
}

function guardarCambio(tx, tabla, registro, cambios) {
  const nuevo = { ...registro, ...cambios, modificadoEn: ahora(), version: (registro.version || 1) + 1 };
  tx.objectStore(tabla).put(nuevo);
  return nuevo;
}

function movimiento(tx, { variante, cantidad, tipo, referenciaId = null, motivo = '', fecha = ahora() }) {
  tx.objectStore('movimientos_stock').add(base({
    varianteId: variante.id,
    productoId: variante.productoId,
    fecha,
    tipo, // inicial | ajuste | compra | venta | anulacion | cambio
    cantidad,
    stockResultante: variante.stock,
    referenciaId,
    motivo
  }));
}

/* =========================================================
   Productos y variantes
   ========================================================= */

/** Crea un producto con sus variantes (talle/color) y el stock inicial. */
export async function crearProducto(producto, variantes) {
  const prod = base({ activo: true, ...producto });
  await transaccion(['productos', 'variantes', 'movimientos_stock', 'auditoria'], 'readwrite', (tx) => {
    tx.objectStore('productos').add(prod);
    auditar(tx, 'crear', 'productos', prod.id);
    for (const v of variantes) agregarVarianteTx(tx, prod, v);
  });
  return prod;
}

function agregarVarianteTx(tx, prod, v) {
  const variante = base({
    productoId: prod.id,
    talle: v.talle || '',
    color: v.color || '',
    sku: v.sku || '',
    stock: Math.max(0, Math.trunc(Number(v.stock) || 0)),
    precio: v.precio ?? null, // null = usa el precio del producto
    costo: redondear(v.costo ?? prod.costo ?? 0),
    activo: true
  });
  tx.objectStore('variantes').add(variante);
  auditar(tx, 'crear', 'variantes', variante.id);
  if (variante.stock > 0) movimiento(tx, { variante, cantidad: variante.stock, tipo: 'inicial', motivo: 'Stock inicial' });
  return variante;
}

/** Agrega variantes nuevas a un producto existente. */
export async function agregarVariantes(productoId, variantes) {
  await transaccion(['productos', 'variantes', 'movimientos_stock', 'auditoria'], 'readwrite', async (tx) => {
    const prod = await promesa(tx.objectStore('productos').get(productoId));
    if (!prod) throw new Error('No se encontró el producto.');
    for (const v of variantes) agregarVarianteTx(tx, prod, v);
  });
}

/**
 * Modifica un producto. Si cambia el costo, se puede aplicar a todas sus variantes.
 */
export async function actualizarProducto(productoId, cambios, { aplicarCosto = false } = {}) {
  return transaccion(['productos', 'variantes', 'auditoria'], 'readwrite', async (tx) => {
    const prod = await promesa(tx.objectStore('productos').get(productoId));
    if (!prod) throw new Error('No se encontró el producto.');
    const nuevo = guardarCambio(tx, 'productos', prod, cambios);
    auditar(tx, 'modificar', 'productos', productoId, { campos: Object.keys(cambios) });
    if (aplicarCosto && cambios.costo !== undefined) {
      const variantes = await promesa(tx.objectStore('variantes').index('productoId').getAll(productoId));
      for (const v of variantes) guardarCambio(tx, 'variantes', v, { costo: redondear(cambios.costo) });
    }
    return nuevo;
  });
}

/** Ajuste manual de stock (conteo, rotura, regalo, etc.). Queda registrado con su motivo. */
export async function ajustarStock(varianteId, nuevoStock, motivo) {
  const cantidad = Math.max(0, Math.trunc(Number(nuevoStock)));
  await transaccion(['variantes', 'movimientos_stock', 'auditoria'], 'readwrite', async (tx) => {
    const v = await promesa(tx.objectStore('variantes').get(varianteId));
    if (!v) throw new Error('No se encontró la variante.');
    const diferencia = cantidad - v.stock;
    if (diferencia === 0) return;
    const nueva = guardarCambio(tx, 'variantes', v, { stock: cantidad });
    movimiento(tx, { variante: nueva, cantidad: diferencia, tipo: 'ajuste', motivo });
    auditar(tx, 'modificar', 'variantes', varianteId, { ajusteStock: diferencia, motivo });
  });
}

/* =========================================================
   Compras (ingreso de mercadería)
   ========================================================= */

/**
 * Registra una compra, suma el stock y recalcula el costo promedio.
 * @param {object} compra - fecha, proveedorId, proveedorNombre, moneda, cotizacion, adicionalesArs, nota
 * @param {Array<{varianteId, cantidad, costoUnitOriginal, descripcion}>} items
 */
export async function registrarCompra(compra, items) {
  if (!items.length) throw new Error('Agregá al menos un producto a la compra.');
  const cotizacion = compra.moneda === 'USD' ? Number(compra.cotizacion) : 1;
  if (!(cotizacion > 0)) throw new Error('Ingresá la cotización del dólar.');

  const subtotalOriginal = redondear(items.reduce((s, it) => s + it.cantidad * it.costoUnitOriginal, 0));
  const subtotalArs = redondear(subtotalOriginal * cotizacion);
  const adicionalesArs = redondear(compra.adicionalesArs || 0);
  const totalArs = redondear(subtotalArs + adicionalesArs);

  const cab = base({
    ...compra,
    cotizacion,
    subtotalOriginal,
    subtotalArs,
    adicionalesArs,
    totalOriginal: compra.moneda === 'USD' ? subtotalOriginal : totalArs,
    totalArs,
    estado: 'activa'
  });

  await transaccion(['compras', 'compras_items', 'variantes', 'productos', 'movimientos_stock', 'auditoria'], 'readwrite', async (tx) => {
    tx.objectStore('compras').add(cab);
    auditar(tx, 'crear', 'compras', cab.id);
    for (const [orden, it] of items.entries()) {
      const v = await promesa(tx.objectStore('variantes').get(it.varianteId));
      if (!v) throw new Error('Una de las variantes ya no existe.');
      const costoArs = it.costoUnitOriginal * cotizacion;
      // Gastos adicionales repartidos según el valor de cada ítem
      const parteAdicional = subtotalArs > 0 ? (costoArs * it.cantidad / subtotalArs) * adicionalesArs / it.cantidad : 0;
      const costoUnitArs = redondear(costoArs + parteAdicional);

      tx.objectStore('compras_items').add(base({
        compraId: cab.id,
        orden,
        varianteId: v.id,
        productoId: v.productoId,
        descripcion: it.descripcion || '',
        cantidad: it.cantidad,
        costoUnitOriginal: redondear(it.costoUnitOriginal),
        costoUnitArs
      }));

      const stockPrevio = Math.max(0, v.stock);
      const costoPromedio = stockPrevio + it.cantidad > 0
        ? redondear((stockPrevio * (v.costo || 0) + it.cantidad * costoUnitArs) / (stockPrevio + it.cantidad))
        : costoUnitArs;
      const nueva = guardarCambio(tx, 'variantes', v, { stock: v.stock + it.cantidad, costo: costoPromedio });
      movimiento(tx, { variante: nueva, cantidad: it.cantidad, tipo: 'compra', referenciaId: cab.id, fecha: cab.fecha });

      const prod = await promesa(tx.objectStore('productos').get(v.productoId));
      if (prod) guardarCambio(tx, 'productos', prod, { costo: costoUnitArs });
    }
  });
  return cab;
}

/** Anula una compra: descuenta el stock que había ingresado. */
export async function anularCompra(compraId, motivo) {
  await transaccion(['compras', 'compras_items', 'variantes', 'movimientos_stock', 'auditoria'], 'readwrite', async (tx) => {
    const c = await promesa(tx.objectStore('compras').get(compraId));
    if (!c || c.estado === 'anulada') throw new Error('La compra no existe o ya está anulada.');
    const items = await promesa(tx.objectStore('compras_items').index('compraId').getAll(compraId));
    for (const it of items) {
      const v = await promesa(tx.objectStore('variantes').get(it.varianteId));
      if (!v) continue;
      const nueva = guardarCambio(tx, 'variantes', v, { stock: Math.max(0, v.stock - it.cantidad) });
      movimiento(tx, { variante: nueva, cantidad: -Math.min(it.cantidad, v.stock), tipo: 'anulacion', referenciaId: compraId, motivo: 'Compra anulada' });
    }
    guardarCambio(tx, 'compras', c, { estado: 'anulada', motivoAnulacion: motivo });
    auditar(tx, 'anular', 'compras', compraId, { motivo });
  });
}

/* =========================================================
   Ventas
   ========================================================= */

/**
 * Registra una venta completa.
 * @param {object} venta - fecha, clienteId, clienteNombre, canal, entrega, costoEnvio, descuento, nota
 * @param {Array<{varianteId, cantidad, precioUnit, descuento}>} items
 * @param {Array<{medio, monto}>} pagos
 * @returns la venta guardada (con su número)
 */
export async function registrarVenta(venta, items, pagos) {
  if (!items.length) throw new Error('Agregá al menos un producto.');
  const subtotal = redondear(items.reduce((s, it) => s + it.cantidad * it.precioUnit - (it.descuento || 0), 0));
  const descuento = redondear(venta.descuento || 0);
  const costoEnvio = redondear(venta.costoEnvio || 0);
  const total = redondear(subtotal - descuento + costoEnvio);
  if (total < 0) throw new Error('El descuento no puede ser mayor que el total.');
  const pagosValidos = pagos.filter((p) => p.monto > 0).map((p) => ({ ...p, monto: redondear(p.monto) }));
  const pagado = redondear(pagosValidos.reduce((s, p) => s + p.monto, 0));
  if (pagado > total + 0.009) throw new Error('Lo cobrado es mayor que el total.');
  const saldo = redondear(total - pagado);
  if (saldo > 0 && !venta.clienteId) throw new Error('Para dejar saldo pendiente (fiado) elegí una clienta.');

  let guardada;
  await transaccion(['ventas', 'ventas_items', 'pagos', 'variantes', 'productos', 'movimientos_stock', 'cuenta_clientes', 'meta', 'auditoria'], 'readwrite', async (tx) => {
    const meta = tx.objectStore('meta');
    const num = await promesa(meta.get('proximoNumeroComprobante'));
    const numero = num?.valor || 1;
    meta.put({ id: 'proximoNumeroComprobante', valor: numero + 1, modificadoEn: ahora() });

    const cab = base({ ...venta, numero, subtotal, descuento, costoEnvio, total, pagado, saldo, costoTotal: 0, estado: 'activa' });
    let costoTotal = 0;

    for (const [orden, it] of items.entries()) {
      const v = await promesa(tx.objectStore('variantes').get(it.varianteId));
      if (!v || v.eliminado) throw new Error('Un producto de la venta ya no existe.');
      const prod = await promesa(tx.objectStore('productos').get(v.productoId));
      if (v.stock < it.cantidad) {
        throw new Error(`No hay stock suficiente de ${prod?.nombre || 'un producto'} ${[v.talle, v.color].filter(Boolean).join(' ')} (quedan ${v.stock}).`);
      }
      const costoUnit = redondear(v.costo || prod?.costo || 0);
      costoTotal += costoUnit * it.cantidad;
      tx.objectStore('ventas_items').add(base({
        ventaId: cab.id,
        orden,
        varianteId: v.id,
        productoId: v.productoId,
        descripcion: prod?.nombre || '',
        marca: prod?.marca || '',
        categoriaId: prod?.categoriaId || '',
        talle: v.talle,
        color: v.color,
        cantidad: it.cantidad,
        precioUnit: redondear(it.precioUnit),
        descuento: redondear(it.descuento || 0),
        subtotal: redondear(it.cantidad * it.precioUnit - (it.descuento || 0)),
        costoUnit
      }));
      const nueva = guardarCambio(tx, 'variantes', v, { stock: v.stock - it.cantidad });
      movimiento(tx, { variante: nueva, cantidad: -it.cantidad, tipo: 'venta', referenciaId: cab.id, fecha: cab.fecha });
    }

    cab.costoTotal = redondear(costoTotal);
    tx.objectStore('ventas').add(cab);
    auditar(tx, 'crear', 'ventas', cab.id, { numero });

    for (const p of pagosValidos) {
      tx.objectStore('pagos').add(base({ ventaId: cab.id, clienteId: venta.clienteId || '', fecha: cab.fecha, medio: p.medio, monto: p.monto, tipo: 'venta' }));
    }
    if (saldo > 0) {
      tx.objectStore('cuenta_clientes').add(base({
        clienteId: venta.clienteId, fecha: cab.fecha, tipo: 'deuda', monto: saldo, ventaId: cab.id, nota: `Venta N° ${numero}`
      }));
    }
    guardada = cab;
  });
  return guardada;
}

/** Anula una venta: devuelve el stock y cancela la deuda que había generado. */
export async function anularVenta(ventaId, motivo) {
  await transaccion(['ventas', 'ventas_items', 'variantes', 'movimientos_stock', 'cuenta_clientes', 'auditoria'], 'readwrite', async (tx) => {
    const venta = await promesa(tx.objectStore('ventas').get(ventaId));
    if (!venta || venta.estado === 'anulada') throw new Error('La venta no existe o ya está anulada.');
    const items = await promesa(tx.objectStore('ventas_items').index('ventaId').getAll(ventaId));
    for (const it of items) {
      const v = await promesa(tx.objectStore('variantes').get(it.varianteId));
      if (!v) continue;
      const nueva = guardarCambio(tx, 'variantes', v, { stock: v.stock + it.cantidad });
      movimiento(tx, { variante: nueva, cantidad: it.cantidad, tipo: 'anulacion', referenciaId: ventaId, motivo: `Venta N° ${venta.numero} anulada` });
    }
    if (venta.saldo > 0 && venta.clienteId) {
      tx.objectStore('cuenta_clientes').add(base({
        clienteId: venta.clienteId, fecha: ahora(), tipo: 'anulacion', monto: venta.saldo, ventaId, nota: `Anulación venta N° ${venta.numero}`
      }));
    }
    guardarCambio(tx, 'ventas', venta, { estado: 'anulada', motivoAnulacion: motivo, anuladaEn: ahora() });
    auditar(tx, 'anular', 'ventas', ventaId, { motivo });
  });
}

/** Cambio de talle/color: devuelve una variante al stock y descuenta otra del mismo producto. */
export async function cambiarVariante(ventaItemId, nuevaVarianteId) {
  await transaccion(['ventas', 'ventas_items', 'variantes', 'movimientos_stock', 'auditoria'], 'readwrite', async (tx) => {
    const item = await promesa(tx.objectStore('ventas_items').get(ventaItemId));
    if (!item) throw new Error('No se encontró el producto de la venta.');
    const venta = await promesa(tx.objectStore('ventas').get(item.ventaId));
    if (venta?.estado === 'anulada') throw new Error('La venta está anulada.');
    if (item.varianteId === nuevaVarianteId) return;
    const vieja = await promesa(tx.objectStore('variantes').get(item.varianteId));
    const nueva = await promesa(tx.objectStore('variantes').get(nuevaVarianteId));
    if (!nueva) throw new Error('No se encontró el nuevo talle/color.');
    if (nueva.stock < item.cantidad) throw new Error(`No hay stock del nuevo talle/color (quedan ${nueva.stock}).`);

    if (vieja) {
      const v1 = guardarCambio(tx, 'variantes', vieja, { stock: vieja.stock + item.cantidad });
      movimiento(tx, { variante: v1, cantidad: item.cantidad, tipo: 'cambio', referenciaId: item.ventaId, motivo: 'Cambio: vuelve al stock' });
    }
    const v2 = guardarCambio(tx, 'variantes', nueva, { stock: nueva.stock - item.cantidad });
    movimiento(tx, { variante: v2, cantidad: -item.cantidad, tipo: 'cambio', referenciaId: item.ventaId, motivo: 'Cambio: sale del stock' });

    guardarCambio(tx, 'ventas_items', item, {
      varianteId: nueva.id, talle: nueva.talle, color: nueva.color,
      cambios: [...(item.cambios || []), { fecha: ahora(), de: [item.talle, item.color].filter(Boolean).join(' '), a: [nueva.talle, nueva.color].filter(Boolean).join(' ') }]
    });
    auditar(tx, 'modificar', 'ventas_items', ventaItemId, { cambio: { de: item.varianteId, a: nueva.id } });
  });
}

/* =========================================================
   Clientes: pagos de deudas
   ========================================================= */
export async function registrarPagoCliente(clienteId, monto, medio, nota = '') {
  const valor = redondear(monto);
  if (!(valor > 0)) throw new Error('Ingresá un monto mayor a cero.');
  await transaccion(['cuenta_clientes', 'pagos', 'auditoria'], 'readwrite', (tx) => {
    const t = ahora();
    const mov = base({ clienteId, fecha: t, tipo: 'pago', monto: valor, medio, nota });
    tx.objectStore('cuenta_clientes').add(mov);
    tx.objectStore('pagos').add(base({ ventaId: '', clienteId, fecha: t, medio, monto: valor, tipo: 'cobro-deuda' }));
    auditar(tx, 'crear', 'cuenta_clientes', mov.id, { pago: valor });
  });
}

/** Saldo de cada clienta: deudas − pagos − anulaciones. */
export function calcularSaldos(movimientos) {
  const saldos = new Map();
  for (const m of movimientos) {
    if (m.eliminado) continue;
    const signo = m.tipo === 'deuda' ? 1 : -1;
    saldos.set(m.clienteId, redondear((saldos.get(m.clienteId) || 0) + signo * m.monto));
  }
  return saldos;
}
