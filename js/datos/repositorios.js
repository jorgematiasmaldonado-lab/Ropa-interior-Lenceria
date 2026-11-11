/*
 * Capa de datos: TODA la app lee y guarda a través de este archivo.
 * Así, en el futuro se puede agregar sincronización con la nube
 * cambiando solo esta capa, sin rehacer las pantallas.
 *
 * Reglas:
 *  - Cada registro tiene id (UUID), creadoEn, modificadoEn, eliminado y version.
 *  - Nada se borra definitivamente: se marca como eliminado (borrado lógico).
 *  - Cada cambio queda anotado en la tabla "auditoria".
 */
import { transaccion, leer, leerTodos, leerPorIndice, promesa } from './db.js';

export function nuevoId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  // Respaldo para navegadores viejos
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const ahora = () => new Date().toISOString();

function registrarAuditoria(tx, accion, tabla, registroId, detalle = null) {
  tx.objectStore('auditoria').add({
    id: nuevoId(),
    fecha: ahora(),
    accion,           // 'crear' | 'modificar' | 'eliminar' | 'anular' | 'restaurar'
    tabla,
    registroId,
    detalle,
    creadoEn: ahora(),
    modificadoEn: ahora(),
    eliminado: false,
    version: 1
  });
}

/** Crea un registro nuevo y devuelve el registro guardado. */
export async function crear(tabla, datos) {
  const registro = {
    ...datos,
    id: datos.id || nuevoId(),
    creadoEn: ahora(),
    modificadoEn: ahora(),
    eliminado: false,
    version: 1
  };
  await transaccion([tabla, 'auditoria'], 'readwrite', (tx) => {
    tx.objectStore(tabla).add(registro);
    registrarAuditoria(tx, 'crear', tabla, registro.id);
  });
  return registro;
}

/** Modifica campos de un registro existente. */
export async function actualizar(tabla, id, cambios) {
  return transaccion([tabla, 'auditoria'], 'readwrite', async (tx) => {
    const almacen = tx.objectStore(tabla);
    const actual = await promesa(almacen.get(id));
    if (!actual) throw new Error('No se encontró el registro.');
    const { id: _i, creadoEn: _c, version: _v, ...permitidos } = cambios;
    const nuevo = { ...actual, ...permitidos, modificadoEn: ahora(), version: (actual.version || 1) + 1 };
    almacen.put(nuevo);
    registrarAuditoria(tx, 'modificar', tabla, id, { campos: Object.keys(permitidos) });
    return nuevo;
  });
}

/** Borrado lógico: el registro queda guardado pero oculto. */
export async function eliminar(tabla, id, motivo = '') {
  return transaccion([tabla, 'auditoria'], 'readwrite', async (tx) => {
    const almacen = tx.objectStore(tabla);
    const actual = await promesa(almacen.get(id));
    if (!actual) throw new Error('No se encontró el registro.');
    almacen.put({ ...actual, eliminado: true, motivoEliminacion: motivo, modificadoEn: ahora(), version: (actual.version || 1) + 1 });
    registrarAuditoria(tx, 'eliminar', tabla, id, motivo ? { motivo } : null);
  });
}

export async function obtener(tabla, id) {
  return leer(tabla, id);
}

/** Lista registros (por defecto, sin los eliminados). */
export async function listar(tabla, { incluirEliminados = false } = {}) {
  const todos = await leerTodos(tabla);
  return incluirEliminados ? todos : todos.filter((r) => !r.eliminado);
}

/** Lista registros cuyo índice está entre dos valores (ej.: fechas). */
export async function listarEntre(tabla, indice, desde, hasta) {
  const rango = IDBKeyRange.bound(desde, hasta);
  const filas = await leerPorIndice(tabla, indice, rango);
  return filas.filter((r) => !r.eliminado);
}

/* ---------- Datos internos (meta) ---------- */
export async function leerMeta(clave, porDefecto = null) {
  const fila = await leer('meta', clave);
  return fila ? fila.valor : porDefecto;
}

export async function guardarMeta(clave, valor) {
  await transaccion(['meta'], 'readwrite', (tx) => {
    tx.objectStore('meta').put({ id: clave, valor, modificadoEn: ahora() });
  });
}

/* ---------- Registros únicos (negocio y preferencias) ---------- */
const ID_UNICO = 'principal';

export async function leerUnico(tabla) {
  return leer(tabla, ID_UNICO);
}

export async function guardarUnico(tabla, datos) {
  const actual = await leer(tabla, ID_UNICO);
  if (actual) return actualizar(tabla, ID_UNICO, datos);
  return crear(tabla, { ...datos, id: ID_UNICO });
}
