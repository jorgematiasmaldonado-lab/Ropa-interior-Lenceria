/*
 * Inventario: productos con variantes de talle y color.
 * Rutas: #/inventario · #/inventario/nuevo · #/inventario/p/<id> · #/inventario/p/<id>/editar
 *        #/inventario/compra · #/inventario/compras · #/inventario/compras/<id> · #/inventario/proveedores
 */
import { el, montar } from '../util/dom.js';
import { pesos, leerNumero, redondear, normalizar, fechaHora } from '../util/formato.js';
import { campo, volver, pestanas } from '../util/formulario.js';
import { avisar, confirmar, formularioDialogo } from '../util/avisos.js';
import { procesarImagen, esImagenSegura } from '../util/imagenes.js';
import { listar, crear, eliminar } from '../datos/repositorios.js';
import { leerPorIndice } from '../datos/db.js';
import {
  cargarCatalogo, textoVariante, precioVariante, nombreCategoria, generoProducto, stockTotal, ordenVariantes
} from '../datos/catalogo.js';
import { crearProducto, actualizarProducto, agregarVariantes, ajustarStock, registrarCompra } from '../datos/operaciones.js';

let filtroGenero = 'Todos';
let filtroStock = 'todos';
let textoBuscado = '';

export async function mostrar(contenedor, ruta, resto = []) {
  const [a, b, c] = resto;
  if (a === 'compra' || a === 'compras' || a === 'proveedores') {
    const compras = await import('./compras.js');
    return compras.mostrar(contenedor, resto);
  }
  if (a === 'nuevo') return formularioProducto(contenedor, null);
  if (a === 'p' && b && c === 'editar') return formularioProducto(contenedor, b);
  if (a === 'p' && b) return detalleProducto(contenedor, b);
  return listaProductos(contenedor);
}

export function pestanasInventario(activa) {
  return pestanas([
    ['#/inventario', 'Productos', 'productos'],
    ['#/inventario/compras', 'Compras', 'compras'],
    ['#/inventario/proveedores', 'Proveedores', 'proveedores']
  ], activa);
}

async function valoresLista(tipo) {
  return (await listar('listas')).filter((l) => l.tipo === tipo).sort((x, y) => (x.orden ?? 0) - (y.orden ?? 0)).map((l) => l.valor);
}

/* =========================================================
   Lista de productos
   ========================================================= */
async function listaProductos(contenedor) {
  const cat = await cargarCatalogo();
  const zonaLista = el('div');

  const buscador = el('input', {
    type: 'search', placeholder: 'Buscar por nombre, marca, talle o color…', 'aria-label': 'Buscar productos',
    value: textoBuscado, onInput: (e) => { textoBuscado = e.target.value; dibujar(); }
  });

  const chip = (grupo, valor, texto, actual, alElegir) => el('button', {
    type: 'button', clase: 'filtro', 'aria-pressed': String(valor === actual),
    onClick: (e) => {
      alElegir(valor);
      e.currentTarget.parentElement.querySelectorAll('.filtro').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget)));
      dibujar();
    }
  }, texto);

  function dibujar() {
    const terminos = normalizar(textoBuscado).split(/\s+/).filter(Boolean);
    const productos = cat.productos
      .filter((p) => filtroGenero === 'Todos' || generoProducto(p, cat.categoriaPorId) === filtroGenero)
      .filter((p) => {
        const stock = stockTotal(p, cat);
        if (filtroStock === 'sin') return stock === 0;
        if (filtroStock === 'ultima') return (cat.variantesPorProducto.get(p.id) || []).some((v) => v.stock === 1);
        return true;
      })
      .filter((p) => {
        if (!terminos.length) return true;
        const variantes = cat.variantesPorProducto.get(p.id) || [];
        const texto = normalizar([p.nombre, p.marca, p.tela, nombreCategoria(p.categoriaId, cat.categoriaPorId), ...variantes.flatMap((v) => [v.talle, v.color])].join(' '));
        return terminos.every((t) => texto.includes(t));
      })
      .sort((x, y) => x.nombre.localeCompare(y.nombre, 'es'));

    if (!cat.productos.length) {
      montar(zonaLista, el('div', { clase: 'tarjeta construccion' },
        el('p', {}, el('strong', {}, 'Todavía no cargaste productos.')),
        el('p', {}, 'Empezá con el botón "Nuevo producto".')));
      return;
    }
    if (!productos.length) {
      montar(zonaLista, el('p', { clase: 'vacio' }, 'No hay productos que coincidan.'));
      return;
    }
    montar(zonaLista,
      el('p', { clase: 'campo__ayuda' }, `${productos.length} ${productos.length === 1 ? 'producto' : 'productos'}`),
      el('ul', { clase: 'tarjetas-producto' }, productos.map((p) => tarjetaProducto(p, cat))));
  }

  montar(contenedor,
    pestanasInventario('productos'),
    el('div', { clase: 'cabecera-lista' },
      el('h1', { clase: 'titulo-pantalla' }, 'Productos'),
      el('a', { href: '#/inventario/nuevo', clase: 'boton' }, '+ Nuevo producto')
    ),
    el('div', { clase: 'buscador' }, buscador),
    el('div', { clase: 'filtros', role: 'group', 'aria-label': 'Filtrar por género' },
      ['Todos', 'Dama', 'Caballero'].map((g) => chip('genero', g, g, filtroGenero, (v) => { filtroGenero = v; }))),
    el('div', { clase: 'filtros', role: 'group', 'aria-label': 'Filtrar por stock' },
      [['todos', 'Todo el stock'], ['ultima', 'Última unidad'], ['sin', 'Sin stock']].map(([v, t]) => chip('stock', v, t, filtroStock, (x) => { filtroStock = x; }))),
    zonaLista,
    el('a', { href: '#/inventario/compra', clase: 'boton boton--secundario boton--ancho' }, 'Ingreso de mercadería')
  );
  dibujar();
}

function tarjetaProducto(p, cat) {
  const variantes = cat.variantesPorProducto.get(p.id) || [];
  const total = variantes.reduce((s, v) => s + v.stock, 0);
  return el('li', {},
    el('a', { href: `#/inventario/p/${p.id}`, clase: 'producto' },
      esImagenSegura(p.foto) ? el('img', { src: p.foto, alt: '', clase: 'producto__foto' }) : el('span', { clase: 'producto__foto producto__foto--vacia', 'aria-hidden': 'true' }, (p.nombre || '?')[0]),
      el('span', { clase: 'producto__info' },
        el('strong', {}, p.nombre),
        el('small', {}, [p.marca, nombreCategoria(p.categoriaId, cat.categoriaPorId)].filter(Boolean).join(' · ')),
        el('span', { clase: 'chips-stock' }, variantes.slice(0, 8).map((v) =>
          el('span', { clase: `chip-stock ${v.stock === 0 ? 'chip-stock--sin' : v.stock === 1 ? 'chip-stock--ultima' : ''}` },
            `${[v.talle, v.color].filter(Boolean).join(' ') || 'Único'}: ${v.stock}`)),
        variantes.length > 8 ? el('span', { clase: 'chip-stock' }, `+${variantes.length - 8}`) : null)
      ),
      el('span', { clase: 'producto__precio' },
        pesos(p.precio),
        el('small', { clase: total === 0 ? 'texto-alerta' : '' }, total === 0 ? 'Sin stock' : `${total} u.`))
    )
  );
}

/* =========================================================
   Formulario de producto (nuevo o editar)
   ========================================================= */
async function formularioProducto(contenedor, productoId) {
  const [cat, talles, colores, telas, marcas] = await Promise.all([
    cargarCatalogo(), valoresLista('talle'), valoresLista('color'), valoresLista('tela'), valoresLista('marca')
  ]);
  const existente = productoId ? cat.productoPorId.get(productoId) : null;
  if (productoId && !existente) { montar(contenedor, volver('#/inventario'), el('p', {}, 'No se encontró el producto.')); return; }
  const p = existente || { unidad: 'unidad', cantidadPack: 3 };
  let foto = p.foto || null;

  // ----- Campos -----
  const f = {
    nombre: campo({ etiqueta: 'Nombre del producto', valor: p.nombre, obligatorio: true, max: 70, placeholder: 'Ej.: Conjunto encaje triángulo soft' }),
    categoria: campo({ etiqueta: 'Categoría', tipo: 'select', vacio: 'Elegí una categoría', obligatorio: true }),
    marca: campo({ etiqueta: 'Marca', tipo: 'select', vacio: 'Sin marca', opciones: conActual(marcas, p.marca), ayuda: 'Las marcas se agregan en Más › Configuración › Listas.' }),
    tela: campo({ etiqueta: 'Tela', tipo: 'select', vacio: 'Sin especificar', opciones: conActual(telas, p.tela) }),
    unidad: campo({ etiqueta: 'Se vende por', tipo: 'select', opciones: [['unidad', 'Unidad'], ['pack', 'Pack']] }),
    cantidadPack: campo({ etiqueta: 'Unidades por pack', tipo: 'entero', valor: p.cantidadPack ?? 3 }),
    proveedor: campo({ etiqueta: 'Proveedor', tipo: 'select', vacio: 'Sin proveedor', opciones: cat.proveedores.map((x) => [x.id, x.nombre]) }),
    costo: campo({ etiqueta: 'Costo por unidad de venta', tipo: 'dinero', valor: p.costo ? String(p.costo).replace('.', ',') : '', prefijo: '$', ayuda: 'Lo que te costó (en pesos).' }),
    precio: campo({ etiqueta: 'Precio de venta', tipo: 'dinero', valor: p.precio ? String(p.precio).replace('.', ',') : '', prefijo: '$', obligatorio: true }),
    mayorista: campo({ etiqueta: 'Precio mayorista (opcional)', tipo: 'dinero', valor: p.precioMayorista ? String(p.precioMayorista).replace('.', ',') : '', prefijo: '$' }),
    stockMinimo: campo({ etiqueta: 'Avisar "poco stock" con', tipo: 'entero', valor: p.stockMinimo ?? 1, ayuda: 'Unidades por talle/color. Con 0 solo avisa cuando se agota.' }),
    descripcion: campo({ etiqueta: 'Descripción (opcional)', tipo: 'textarea', valor: p.descripcion, max: 300 })
  };
  // Categorías agrupadas por Dama / Caballero
  const principales = cat.categorias.filter((c) => !c.padreId && !c.eliminado).sort((x, y) => (x.orden ?? 0) - (y.orden ?? 0));
  for (const padre of principales) {
    const hijas = cat.categorias.filter((c) => c.padreId === padre.id && (!c.eliminado || c.id === p.categoriaId)).sort((x, y) => (x.orden ?? 0) - (y.orden ?? 0));
    f.categoria.entrada.append(el('optgroup', { label: padre.nombre }, hijas.map((h) => el('option', { value: h.id }, h.nombre))));
  }
  f.categoria.valor = p.categoriaId || '';
  f.marca.valor = p.marca || '';
  f.tela.valor = p.tela || '';
  f.unidad.valor = p.unidad || 'unidad';
  f.proveedor.valor = p.proveedorId || '';

  const mostrarPack = () => f.cantidadPack.nodo.classList.toggle('oculto', f.unidad.valor !== 'pack');
  f.unidad.entrada.addEventListener('change', mostrarPack);
  mostrarPack();

  // Proveedor nuevo rápido
  const botonProveedor = el('button', {
    type: 'button', clase: 'boton boton--texto', onClick: async () => {
      const r = await formularioDialogo({ titulo: 'Nuevo proveedor', campos: [
        { clave: 'nombre', etiqueta: 'Nombre', max: 60 }, { clave: 'contacto', etiqueta: 'Contacto (opcional)', max: 60 }
      ] });
      const nombre = r?.nombre?.trim();
      if (!nombre) return;
      const nuevo = await crear('proveedores', { nombre: nombre.slice(0, 60), contacto: (r.contacto || '').trim().slice(0, 60) });
      f.proveedor.entrada.append(el('option', { value: nuevo.id }, nuevo.nombre));
      f.proveedor.valor = nuevo.id;
      avisar('Proveedor agregado');
    }
  }, '+ Nuevo proveedor');

  // Margen de ganancia en vivo
  const margen = el('p', { clase: 'margen', 'aria-live': 'polite' });
  const calcularMargen = () => {
    const costo = leerNumero(f.costo.valor);
    const precio = leerNumero(f.precio.valor);
    if (!(precio > 0) || !(costo > 0)) { margen.textContent = ''; return; }
    const gana = precio - costo;
    margen.textContent = `Ganás ${pesos(gana)} por unidad (${Math.round((gana / costo) * 100)}% sobre el costo).`;
    margen.classList.toggle('texto-alerta', gana < 0);
  };
  f.costo.entrada.addEventListener('input', calcularMargen);
  f.precio.entrada.addEventListener('input', calcularMargen);
  calcularMargen();

  // Foto
  let vistaFoto = el('span');
  const dibujarFoto = () => {
    const nueva = esImagenSegura(foto) ? el('img', { src: foto, alt: 'Foto del producto', clase: 'foto-editor__vista' })
      : el('span', { clase: 'foto-editor__vista foto-editor__vacia' }, 'Sin foto');
    vistaFoto.replaceWith(nueva);
    vistaFoto = nueva;
  };
  const errorFoto = el('span', { clase: 'campo__error', role: 'alert' });
  const archivoFoto = el('input', {
    type: 'file', accept: 'image/png,image/jpeg,image/webp', clase: 'archivo-oculto', id: 'archivo-foto',
    onChange: async (e) => {
      errorFoto.textContent = '';
      const archivo = e.target.files?.[0];
      e.target.value = '';
      if (!archivo) return;
      try { foto = await procesarImagen(archivo, { lado: 640, formato: 'image/jpeg', calidad: 0.8 }); dibujarFoto(); }
      catch (error) { errorFoto.textContent = error.message; }
    }
  });
  const zonaFoto = el('div', { clase: 'foto-editor' }, vistaFoto,
    el('div', { clase: 'botonera' },
      el('label', { for: 'archivo-foto', clase: 'boton boton--chico', role: 'button', tabindex: '0',
        onKeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); archivoFoto.click(); } } }, 'Elegir foto'),
      el('button', { type: 'button', clase: 'boton boton--texto', onClick: () => { foto = null; dibujarFoto(); } }, 'Quitar')),
    errorFoto, archivoFoto);

  // Variantes (solo al crear)
  const generador = existente ? null : crearGeneradorVariantes({ talles, colores, existentes: [] });
  const registrarComoCompra = el('input', { type: 'checkbox', id: 'como-compra', checked: true });

  const form = el('form', { novalidate: true, onSubmit: guardar },
    el('div', { clase: 'tarjeta' }, el('h2', { clase: 'campo__etiqueta' }, 'Foto'), zonaFoto),
    el('div', { clase: 'tarjeta' },
      f.nombre.nodo, f.categoria.nodo, f.marca.nodo, f.tela.nodo,
      el('div', { clase: 'dos-columnas' }, f.unidad.nodo, f.cantidadPack.nodo),
      f.proveedor.nodo, botonProveedor),
    el('div', { clase: 'tarjeta' },
      el('h2', { clase: 'campo__etiqueta' }, 'Precios'),
      el('div', { clase: 'dos-columnas' }, f.costo.nodo, f.precio.nodo),
      margen,
      existente ? el('label', { clase: 'casilla' }, el('input', { type: 'checkbox', id: 'aplicar-costo' }), ' Aplicar este costo a todos los talles y colores') : null,
      f.mayorista.nodo, f.stockMinimo.nodo),
    generador ? el('div', { clase: 'tarjeta' },
      el('h2', { clase: 'campo__etiqueta' }, 'Talles, colores y stock'),
      generador.nodo,
      el('label', { clase: 'casilla' }, registrarComoCompra, ' Registrar el stock cargado como compra (gasto de mercadería)'),
      el('p', { clase: 'campo__ayuda' }, 'Si lo marcás, el costo × las unidades queda registrado en Compras. Desmarcalo si es mercadería que ya tenías.')
    ) : null,
    f.descripcion.nodo,
    el('div', { clase: 'botonera' },
      el('button', { type: 'submit', clase: 'boton' }, existente ? 'Guardar cambios' : 'Guardar producto'),
      el('a', { href: existente ? `#/inventario/p/${existente.id}` : '#/inventario', clase: 'boton boton--secundario' }, 'Cancelar'))
  );

  async function guardar(e) {
    e.preventDefault();
    Object.values(f).forEach((c) => c.limpiar());
    const nombre = f.nombre.valor.replace(/\s+/g, ' ').trim();
    if (!nombre) return f.nombre.error('Escribí el nombre del producto.');
    if (!f.categoria.valor) return f.categoria.error('Elegí una categoría.');
    const precio = leerNumero(f.precio.valor);
    if (!(precio > 0)) return f.precio.error('Ingresá un precio mayor a cero. Ej.: 16000');
    const costo = f.costo.valor.trim() ? leerNumero(f.costo.valor) : 0;
    if (!(costo >= 0)) return f.costo.error('Costo no válido. Ej.: 9500');
    const mayorista = f.mayorista.valor.trim() ? leerNumero(f.mayorista.valor) : null;
    if (mayorista !== null && !(mayorista > 0)) return f.mayorista.error('Precio mayorista no válido.');
    const stockMinimo = Number(f.stockMinimo.valor);
    if (!Number.isInteger(stockMinimo) || stockMinimo < 0 || stockMinimo > 999) return f.stockMinimo.error('Ingresá un número entre 0 y 999.');
    const cantidadPack = Number(f.cantidadPack.valor);
    if (f.unidad.valor === 'pack' && (!Number.isInteger(cantidadPack) || cantidadPack < 2 || cantidadPack > 99)) return f.cantidadPack.error('Entre 2 y 99.');

    const datos = {
      nombre: nombre.slice(0, 70),
      categoriaId: f.categoria.valor,
      marca: f.marca.valor,
      tela: f.tela.valor,
      unidad: f.unidad.valor,
      cantidadPack: f.unidad.valor === 'pack' ? cantidadPack : null,
      proveedorId: f.proveedor.valor,
      costo: redondear(costo),
      precio: redondear(precio),
      precioMayorista: mayorista !== null ? redondear(mayorista) : null,
      stockMinimo,
      descripcion: f.descripcion.valor.trim().slice(0, 300),
      foto: esImagenSegura(foto) ? foto : null
    };

    try {
      if (existente) {
        const aplicar = document.getElementById('aplicar-costo')?.checked;
        await actualizarProducto(existente.id, datos, { aplicarCosto: aplicar });
        avisar('Producto actualizado');
        location.hash = `#/inventario/p/${existente.id}`;
        return;
      }
      const combinaciones = generador.leer();
      if (!combinaciones.ok) { avisar(combinaciones.error, 'error'); return; }
      const conStock = combinaciones.lista.some((v) => v.stock > 0);
      const comoCompra = registrarComoCompra.checked && conStock;
      if (comoCompra && !(costo > 0)) return f.costo.error('Para registrarlo como compra, ingresá el costo.');

      const prod = await crearProducto(datos, combinaciones.lista.map((v) => ({ ...v, stock: comoCompra ? 0 : v.stock })));
      if (comoCompra) {
        const variantes = await leerPorIndice('variantes', 'productoId', prod.id);
        const items = variantes.map((v) => {
          const original = combinaciones.lista.find((x) => x.talle === v.talle && x.color === v.color);
          return { varianteId: v.id, cantidad: original?.stock || 0, costoUnitOriginal: costo, descripcion: `${prod.nombre} ${textoVariante(v)}` };
        }).filter((it) => it.cantidad > 0);
        const prov = cat.proveedores.find((x) => x.id === datos.proveedorId);
        await registrarCompra({
          fecha: new Date().toISOString(), proveedorId: datos.proveedorId, proveedorNombre: prov?.nombre || '',
          moneda: 'ARS', cotizacion: 1, adicionalesArs: 0, nota: 'Alta de producto'
        }, items);
      }
      avisar('Producto guardado');
      location.hash = `#/inventario/p/${prod.id}`;
    } catch (error) {
      console.error(error);
      avisar(error.message || 'No se pudo guardar.', 'error');
    }
  }

  montar(contenedor,
    volver(existente ? `#/inventario/p/${existente.id}` : '#/inventario'),
    el('h1', { clase: 'titulo-pantalla' }, existente ? 'Editar producto' : 'Nuevo producto'),
    form);
  dibujarFoto();
}

function conActual(lista, actual) {
  return actual && !lista.includes(actual) ? [...lista, actual] : lista;
}

/**
 * Generador de variantes: se marcan talles y colores y se crean todas las combinaciones.
 */
function crearGeneradorVariantes({ talles, colores, existentes = [] }) {
  const elegidos = { talle: new Set(), color: new Set() };
  const stocks = new Map(); // clave "talle|color" → stock escrito
  const tabla = el('div');

  function grupoChips(tipo, valores, titulo) {
    const contenedorChips = el('div', { clase: 'chips' });
    const agregarChip = (valor, marcado = false) => {
      const id = `chip-${tipo}-${Math.random().toString(36).slice(2, 8)}`;
      const casilla = el('input', { type: 'checkbox', id, value: valor, checked: marcado,
        onChange: (e) => { e.target.checked ? elegidos[tipo].add(valor) : elegidos[tipo].delete(valor); dibujarTabla(); } });
      if (marcado) elegidos[tipo].add(valor);
      contenedorChips.append(el('label', { for: id, clase: 'chip' }, casilla, valor));
    };
    valores.forEach((v) => agregarChip(v));
    const otro = el('input', { type: 'text', maxlength: 20, placeholder: `Otro ${tipo}`, 'aria-label': `Agregar otro ${tipo}` });
    const botonOtro = el('button', { type: 'button', clase: 'boton boton--chico boton--secundario', onClick: () => {
      const v = otro.value.replace(/\s+/g, ' ').trim().slice(0, 20);
      if (!v) return;
      if (![...contenedorChips.querySelectorAll('input')].some((i) => i.value.toLowerCase() === v.toLowerCase())) agregarChip(v, true);
      otro.value = '';
      dibujarTabla();
    } }, 'Agregar');
    return el('fieldset', { clase: 'grupo-chips' },
      el('legend', { clase: 'campo__etiqueta' }, titulo),
      contenedorChips,
      el('div', { clase: 'agregar' }, otro, botonOtro));
  }

  function combinaciones() {
    const ts = elegidos.talle.size ? [...elegidos.talle] : [''];
    const cs = elegidos.color.size ? [...elegidos.color] : [''];
    const lista = [];
    for (const t of ts) for (const c of cs) {
      if (existentes.some((v) => v.talle === t && v.color === c)) continue;
      lista.push({ talle: t, color: c });
    }
    return lista;
  }

  function dibujarTabla() {
    const lista = combinaciones();
    if (!lista.length) { montar(tabla, el('p', { clase: 'campo__ayuda' }, 'Esas combinaciones ya existen.')); return; }
    montar(tabla,
      el('p', { clase: 'campo__ayuda' }, `${lista.length} ${lista.length === 1 ? 'combinación' : 'combinaciones'}. Cargá cuántas unidades tenés de cada una:`),
      el('ul', { clase: 'lista-edicion' }, lista.map(({ talle, color }) => {
        const clave = `${talle}|${color}`;
        const entrada = el('input', { type: 'text', inputmode: 'numeric', maxlength: 4, clase: 'entrada-chica',
          value: stocks.get(clave) ?? '0', 'aria-label': `Stock ${talle} ${color}`,
          onInput: (e) => stocks.set(clave, e.target.value) });
        return el('li', {}, el('div', { clase: 'fila' },
          el('span', { clase: 'fila__nombre' }, textoVariante({ talle, color })), entrada));
      })));
  }

  dibujarTabla();
  return {
    nodo: el('div', {}, grupoChips('talle', talles, 'Talles'), grupoChips('color', colores, 'Colores'), tabla),
    leer() {
      const lista = combinaciones().map(({ talle, color }) => ({ talle, color, stock: Number(stocks.get(`${talle}|${color}`) ?? 0) }));
      if (!lista.length) return { ok: false, error: 'No hay combinaciones nuevas para agregar.' };
      if (lista.some((v) => !Number.isInteger(v.stock) || v.stock < 0 || v.stock > 9999)) return { ok: false, error: 'Revisá las cantidades: deben ser números enteros.' };
      return { ok: true, lista };
    }
  };
}

/* =========================================================
   Detalle de producto
   ========================================================= */
async function detalleProducto(contenedor, id) {
  const cat = await cargarCatalogo();
  const p = cat.productoPorId.get(id);
  if (!p) { montar(contenedor, volver('#/inventario'), el('p', {}, 'No se encontró el producto (puede haber sido eliminado).')); return; }
  const variantes = (cat.variantesPorProducto.get(id) || []).sort(ordenVariantes);
  const proveedor = cat.proveedores.find((x) => x.id === p.proveedorId);
  const movimientos = (await leerPorIndice('movimientos_stock', 'productoId', id))
    .sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 15);
  const varPorId = new Map(variantes.map((v) => [v.id, v]));
  const gana = p.precio - (p.costo || 0);

  const filasVariantes = variantes.map((v) => el('li', {},
    el('div', { clase: 'fila fila--variante' },
      el('span', { clase: 'fila__nombre' }, textoVariante(v),
        v.precio !== null && v.precio !== undefined ? el('small', {}, ` Precio especial ${pesos(v.precio)}`) : null),
      el('span', { clase: `etiqueta ${v.stock === 0 ? 'etiqueta--alerta' : ''}` }, `Stock ${v.stock}`),
      el('button', { type: 'button', clase: 'boton boton--texto', onClick: () => ajustar(v) }, 'Ajustar'),
      el('button', { type: 'button', clase: 'boton boton--texto', onClick: () => precioEspecial(v) }, 'Precio'),
      el('button', { type: 'button', clase: 'boton boton--texto texto-peligro', 'aria-label': `Eliminar ${textoVariante(v)}`, onClick: () => quitarVariante(v) }, '✕')
    )));

  async function ajustar(v) {
    const r = await formularioDialogo({
      titulo: `Ajustar stock – ${textoVariante(v)}`,
      mensaje: 'Para mercadería que compraste, usá "Ingreso de mercadería" así queda registrado el gasto.',
      campos: [
        { clave: 'stock', etiqueta: 'Stock real', tipo: 'entero', valor: v.stock },
        { clave: 'motivo', etiqueta: 'Motivo', tipo: 'select', opciones: ['Conteo / corrección', 'Fallado o roto', 'Regalo / sorteo', 'Uso personal', 'Otro'] }
      ]
    });
    if (!r) return;
    const n = Number(r.stock);
    if (!Number.isInteger(n) || n < 0 || n > 9999) { avisar('Cantidad no válida.', 'error'); return; }
    await ajustarStock(v.id, n, r.motivo);
    avisar('Stock actualizado');
    detalleProducto(contenedor, id);
  }

  async function precioEspecial(v) {
    const r = await formularioDialogo({
      titulo: `Precio de ${textoVariante(v)}`,
      mensaje: `Dejalo vacío para usar el precio del producto (${pesos(p.precio)}).`,
      campos: [{ clave: 'precio', etiqueta: 'Precio especial', tipo: 'dinero', valor: v.precio ?? '', prefijo: '$' }]
    });
    if (!r) return;
    const texto = r.precio.trim();
    const valor = texto ? leerNumero(texto) : null;
    if (valor !== null && !(valor > 0)) { avisar('Precio no válido.', 'error'); return; }
    const { actualizar } = await import('../datos/repositorios.js');
    await actualizar('variantes', v.id, { precio: valor !== null ? redondear(valor) : null });
    avisar('Precio actualizado');
    detalleProducto(contenedor, id);
  }

  async function quitarVariante(v) {
    if (v.stock > 0) { avisar('Primero ajustá el stock a 0 para eliminar esta variante.', 'error'); return; }
    if (!await confirmar({ titulo: `¿Eliminar ${textoVariante(v)}?`, mensaje: 'Las ventas anteriores no se modifican.', aceptar: 'Eliminar', peligro: true })) return;
    await eliminar('variantes', v.id, 'Eliminada desde la ficha');
    avisar('Variante eliminada');
    detalleProducto(contenedor, id);
  }

  async function nuevasVariantes() {
    const [talles, colores] = await Promise.all([valoresLista('talle'), valoresLista('color')]);
    const gen = crearGeneradorVariantes({ talles, colores, existentes: variantes });
    montar(zonaNuevas, el('div', { clase: 'tarjeta' },
      el('h2', { clase: 'campo__etiqueta' }, 'Agregar talles o colores'),
      gen.nodo,
      el('p', { clase: 'campo__ayuda' }, 'El stock que cargues acá no se registra como compra. Si es mercadería nueva, cargala en 0 y usá "Ingreso de mercadería".'),
      el('div', { clase: 'botonera' },
        el('button', { type: 'button', clase: 'boton', onClick: async () => {
          const r = gen.leer();
          if (!r.ok) { avisar(r.error, 'error'); return; }
          await agregarVariantes(id, r.lista);
          avisar('Variantes agregadas');
          detalleProducto(contenedor, id);
        } }, 'Agregar'),
        el('button', { type: 'button', clase: 'boton boton--secundario', onClick: () => montar(zonaNuevas) }, 'Cancelar'))
    ));
  }
  const zonaNuevas = el('div');

  async function borrarProducto() {
    const total = variantes.reduce((s, v) => s + v.stock, 0);
    const ok = await confirmar({
      titulo: `¿Eliminar "${p.nombre}"?`,
      mensaje: total > 0 ? `Todavía tiene ${total} unidades en stock. Las ventas anteriores no se modifican.` : 'Las ventas anteriores no se modifican.',
      aceptar: 'Eliminar', peligro: true
    });
    if (!ok) return;
    await eliminar('productos', id, 'Eliminado desde la ficha');
    avisar('Producto eliminado');
    location.hash = '#/inventario';
  }

  const TIPOS = { inicial: 'Stock inicial', ajuste: 'Ajuste', compra: 'Compra', venta: 'Venta', anulacion: 'Anulación', cambio: 'Cambio' };

  montar(contenedor,
    volver('#/inventario'),
    el('div', { clase: 'ficha' },
      esImagenSegura(p.foto) ? el('img', { src: p.foto, alt: `Foto de ${p.nombre}`, clase: 'ficha__foto' }) : null,
      el('div', {},
        el('h1', { clase: 'titulo-pantalla' }, p.nombre),
        el('p', { clase: 'campo__ayuda' }, [nombreCategoria(p.categoriaId, cat.categoriaPorId), p.marca, p.tela,
          p.unidad === 'pack' ? `Pack x${p.cantidadPack}` : ''].filter(Boolean).join(' · ')),
        el('div', { clase: 'balance balance--ficha' },
          dato('Precio', pesos(p.precio)),
          dato('Costo', p.costo ? pesos(p.costo) : '—'),
          dato('Ganancia', p.costo ? pesos(gana) : '—')),
        p.precioMayorista ? el('p', { clase: 'campo__ayuda' }, `Mayorista: ${pesos(p.precioMayorista)}`) : null,
        proveedor ? el('p', { clase: 'campo__ayuda' }, `Proveedor: ${proveedor.nombre}`) : null,
        p.descripcion ? el('p', {}, p.descripcion) : null
      )
    ),
    el('div', { clase: 'botonera' },
      el('a', { href: `#/inventario/p/${id}/editar`, clase: 'boton' }, 'Editar'),
      el('a', { href: `#/inventario/compra/${id}`, clase: 'boton boton--secundario' }, 'Registrar compra')),
    el('h2', { clase: 'subtitulo' }, `Talles y colores (${variantes.reduce((s, v) => s + v.stock, 0)} u. en total)`),
    variantes.length ? el('ul', { clase: 'lista-edicion' }, filasVariantes) : el('p', { clase: 'vacio' }, 'Sin variantes.'),
    el('button', { type: 'button', clase: 'boton boton--secundario boton--chico', onClick: nuevasVariantes }, '+ Agregar talles o colores'),
    zonaNuevas,
    el('h2', { clase: 'subtitulo' }, 'Últimos movimientos'),
    movimientos.length ? el('ul', { clase: 'lista-simple' }, movimientos.map((m) => el('li', {},
      el('span', {}, `${fechaHora(m.fecha)} · ${TIPOS[m.tipo] || m.tipo}`, el('small', {}, [varPorId.get(m.varianteId) ? textoVariante(varPorId.get(m.varianteId)) : '', m.motivo].filter(Boolean).join(' · '))),
      el('strong', { clase: m.cantidad < 0 ? 'texto-alerta' : 'texto-exito' }, `${m.cantidad > 0 ? '+' : ''}${m.cantidad}`)
    ))) : el('p', { clase: 'vacio' }, 'Sin movimientos.'),
    el('div', { clase: 'botonera botonera--fin' },
      el('button', { type: 'button', clase: 'boton boton--texto texto-peligro', onClick: borrarProducto }, 'Eliminar producto'))
  );
}

function dato(etiqueta, valor) {
  return el('div', { clase: 'balance__dato' }, el('span', { clase: 'balance__etiqueta' }, etiqueta), el('span', { clase: 'balance__valor' }, valor));
}

