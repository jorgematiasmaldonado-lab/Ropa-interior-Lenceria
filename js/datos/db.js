/*
 * Base de datos local (IndexedDB).
 * Los datos quedan guardados SOLO en este dispositivo.
 * Cada tabla ("almacén") usa como clave un id único (UUID).
 *
 * Para cambiar la estructura en el futuro: subir VERSION_DB y agregar
 * los cambios en actualizarEstructura() sin borrar lo existente.
 */

const NOMBRE_DB = 'lenceria-app';
const VERSION_DB = 2; // v2: índice productoId en movimientos_stock

/**
 * Tablas e índices (campos por los que se busca rápido).
 * Todos los registros llevan además: id, creadoEn, modificadoEn, eliminado, version.
 */
export const ESQUEMA = {
  negocio: [],
  preferencias: [],
  categorias: ['genero', 'padreId'],
  productos: ['categoriaId', 'nombre', 'marca', 'proveedorId'],
  variantes: ['productoId', 'sku', 'codigoBarras'],
  proveedores: ['nombre'],
  compras: ['fecha', 'proveedorId'],
  compras_items: ['compraId', 'varianteId'],
  ventas: ['fecha', 'clienteId', 'numero', 'estado'],
  ventas_items: ['ventaId', 'varianteId'],
  pagos: ['ventaId', 'clienteId', 'fecha'],
  clientes: ['nombre', 'whatsapp'],
  cuenta_clientes: ['clienteId', 'fecha'],
  gastos: ['fecha', 'categoria'],
  listas: ['tipo'],
  movimientos_stock: ['varianteId', 'productoId', 'fecha', 'tipo'],
  auditoria: ['fecha', 'tabla', 'registroId'],
  meta: []
};

let conexion = null;

/** Abre (o crea) la base de datos. */
export function abrirDB() {
  if (conexion) return Promise.resolve(conexion);
  return new Promise((resolver, rechazar) => {
    if (!('indexedDB' in window)) {
      rechazar(new Error('Este navegador no permite guardar datos.'));
      return;
    }
    const pedido = indexedDB.open(NOMBRE_DB, VERSION_DB);
    pedido.onupgradeneeded = () => actualizarEstructura(pedido.result, pedido.transaction);
    pedido.onsuccess = () => {
      conexion = pedido.result;
      // Si otra pestaña actualiza la estructura, se cierra esta conexión.
      conexion.onversionchange = () => { conexion.close(); conexion = null; };
      resolver(conexion);
    };
    pedido.onerror = () => rechazar(pedido.error);
    pedido.onblocked = () => rechazar(new Error('Cerrá las otras pestañas de la app y volvé a intentar.'));
  });
}

function actualizarEstructura(db, transaccion) {
  for (const [tabla, indices] of Object.entries(ESQUEMA)) {
    const almacen = db.objectStoreNames.contains(tabla)
      ? transaccion.objectStore(tabla)
      : db.createObjectStore(tabla, { keyPath: 'id' });
    for (const indice of indices) {
      if (!almacen.indexNames.contains(indice)) almacen.createIndex(indice, indice);
    }
  }
}

/** Convierte un pedido de IndexedDB en promesa. */
function promesa(pedido) {
  return new Promise((resolver, rechazar) => {
    pedido.onsuccess = () => resolver(pedido.result);
    pedido.onerror = () => rechazar(pedido.error);
  });
}

/**
 * Ejecuta varias operaciones en una sola transacción:
 * o se guardan todas, o no se guarda ninguna.
 * @param {string[]} tablas
 * @param {'readonly'|'readwrite'} modo
 * @param {(tx: IDBTransaction) => any} trabajo
 */
export async function transaccion(tablas, modo, trabajo) {
  const db = await abrirDB();
  return new Promise((resolver, rechazar) => {
    const tx = db.transaction(tablas, modo);
    let resultado;
    tx.oncomplete = () => resolver(resultado);
    tx.onerror = () => rechazar(tx.error);
    tx.onabort = () => rechazar(tx.error || new Error('Operación cancelada'));
    Promise.resolve(trabajo(tx)).then((r) => { resultado = r; }).catch((e) => {
      try { tx.abort(); } catch { /* ya terminada */ }
      rechazar(e);
    });
  });
}

export async function leer(tabla, id) {
  const db = await abrirDB();
  return promesa(db.transaction(tabla).objectStore(tabla).get(id));
}

export async function leerTodos(tabla) {
  const db = await abrirDB();
  return promesa(db.transaction(tabla).objectStore(tabla).getAll());
}

export async function leerPorIndice(tabla, indice, rango) {
  const db = await abrirDB();
  return promesa(db.transaction(tabla).objectStore(tabla).index(indice).getAll(rango));
}

export async function contar(tabla) {
  const db = await abrirDB();
  return promesa(db.transaction(tabla).objectStore(tabla).count());
}

export { promesa };
