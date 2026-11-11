/*
 * Catálogo inicial del emprendimiento (tomado del catálogo de Canva, noviembre 2026).
 * Se carga UNA sola vez, con el botón "Cargar catálogo inicial" de Inventario,
 * y solo si todavía no hay productos. No se registra como compra.
 *
 * Cantidades: 1 unidad por talle/color (ajustables desde cada ficha).
 * Costos: vacíos (los completa la dueña).
 */
import { listar, guardarMeta, leerMeta } from './repositorios.js';
import { crearProducto } from './operaciones.js';
import { esImagenSegura } from '../util/imagenes.js';

// v(talle, color, stock = 1)
const v = (talle, color = '', stock = 1) => ({ talle, color, stock });

const PRODUCTOS = [
  { nombre: 'Conjunto de encaje triángulo soft y less regulable', genero: 'Dama', categoria: 'Conjuntos', tela: 'Encaje', precio: 16000,
    descripcion: 'Triángulo soft y less regulable. Delicados y cómodos.', foto: 'conjunto-encaje-soft',
    variantes: [v('90', 'Rojo'), v('90', 'Negro'), v('100', 'Rojo'), v('100', 'Negro')] },
  { nombre: 'Conjunto de algodón con puntilla', genero: 'Dama', categoria: 'Conjuntos', tela: 'Algodón', precio: 12000,
    descripcion: 'Triángulo soft y colaless. Varios colores.', foto: 'conjunto-algodon-puntilla',
    variantes: [v('90', 'Surtido'), v('95', 'Surtido'), v('100', 'Surtido')] },
  { nombre: 'Conjunto de algodón triángulo soft', genero: 'Dama', categoria: 'Conjuntos', tela: 'Algodón', precio: 12000,
    descripcion: '', foto: 'conjunto-algodon-soft',
    variantes: [v('95', 'Gris'), v('90', 'Blanco')] },
  { nombre: 'Conjunto de algodón armado colaless', genero: 'Dama', categoria: 'Conjuntos', tela: 'Algodón', precio: 14000,
    descripcion: 'Corpiño armado con colaless.', foto: 'conjunto-algodon-armado',
    variantes: [v('110'), v('100'), v('85', 'Rojo'), v('95', 'Rojo')] },
  { nombre: 'Pack x3 colaless de lycra', genero: 'Dama', categoria: 'Packs', tela: 'Lycra', precio: 8000, pack: true,
    descripcion: 'Muy cómodas. Todos los talles.', foto: 'pack-colaless-lycra',
    variantes: [v('Único')] },
  { nombre: 'Pack x3 less de encaje regulables', genero: 'Dama', categoria: 'Packs', tela: 'Encaje', precio: 10000, pack: true,
    descripcion: 'Regulables. Sexys y cómodas.', foto: 'pack-less-encaje',
    variantes: [v('Único')] },
  { nombre: 'Pack x3 colaless algodón, morley y lycra', genero: 'Dama', categoria: 'Packs', tela: '', precio: 8000, pack: true,
    descripcion: 'Cómodas y lindas para el día a día. Algodón, morley y lycra.', foto: 'pack-colaless-m',
    variantes: [v('M')] },
  { nombre: 'Pack x3 fru-fru less', genero: 'Dama', categoria: 'Packs', tela: '', precio: 8000, pack: true,
    descripcion: 'Cómodas y lindas para el día a día.', foto: 'pack-frufru',
    variantes: [v('Único')] },
  { nombre: 'Conjunto de encaje', genero: 'Dama', categoria: 'Lencería', tela: 'Encaje', precio: 13000,
    descripcion: '', foto: 'lenceria-encaje',
    variantes: [v('90', 'Blanco'), v('95', 'Negro')] },
  { nombre: 'Conjunto de encaje y microtul', genero: 'Dama', categoria: 'Lencería', tela: 'Microtul', precio: 12500,
    descripcion: 'Sexys y cómodos. Colaless de microtul.', foto: 'lenceria-microtul',
    variantes: [v('85', '', 0)] },
  { nombre: 'Bikini importada', genero: 'Dama', categoria: 'Bikinis', tela: '', precio: 14000,
    descripcion: 'Consultar por diseños y talles.', foto: 'bikini-importada',
    variantes: [v('Único')] },
  { nombre: 'Bikini Marcela Koury talle 90', genero: 'Dama', categoria: 'Bikinis', tela: '', marca: 'Marcela Koury', precio: 20000,
    descripcion: '', foto: 'bikini-mk-90',
    variantes: [v('90')] },
  { nombre: 'Bikini Marcela Koury talle 100', genero: 'Dama', categoria: 'Bikinis', tela: '', marca: 'Marcela Koury', precio: 20000,
    descripcion: '', foto: 'bikini-mk-100',
    variantes: [v('100')] },
  { nombre: 'Bikini Marcela Koury verde lima', genero: 'Dama', categoria: 'Bikinis', tela: '', marca: 'Marcela Koury', precio: 20000,
    descripcion: '', foto: 'bikini-mk-verde-lima',
    variantes: [v('85', 'Verde lima')] },
  { nombre: 'Pijama de verano talle M', genero: 'Dama', categoria: 'Pijamas', tela: '', precio: 15000,
    descripcion: '', foto: 'pijama-m',
    variantes: [v('M')] },
  { nombre: 'Pijama de verano talle L/XL', genero: 'Dama', categoria: 'Pijamas', tela: '', precio: 14000,
    descripcion: '', foto: 'pijama-l-xl',
    variantes: [v('L/XL')] },
  { nombre: 'Bóxer Capicúa seda fría', genero: 'Caballero', categoria: 'Bóxers', tela: 'Seda fría', marca: 'Capicúa', precio: 10000,
    descripcion: 'Variedad de talles.', foto: 'boxer-capicua',
    variantes: [v('Único')] },
  { nombre: 'Bóxer UOMO de algodón', genero: 'Caballero', categoria: 'Bóxers', tela: 'Algodón', marca: 'UOMO', precio: 8500,
    descripcion: 'Consultar talles.', foto: 'boxer-uomo',
    variantes: [v('Único')] }
];

export const CANTIDAD_PRODUCTOS = PRODUCTOS.length;
export const ARCHIVOS_FOTOS = PRODUCTOS.map((p) => `./img/catalogo/${p.foto}.jpg`);

async function fotoComoDato(nombre) {
  try {
    const r = await fetch(`img/catalogo/${nombre}.jpg`);
    if (!r.ok) return null;
    const blob = await r.blob();
    const dato = await new Promise((resolver, rechazar) => {
      const lector = new FileReader();
      lector.onload = () => resolver(String(lector.result));
      lector.onerror = rechazar;
      lector.readAsDataURL(blob);
    });
    return esImagenSegura(dato) ? dato : null;
  } catch {
    return null; // sin foto, pero el producto se carga igual
  }
}

export async function catalogoInicialDisponible() {
  const [productos, yaCargado] = await Promise.all([listar('productos', { incluirEliminados: true }), leerMeta('catalogoInicialCargado')]);
  return !yaCargado && productos.length === 0;
}

/**
 * Carga los productos del catálogo. Devuelve cuántos se cargaron.
 * @param {(hechos:number, total:number) => void} [progreso]
 */
export async function cargarCatalogoInicial(progreso = () => {}) {
  if (!(await catalogoInicialDisponible())) throw new Error('El catálogo inicial ya fue cargado o ya hay productos.');
  const categorias = await listar('categorias');
  const buscarCategoria = (genero, nombre) => {
    const padre = categorias.find((c) => !c.padreId && c.genero === genero);
    return categorias.find((c) => c.padreId === padre?.id && c.nombre === nombre)?.id || '';
  };

  let hechos = 0;
  for (const p of PRODUCTOS) {
    const foto = await fotoComoDato(p.foto);
    await crearProducto({
      nombre: p.nombre,
      categoriaId: buscarCategoria(p.genero, p.categoria),
      marca: p.marca || '',
      tela: p.tela || '',
      unidad: p.pack ? 'pack' : 'unidad',
      cantidadPack: p.pack ? 3 : null,
      proveedorId: '',
      costo: 0,
      precio: p.precio,
      precioMayorista: null,
      stockMinimo: 1,
      descripcion: p.descripcion,
      foto
    }, p.variantes);
    hechos += 1;
    progreso(hechos, PRODUCTOS.length);
  }
  await guardarMeta('catalogoInicialCargado', new Date().toISOString());
  return hechos;
}
