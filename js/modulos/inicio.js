/*
 * Pantalla de Inicio / Balance.
 * Resumen del día, semana o mes + accesos rápidos + alertas.
 */
import { el, icono, montar, ICONOS } from '../util/dom.js';
import { pesos, inicioPeriodo } from '../util/formato.js';
import { listarEntre, listar, leerMeta, leerUnico } from '../datos/repositorios.js';
import { calcularSaldos } from '../datos/operaciones.js';

let periodoElegido = 'dia';

export async function mostrar(contenedor) {
  const negocio = await leerUnico('negocio');

  const zonaBalance = el('div', { clase: 'tarjeta', 'aria-live': 'polite' });
  const botonesPeriodo = [
    ['dia', 'Hoy'], ['semana', 'Semana'], ['mes', 'Mes']
  ].map(([valor, texto]) => el('button', {
    type: 'button',
    clase: 'periodo',
    'aria-pressed': String(valor === periodoElegido),
    onClick: async (e) => {
      periodoElegido = valor;
      for (const b of e.currentTarget.parentElement.children) b.setAttribute('aria-pressed', 'false');
      e.currentTarget.setAttribute('aria-pressed', 'true');
      await dibujarBalance(zonaBalance);
    }
  }, texto));

  const zonaAlertas = el('div');

  montar(contenedor,
    el('h1', { clase: 'titulo-pantalla' }, saludo(negocio?.duena)),
    el('div', { clase: 'periodos', role: 'group', 'aria-label': 'Período del resumen' }, botonesPeriodo),
    zonaBalance,
    el('div', { clase: 'acciones' },
      accion('#/ventas', 'accion--venta', ICONOS.bolsa, 'Nueva venta', 'Cobrar a un cliente'),
      accion('#/gastos/nuevo', 'accion--gasto', ICONOS.billete, 'Nuevo gasto', 'Envíos, publicidad, etc.'),
      accion('#/inventario/compra', 'accion--compra', ICONOS.caja, 'Ingreso de mercadería', 'Compra a proveedor')
    ),
    el('h2', { clase: 'subtitulo' }, 'Avisos'),
    zonaAlertas
  );

  await Promise.all([dibujarBalance(zonaBalance), dibujarAlertas(zonaAlertas)]);
}

function saludo(nombreCompleto) {
  const nombre = (nombreCompleto || '').split(' ')[0];
  const hora = new Date().getHours();
  const parte = hora < 13 ? 'Buen día' : hora < 20 ? 'Buenas tardes' : 'Buenas noches';
  return nombre ? `${parte}, ${nombre}` : parte;
}

function accion(href, clase, trazos, titulo, detalle) {
  return el('a', { href, clase: `accion ${clase}` },
    icono(...trazos),
    el('span', {}, titulo, el('small', {}, detalle))
  );
}

async function dibujarBalance(zona) {
  const desde = inicioPeriodo(periodoElegido).toISOString();
  const hasta = '￿'; // sin límite superior (las fechas se guardan como texto ISO)

  const [ventas, gastos] = await Promise.all([
    listarEntre('ventas', 'fecha', desde, hasta),
    listarEntre('gastos', 'fecha', desde, hasta)
  ]);
  const activas = ventas.filter((v) => v.estado !== 'anulada');
  const totalVentas = activas.reduce((s, v) => s + (Number(v.total) || 0), 0);
  const costoVendido = activas.reduce((s, v) => s + (Number(v.costoTotal) || 0), 0);
  const totalGastos = gastos.reduce((s, g) => s + (Number(g.montoArs) || 0), 0);
  const ganancia = totalVentas - costoVendido - totalGastos;

  montar(zona,
    el('div', { clase: 'balance' },
      dato('Ventas', pesos(totalVentas)),
      dato('Gastos', pesos(totalGastos)),
      dato('Ganancia', pesos(ganancia), ganancia >= 0 ? 'balance__valor--ganancia' : '')
    ),
    el('p', { clase: 'balance__etiqueta' },
      `${activas.length} ${activas.length === 1 ? 'venta' : 'ventas'} · ganancia = ventas − costo de lo vendido − gastos`)
  );
}

function dato(etiqueta, valor, claseExtra = '') {
  return el('div', { clase: 'balance__dato' },
    el('span', { clase: 'balance__etiqueta' }, etiqueta),
    el('span', { clase: `balance__valor ${claseExtra}` }, valor)
  );
}

async function dibujarAlertas(zona) {
  const avisos = [];
  const [ultimoRespaldo, variantes, productos, preferencias, cuentas] = await Promise.all([
    leerMeta('ultimoRespaldo'),
    listar('variantes'),
    listar('productos'),
    leerUnico('preferencias'),
    listar('cuenta_clientes')
  ]);
  const enlace = (href, clase, texto) => el('a', { href, clase: `alerta ${clase}` }, texto);

  const dias = preferencias?.diasRecordatorioRespaldo ?? 7;
  if (!ultimoRespaldo) {
    avisos.push(enlace('#/mas/respaldos', '', 'Todavía no hiciste ningún respaldo de tus datos. Tocá acá para hacerlo.'));
  } else {
    const pasaron = Math.floor((Date.now() - new Date(ultimoRespaldo)) / 86400000);
    if (pasaron >= dias) avisos.push(enlace('#/mas/respaldos', '', `Pasaron ${pasaron} días desde el último respaldo. Tocá acá para hacerlo.`));
  }

  const productoPorId = new Map(productos.map((p) => [p.id, p]));
  const vigentes = variantes.filter((v) => productoPorId.has(v.productoId));
  const sinStock = vigentes.filter((v) => v.stock <= 0).length;
  const poco = vigentes.filter((v) => v.stock > 0 && v.stock <= (productoPorId.get(v.productoId).stockMinimo ?? 1)).length;
  if (sinStock) avisos.push(enlace('#/inventario', '', `${sinStock} ${sinStock === 1 ? 'talle/color está' : 'talles/colores están'} sin stock.`));
  if (poco) avisos.push(enlace('#/inventario', 'alerta--info', `${poco} ${poco === 1 ? 'talle/color tiene' : 'talles/colores tienen'} poco stock (última unidad).`));

  const deuda = [...calcularSaldos(cuentas).values()].filter((x) => x > 0);
  if (deuda.length) {
    avisos.push(enlace('#/mas/clientes', '', `${deuda.length} ${deuda.length === 1 ? 'cliente te debe' : 'clientes te deben'} ${pesos(deuda.reduce((a, b) => a + b, 0))}.`));
  }

  if (!productos.length) avisos.push(enlace('#/inventario/nuevo', 'alerta--info', 'Empezá cargando tus productos en Inventario.'));

  montar(zona, avisos.length ? avisos : el('p', { clase: 'balance__etiqueta' }, 'Todo en orden.'));
}
