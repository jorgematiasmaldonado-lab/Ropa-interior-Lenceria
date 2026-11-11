/*
 * Reportes: ventas, ganancia, lo más vendido, inventario y deudas, por período.
 */
import { el, montar } from '../util/dom.js';
import { pesos, fecha, fechaHora, inicioPeriodo, fechaParaInput } from '../util/formato.js';
import { volver } from '../util/formulario.js';
import { listar } from '../datos/repositorios.js';
import { cargarCatalogo, nombreCategoria, textoVariante } from '../datos/catalogo.js';
import { calcularSaldos } from '../datos/operaciones.js';
import { descargarCSV } from '../util/csv.js';
import { avisar } from '../util/avisos.js';

let periodo = 'mes';
let desdeElegido = '';
let hastaElegido = '';

function rango() {
  const hoy = new Date();
  if (periodo === 'personalizado' && desdeElegido) {
    const [a, m, d] = desdeElegido.split('-').map(Number);
    const desde = new Date(a, m - 1, d);
    let hasta = new Date(8.64e15);
    if (hastaElegido) { const [a2, m2, d2] = hastaElegido.split('-').map(Number); hasta = new Date(a2, m2 - 1, d2 + 1); }
    return { desde, hasta, titulo: `${fecha(desde)} al ${hastaElegido ? fecha(new Date(hasta - 1)) : 'hoy'}` };
  }
  if (periodo === 'mesAnterior') {
    const desde = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
    return { desde, hasta: new Date(hoy.getFullYear(), hoy.getMonth(), 1), titulo: desde.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }) };
  }
  if (periodo === 'anio') return { desde: new Date(hoy.getFullYear(), 0, 1), hasta: new Date(8.64e15), titulo: `Año ${hoy.getFullYear()}` };
  const titulos = { dia: 'Hoy', semana: 'Esta semana', mes: hoy.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }) };
  return { desde: inicioPeriodo(periodo), hasta: new Date(8.64e15), titulo: titulos[periodo] };
}

export async function mostrar(contenedor) {
  const [cat, ventas, items, pagos, gastos, compras, cuentas, clientes] = await Promise.all([
    cargarCatalogo(), listar('ventas'), listar('ventas_items'), listar('pagos'), listar('gastos'), listar('compras'), listar('cuenta_clientes'), listar('clientes')
  ]);
  const zona = el('div', { id: 'reporte' });

  function dibujar() {
    const { desde, hasta, titulo } = rango();
    const enRango = (f) => { const d = new Date(f); return d >= desde && d < hasta; };
    const vs = ventas.filter((v) => v.estado !== 'anulada' && enRango(v.fecha));
    const idsVentas = new Set(vs.map((v) => v.id));
    const its = items.filter((i) => idsVentas.has(i.ventaId));
    const gs = gastos.filter((g) => enRango(g.fecha));
    const cs = compras.filter((c) => c.estado !== 'anulada' && enRango(c.fecha));
    const ps = pagos.filter((p) => enRango(p.fecha));

    const totalVentas = vs.reduce((s, v) => s + v.total, 0);
    const costoVendido = vs.reduce((s, v) => s + v.costoTotal, 0);
    const totalGastos = gs.reduce((s, g) => s + g.montoArs, 0);
    const totalCompras = cs.reduce((s, c) => s + c.totalArs, 0);
    const unidades = its.reduce((s, i) => s + i.cantidad, 0);
    const gananciaBruta = totalVentas - costoVendido;
    const gananciaNeta = gananciaBruta - totalGastos;
    const cobrado = ps.reduce((s, p) => s + p.monto, 0);

    const agrupar = (lista, clave, valor) => {
      const m = new Map();
      for (const x of lista) { const k = clave(x) || 'Sin dato'; m.set(k, (m.get(k) || 0) + valor(x)); }
      return [...m.entries()].sort((a, b) => b[1] - a[1]);
    };
    const porMedio = agrupar(ps, (p) => p.medio, (p) => p.monto);
    const porCanal = agrupar(vs, (v) => v.canal, (v) => v.total);
    const porGenero = agrupar(its, (i) => cat.categoriaPorId.get(i.categoriaId)?.genero, (i) => i.subtotal);
    const porCategoria = agrupar(its, (i) => nombreCategoria(i.categoriaId, cat.categoriaPorId), (i) => i.subtotal);
    const porTalle = agrupar(its, (i) => i.talle, (i) => i.cantidad);
    const porMarca = agrupar(its, (i) => i.marca, (i) => i.subtotal);
    const masVendidos = agrupar(its, (i) => i.descripcion, (i) => i.cantidad).slice(0, 10);

    const vendidos = new Set(its.map((i) => i.productoId));
    const sinVentas = cat.productos.filter((p) => !vendidos.has(p.id) && (cat.variantesPorProducto.get(p.id) || []).some((v) => v.stock > 0)).slice(0, 10);

    const valorCosto = cat.variantes.reduce((s, v) => s + v.stock * (v.costo || 0), 0);
    const valorVenta = cat.variantes.reduce((s, v) => {
      const p = cat.productoPorId.get(v.productoId);
      return s + v.stock * (v.precio ?? p?.precio ?? 0);
    }, 0);
    const unidadesStock = cat.variantes.reduce((s, v) => s + v.stock, 0);
    const saldos = calcularSaldos(cuentas);
    const deudaTotal = [...saldos.values()].filter((x) => x > 0).reduce((s, x) => s + x, 0);
    const deudores = [...saldos.entries()].filter(([, s]) => s > 0).length;

    montar(zona,
      el('h2', { clase: 'subtitulo subtitulo--periodo' }, titulo.charAt(0).toUpperCase() + titulo.slice(1)),
      el('div', { clase: 'kpis' },
        kpi('Ventas', pesos(totalVentas), `${vs.length} ${vs.length === 1 ? 'venta' : 'ventas'} · ${unidades} ${unidades === 1 ? 'prenda' : 'prendas'}`),
        kpi('Ganancia neta', pesos(gananciaNeta), 'ventas − costo − gastos', gananciaNeta >= 0 ? 'texto-exito' : 'texto-alerta'),
        kpi('Ticket promedio', vs.length ? pesos(totalVentas / vs.length) : '—', ''),
        kpi('Cobrado', pesos(cobrado), 'efectivo + transferencias')),
      el('div', { clase: 'tarjeta totales' },
        linea('Ventas', pesos(totalVentas)),
        linea('Costo de lo vendido', `− ${pesos(costoVendido)}`),
        linea('Ganancia bruta', pesos(gananciaBruta), true),
        linea('Gastos', `− ${pesos(totalGastos)}`),
        linea('Ganancia neta', pesos(gananciaNeta), true),
        el('div', { clase: 'linea campo__ayuda' }, el('span', {}, 'Compras de mercadería (inversión en stock)'), el('span', {}, pesos(totalCompras)))),
      seccion('Cobros por medio de pago', barras(porMedio, pesos)),
      seccion('Ventas por canal', barras(porCanal, pesos)),
      seccion('Dama / Caballero', barras(porGenero, pesos)),
      seccion('Por categoría', barras(porCategoria, pesos)),
      seccion('Por marca', barras(porMarca, pesos)),
      seccion('Prendas vendidas por talle', barras(porTalle, (n) => `${n} u.`)),
      seccion('Más vendidos', barras(masVendidos, (n) => `${n} u.`)),
      seccion('Con stock y sin ventas en el período', sinVentas.length
        ? el('ul', { clase: 'lista-simple' }, sinVentas.map((p) => el('li', {}, el('a', { href: `#/inventario/p/${p.id}` }, p.nombre),
          el('small', {}, `${(cat.variantesPorProducto.get(p.id) || []).reduce((s, v) => s + v.stock, 0)} u.`))))
        : el('p', { clase: 'vacio' }, 'Todo lo que tiene stock se vendió al menos una vez.')),
      el('h2', { clase: 'subtitulo' }, 'Hoy'),
      el('div', { clase: 'kpis' },
        kpi('Inventario a costo', pesos(valorCosto), `${unidadesStock} prendas`),
        kpi('Inventario a precio de venta', pesos(valorVenta), ''),
        kpi('Te deben', pesos(deudaTotal), `${deudores} ${deudores === 1 ? 'cliente' : 'clientes'}`, deudaTotal ? 'texto-alerta' : ''))
    );

    // Datos para exportar
    zona.datos = { vs, its, gs, cs, titulo };
  }

  const chip = (valor, texto) => el('button', { type: 'button', clase: 'filtro', 'aria-pressed': String(periodo === valor),
    onClick: (e) => {
      periodo = valor;
      e.currentTarget.parentElement.querySelectorAll('.filtro').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget)));
      zonaFechas.classList.toggle('oculto', valor !== 'personalizado');
      dibujar();
    } }, texto);

  const entradaDesde = el('input', { type: 'date', value: desdeElegido || fechaParaInput(new Date(new Date().getFullYear(), new Date().getMonth(), 1)), 'aria-label': 'Desde',
    onChange: (e) => { desdeElegido = e.target.value; dibujar(); } });
  const entradaHasta = el('input', { type: 'date', value: hastaElegido, 'aria-label': 'Hasta', onChange: (e) => { hastaElegido = e.target.value; dibujar(); } });
  if (!desdeElegido) desdeElegido = entradaDesde.value;
  const zonaFechas = el('div', { clase: `dos-columnas ${periodo === 'personalizado' ? '' : 'oculto'}` },
    el('label', { clase: 'campo' }, el('span', { clase: 'campo__etiqueta' }, 'Desde'), entradaDesde),
    el('label', { clase: 'campo' }, el('span', { clase: 'campo__etiqueta' }, 'Hasta'), entradaHasta));

  const nombresClientes = new Map(clientes.map((c) => [c.id, c.nombre]));
  const exportar = (tipo) => () => {
    const d = zona.datos;
    if (!d) return;
    if (tipo === 'ventas') {
      const ventaPorId = new Map(d.vs.map((v) => [v.id, v]));
      descargarCSV('ventas_detalle', d.its, [
        ['N° venta', (i) => ventaPorId.get(i.ventaId)?.numero], ['Fecha', (i) => fechaHora(ventaPorId.get(i.ventaId)?.fecha)],
        ['Cliente', (i) => nombresClientes.get(ventaPorId.get(i.ventaId)?.clienteId) || ventaPorId.get(i.ventaId)?.clienteNombre || ''],
        ['Canal', (i) => ventaPorId.get(i.ventaId)?.canal], ['Producto', 'descripcion'], ['Marca', 'marca'],
        ['Categoría', (i) => nombreCategoria(i.categoriaId, cat.categoriaPorId)], ['Talle', 'talle'], ['Color', 'color'],
        ['Cantidad', 'cantidad'], ['Precio unitario', 'precioUnit'], ['Subtotal', 'subtotal'], ['Costo unitario', 'costoUnit'],
        ['Ganancia', (i) => Math.round((i.subtotal - i.costoUnit * i.cantidad) * 100) / 100]
      ]);
    } else if (tipo === 'gastos') {
      descargarCSV('gastos', d.gs, [['Fecha', (g) => fecha(g.fecha)], ['Categoría', 'categoria'], ['Descripción', 'descripcion'],
        ['Moneda', 'moneda'], ['Monto original', 'montoOriginal'], ['Cotización', 'cotizacion'], ['Monto en pesos', 'montoArs'], ['Pagado con', 'medio']]);
    } else if (tipo === 'compras') {
      descargarCSV('compras', d.cs, [['Fecha', (c) => fecha(c.fecha)], ['Proveedor', 'proveedorNombre'], ['Moneda', 'moneda'],
        ['Total original', 'totalOriginal'], ['Cotización', 'cotizacion'], ['Gastos adicionales', 'adicionalesArs'], ['Total en pesos', 'totalArs'], ['Nota', 'nota']]);
    } else if (tipo === 'stock') {
      descargarCSV('inventario', cat.variantes, [
        ['Producto', (v) => cat.productoPorId.get(v.productoId)?.nombre], ['Marca', (v) => cat.productoPorId.get(v.productoId)?.marca],
        ['Categoría', (v) => nombreCategoria(cat.productoPorId.get(v.productoId)?.categoriaId, cat.categoriaPorId)],
        ['Variante', (v) => textoVariante(v)], ['Stock', 'stock'], ['Costo', 'costo'],
        ['Precio', (v) => v.precio ?? cat.productoPorId.get(v.productoId)?.precio]]);
    }
    avisar('Archivo descargado');
  };

  montar(contenedor,
    volver('#/mas'),
    el('h1', { clase: 'titulo-pantalla' }, 'Reportes'),
    el('div', { clase: 'filtros no-imprimir' }, chip('dia', 'Hoy'), chip('semana', 'Semana'), chip('mes', 'Mes'), chip('mesAnterior', 'Mes anterior'), chip('anio', 'Año'), chip('personalizado', 'Elegir fechas')),
    zonaFechas,
    zona,
    el('h2', { clase: 'subtitulo no-imprimir' }, 'Exportar'),
    el('div', { clase: 'botonera no-imprimir' },
      el('button', { type: 'button', clase: 'boton boton--secundario boton--chico', onClick: exportar('ventas') }, 'Ventas (Excel)'),
      el('button', { type: 'button', clase: 'boton boton--secundario boton--chico', onClick: exportar('gastos') }, 'Gastos (Excel)'),
      el('button', { type: 'button', clase: 'boton boton--secundario boton--chico', onClick: exportar('compras') }, 'Compras (Excel)'),
      el('button', { type: 'button', clase: 'boton boton--secundario boton--chico', onClick: exportar('stock') }, 'Inventario (Excel)'),
      el('button', { type: 'button', clase: 'boton boton--chico', onClick: () => window.print() }, 'Imprimir / PDF')),
    el('p', { clase: 'campo__ayuda no-imprimir' }, 'Los archivos de Excel se abren también con Google Sheets. Para PDF, en la ventana de impresión elegí "Guardar como PDF".')
  );
  dibujar();
}

function kpi(etiqueta, valor, detalle, clase = '') {
  return el('div', { clase: 'kpi' }, el('span', { clase: 'balance__etiqueta' }, etiqueta), el('strong', { clase: `kpi__valor ${clase}` }, valor), detalle ? el('small', {}, detalle) : null);
}
function linea(etiqueta, valor, fuerte = false) {
  return el('div', { clase: `linea ${fuerte ? 'linea--total' : ''}` }, el('span', {}, etiqueta), el('span', {}, valor));
}
function seccion(titulo, contenido) {
  return el('section', { clase: 'tarjeta' }, el('h3', { clase: 'campo__etiqueta' }, titulo), contenido);
}
function barras(datos, formato) {
  if (!datos.length) return el('p', { clase: 'vacio' }, 'Sin datos en este período.');
  const max = Math.max(...datos.map(([, v]) => v), 1);
  return el('ul', { clase: 'barras' }, datos.map(([etiqueta, valor]) => {
    const barra = el('span', { clase: 'barra__relleno' });
    barra.style.width = `${Math.max(2, (valor / max) * 100)}%`;
    return el('li', { clase: 'barra' },
      el('span', { clase: 'barra__etiqueta' }, etiqueta),
      el('span', { clase: 'barra__pista' }, barra),
      el('span', { clase: 'barra__valor' }, formato(valor)));
  }));
}
