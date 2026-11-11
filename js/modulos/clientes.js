/*
 * Clientes y deudas (fiado).
 * Rutas: #/mas/clientes · #/mas/clientes/nuevo · #/mas/clientes/<id> · #/mas/clientes/<id>/editar
 */
import { el, montar } from '../util/dom.js';
import { pesos, fecha, fechaHora, normalizar, leerNumero } from '../util/formato.js';
import { campo, volver } from '../util/formulario.js';
import { avisar, confirmar, formularioDialogo } from '../util/avisos.js';
import * as validar from '../util/validacion.js';
import { listar, crear, actualizar, eliminar, obtener, leerUnico } from '../datos/repositorios.js';
import { leerPorIndice } from '../datos/db.js';
import { registrarPagoCliente, calcularSaldos } from '../datos/operaciones.js';
import { abrirWhatsApp } from '../util/whatsapp.js';

let busqueda = '';
let soloDeudores = false;

export async function mostrar(contenedor, partes = []) {
  const [a, b] = partes;
  if (a === 'nuevo') return formulario(contenedor, null);
  if (a && b === 'editar') return formulario(contenedor, a);
  if (a) return ficha(contenedor, a);
  return lista(contenedor);
}

async function lista(contenedor) {
  const [clientes, movimientos] = await Promise.all([listar('clientes'), listar('cuenta_clientes')]);
  const saldos = calcularSaldos(movimientos);
  clientes.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const totalDeuda = [...saldos.values()].filter((s) => s > 0).reduce((s, x) => s + x, 0);
  const zona = el('div');

  function dibujar() {
    const t = normalizar(busqueda);
    const filtrados = clientes
      .filter((c) => !t || normalizar(`${c.nombre} ${c.whatsapp} ${c.instagram}`).includes(t))
      .filter((c) => !soloDeudores || (saldos.get(c.id) || 0) > 0);
    montar(zona, filtrados.length ? el('ul', { clase: 'lista' }, filtrados.map((c) => {
      const saldo = saldos.get(c.id) || 0;
      return el('li', {}, el('a', { href: `#/mas/clientes/${c.id}`, clase: 'lista__item' },
        el('span', {}, c.nombre, el('small', {}, [c.whatsapp, c.instagram ? `@${c.instagram}` : '', c.talles ? `Talles: ${c.talles}` : ''].filter(Boolean).join(' · '))),
        saldo > 0 ? el('span', { clase: 'etiqueta etiqueta--alerta' }, `Debe ${pesos(saldo)}`)
          : saldo < 0 ? el('span', { clase: 'etiqueta' }, `A favor ${pesos(-saldo)}`) : null));
    })) : el('p', { clase: 'vacio' }, clientes.length ? 'No hay clientes que coincidan.' : 'Todavía no cargaste clientes.'));
  }

  montar(contenedor,
    volver('#/mas'),
    el('div', { clase: 'cabecera-lista' },
      el('h1', { clase: 'titulo-pantalla' }, 'Clientes'),
      el('a', { href: '#/mas/clientes/nuevo', clase: 'boton' }, '+ Nuevo')),
    totalDeuda > 0 ? el('div', { clase: 'tarjeta' }, el('div', { clase: 'linea linea--total' }, el('span', {}, 'Total que te deben'), el('span', { clase: 'texto-alerta' }, pesos(totalDeuda)))) : null,
    el('div', { clase: 'buscador' }, el('input', { type: 'search', placeholder: 'Buscar cliente…', 'aria-label': 'Buscar cliente', value: busqueda,
      onInput: (e) => { busqueda = e.target.value; dibujar(); } })),
    el('label', { clase: 'casilla' }, el('input', { type: 'checkbox', checked: soloDeudores, onChange: (e) => { soloDeudores = e.target.checked; dibujar(); } }), ' Solo los que deben'),
    zona);
  dibujar();
}

async function formulario(contenedor, id) {
  const c = id ? await obtener('clientes', id) : {};
  if (id && (!c || c.eliminado)) { montar(contenedor, volver('#/mas/clientes'), el('p', {}, 'No se encontró el cliente.')); return; }
  const f = {
    nombre: campo({ etiqueta: 'Nombre', valor: c.nombre, obligatorio: true, max: 60 }),
    whatsapp: campo({ etiqueta: 'WhatsApp', tipo: 'tel', valor: c.whatsapp, max: 20, ayuda: 'Con código de área, sin 0 ni 15.' }),
    instagram: campo({ etiqueta: 'Instagram', valor: c.instagram, max: 40, prefijo: '@' }),
    talles: campo({ etiqueta: 'Talles habituales', valor: c.talles, max: 60, placeholder: 'Ej.: corpiño 95, bombacha M' }),
    notas: campo({ etiqueta: 'Notas', tipo: 'textarea', valor: c.notas, max: 300 })
  };
  async function guardar(e) {
    e.preventDefault();
    Object.values(f).forEach((x) => x.limpiar());
    try {
      const datos = {
        nombre: validar.texto('nombre', f.nombre.valor, { obligatorio: true, max: 60, etiqueta: 'El nombre' }),
        whatsapp: validar.whatsapp('whatsapp', f.whatsapp.valor),
        instagram: validar.instagram('instagram', f.instagram.valor),
        talles: validar.texto('talles', f.talles.valor, { max: 60 }),
        notas: validar.textoLargo('notas', f.notas.valor, { max: 300 })
      };
      const guardado = id ? await actualizar('clientes', id, datos) : await crear('clientes', datos);
      avisar('Cliente guardado');
      location.hash = `#/mas/clientes/${guardado.id}`;
    } catch (error) {
      if (error instanceof validar.ErrorValidacion && f[error.campo]) f[error.campo].error(error.message);
      else avisar(error.message || 'No se pudo guardar.', 'error');
    }
  }
  montar(contenedor,
    volver(id ? `#/mas/clientes/${id}` : '#/mas/clientes'),
    el('h1', { clase: 'titulo-pantalla' }, id ? 'Editar cliente' : 'Nuevo cliente'),
    el('form', { novalidate: true, onSubmit: guardar },
      el('div', { clase: 'tarjeta' }, Object.values(f).map((x) => x.nodo)),
      el('div', { clase: 'botonera' }, el('button', { type: 'submit', clase: 'boton' }, 'Guardar'))));
}

async function ficha(contenedor, id) {
  const c = await obtener('clientes', id);
  if (!c || c.eliminado) { montar(contenedor, volver('#/mas/clientes'), el('p', {}, 'No se encontró el cliente.')); return; }
  const [movs, ventas, negocio] = await Promise.all([
    leerPorIndice('cuenta_clientes', 'clienteId', id),
    leerPorIndice('ventas', 'clienteId', id),
    leerUnico('negocio')
  ]);
  const saldo = calcularSaldos(movs).get(id) || 0;
  movs.sort((a, b) => b.fecha.localeCompare(a.fecha));
  ventas.sort((a, b) => b.fecha.localeCompare(a.fecha));
  const totalComprado = ventas.filter((v) => v.estado !== 'anulada').reduce((s, v) => s + v.total, 0);

  async function pago() {
    const r = await formularioDialogo({
      titulo: 'Registrar pago', mensaje: `Saldo actual: ${pesos(saldo)}`,
      campos: [
        { clave: 'monto', etiqueta: 'Monto', tipo: 'dinero', prefijo: '$', valor: saldo > 0 ? String(saldo).replace('.', ',') : '' },
        { clave: 'medio', etiqueta: 'Medio de pago', tipo: 'select', opciones: ['Efectivo', 'Transferencia'] },
        { clave: 'nota', etiqueta: 'Nota (opcional)', max: 80 }
      ]
    });
    if (!r) return;
    const monto = leerNumero(r.monto);
    if (!(monto > 0)) { avisar('Monto no válido.', 'error'); return; }
    try { await registrarPagoCliente(id, monto, r.medio, r.nota.trim().slice(0, 80)); avisar('Pago registrado'); ficha(contenedor, id); }
    catch (error) { avisar(error.message, 'error'); }
  }

  function recordatorio() {
    const nombre = c.nombre.split(' ')[0];
    const mensaje = `¡Hola ${nombre}! Te escribo de ${negocio?.nombre || 'Ropa Interior & Lencería'} 😊 Te recuerdo que tenés un saldo pendiente de ${pesos(saldo)}. ${negocio?.notaComprobante ? `\n${negocio.notaComprobante}\n` : ''}¡Muchas gracias!`;
    abrirWhatsApp(c.whatsapp, mensaje);
  }

  async function borrar() {
    if (saldo !== 0) { avisar('No se puede eliminar un cliente con saldo pendiente.', 'error'); return; }
    if (!await confirmar({ titulo: `¿Eliminar a ${c.nombre}?`, mensaje: 'Las ventas anteriores no se modifican.', aceptar: 'Eliminar', peligro: true })) return;
    await eliminar('clientes', id);
    avisar('Cliente eliminado');
    location.hash = '#/mas/clientes';
  }

  const TIPOS = { deuda: 'Compra a cuenta', pago: 'Pago', anulacion: 'Venta anulada' };

  montar(contenedor,
    volver('#/mas/clientes'),
    el('h1', { clase: 'titulo-pantalla' }, c.nombre),
    el('p', { clase: 'campo__ayuda' }, [c.whatsapp ? `WhatsApp ${c.whatsapp}` : '', c.instagram ? `@${c.instagram}` : '', c.talles ? `Talles: ${c.talles}` : ''].filter(Boolean).join(' · ')),
    c.notas ? el('p', {}, c.notas) : null,
    el('div', { clase: 'tarjeta' },
      el('div', { clase: 'balance' },
        el('div', { clase: 'balance__dato' }, el('span', { clase: 'balance__etiqueta' }, saldo >= 0 ? 'Debe' : 'A favor'),
          el('span', { clase: `balance__valor ${saldo > 0 ? 'texto-alerta' : ''}` }, pesos(Math.abs(saldo)))),
        el('div', { clase: 'balance__dato' }, el('span', { clase: 'balance__etiqueta' }, 'Compras'), el('span', { clase: 'balance__valor' }, String(ventas.filter((v) => v.estado !== 'anulada').length))),
        el('div', { clase: 'balance__dato' }, el('span', { clase: 'balance__etiqueta' }, 'Total comprado'), el('span', { clase: 'balance__valor' }, pesos(totalComprado))))),
    el('div', { clase: 'botonera' },
      el('button', { type: 'button', clase: 'boton', onClick: pago }, 'Registrar pago'),
      saldo > 0 ? el('button', { type: 'button', clase: 'boton boton--secundario', onClick: recordatorio }, 'Recordatorio por WhatsApp') : null,
      c.whatsapp ? el('button', { type: 'button', clase: 'boton boton--texto', onClick: () => abrirWhatsApp(c.whatsapp, `¡Hola ${c.nombre.split(' ')[0]}! `) }, 'Escribirle') : null,
      el('a', { href: `#/mas/clientes/${id}/editar`, clase: 'boton boton--texto' }, 'Editar')),
    el('h2', { clase: 'subtitulo' }, 'Cuenta corriente'),
    movs.length ? el('ul', { clase: 'lista-simple' }, movs.map((m) => el('li', {},
      el('span', {}, TIPOS[m.tipo] || m.tipo, el('small', {}, [fechaHora(m.fecha), m.medio, m.nota].filter(Boolean).join(' · '))),
      el('strong', { clase: m.tipo === 'deuda' ? 'texto-alerta' : 'texto-exito' }, `${m.tipo === 'deuda' ? '+' : '−'} ${pesos(m.monto)}`)))) :
      el('p', { clase: 'vacio' }, 'Sin movimientos de cuenta.'),
    el('h2', { clase: 'subtitulo' }, 'Compras'),
    ventas.length ? el('ul', { clase: 'lista' }, ventas.map((v) => el('li', {},
      el('a', { href: `#/ventas/v/${v.id}`, clase: 'lista__item' },
        el('span', {}, `N° ${v.numero}`, el('small', {}, fecha(v.fecha))),
        el('span', { clase: 'lista__monto' }, pesos(v.total), v.estado === 'anulada' ? el('small', { clase: 'texto-alerta' }, 'Anulada') : null))))) :
      el('p', { clase: 'vacio' }, 'Todavía no le vendiste.'),
    el('div', { clase: 'botonera botonera--fin' }, el('button', { type: 'button', clase: 'boton boton--texto texto-peligro', onClick: borrar }, 'Eliminar cliente'))
  );
}
