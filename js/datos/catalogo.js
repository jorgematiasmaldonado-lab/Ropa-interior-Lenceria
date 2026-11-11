/*
 * Lectura del catálogo (productos, variantes y categorías) ya relacionado.
 */
import { listar } from './repositorios.js';
import { normalizar } from '../util/formato.js';

export async function cargarCatalogo() {
  const [productos, variantes, categorias, proveedores] = await Promise.all([
    listar('productos'), listar('variantes'), listar('categorias', { incluirEliminados: true }), listar('proveedores')
  ]);
  const productoPorId = new Map(productos.map((p) => [p.id, p]));
  const categoriaPorId = new Map(categorias.map((c) => [c.id, c]));
  const variantesPorProducto = new Map();
  for (const v of variantes) {
    if (!productoPorId.has(v.productoId)) continue;
    if (!variantesPorProducto.has(v.productoId)) variantesPorProducto.set(v.productoId, []);
    variantesPorProducto.get(v.productoId).push(v);
  }
  for (const lista of variantesPorProducto.values()) lista.sort(ordenVariantes);
  return { productos, variantes, categorias, proveedores, productoPorId, categoriaPorId, variantesPorProducto };
}

const ORDEN_TALLES = ['XS', 'S', 'M', 'L', 'L/XL', 'XL', 'XXL', 'XXXL', 'Único'];
function claveTalle(t) {
  const n = Number(t);
  if (!Number.isNaN(n) && t !== '') return [0, n];
  const i = ORDEN_TALLES.indexOf(t);
  return [1, i === -1 ? 99 : i];
}
export function ordenVariantes(a, b) {
  const [ga, va] = claveTalle(a.talle);
  const [gb, vb] = claveTalle(b.talle);
  return ga - gb || va - vb || String(a.color).localeCompare(String(b.color), 'es');
}

/** "Talle 90 · Negro" */
export function textoVariante(v) {
  return [v.talle ? `Talle ${v.talle}` : '', v.color].filter(Boolean).join(' · ') || 'Único';
}

/** Precio de venta de una variante (precio propio o el del producto). */
export function precioVariante(v, p) {
  return v.precio !== null && v.precio !== undefined && v.precio !== '' ? Number(v.precio) : Number(p?.precio || 0);
}

export function nombreCategoria(cat, categoriaPorId) {
  const c = categoriaPorId.get(cat);
  if (!c) return '';
  const padre = c.padreId ? categoriaPorId.get(c.padreId) : null;
  return padre ? `${padre.nombre} › ${c.nombre}` : c.nombre;
}

/** Género (Dama/Caballero) de un producto según su categoría. */
export function generoProducto(p, categoriaPorId) {
  return categoriaPorId.get(p.categoriaId)?.genero || '';
}

export function stockTotal(p, catalogo) {
  return (catalogo.variantesPorProducto.get(p.id) || []).reduce((s, v) => s + (v.stock || 0), 0);
}

/** Texto de búsqueda de una variante. */
export function textoBusqueda(v, p) {
  return normalizar([p.nombre, p.marca, p.tela, v.talle, v.color, v.sku].join(' '));
}
