/*
 * Compartir catálogo: imágenes (historia o cuadrada) o lista de precios en texto,
 * para mandar a contactos, listas de difusión, estados de WhatsApp o Instagram.
 * Ruta: #/mas/catalogo
 */
import { el, montar } from '../util/dom.js';
import { pesos } from '../util/formato.js';
import { volver } from '../util/formulario.js';
import { avisar } from '../util/avisos.js';
import { leerUnico } from '../datos/repositorios.js';
import { cargarCatalogo, generoProducto, nombreCategoria } from '../datos/catalogo.js';
import { generarTarjeta, disponibilidad, listaDePrecios } from '../util/tarjetas-catalogo.js';
import { puedeCompartir, marcaTiempo } from '../util/archivos.js';
import { esImagenSegura } from '../util/imagenes.js';
import { abrirWhatsApp } from '../util/whatsapp.js';

let formato = 'historia';
let genero = 'Todos';
const desmarcados = new Set(); // productos que la usuaria sacó de la selección

export async function mostrar(contenedor) {
  const [cat, negocio] = await Promise.all([cargarCatalogo(), leerUnico('negocio')]);

  // Solo productos con stock, ordenados por categoría
  const ordenCategoria = (p) => {
    const c = cat.categoriaPorId.get(p.categoriaId);
    const padre = c?.padreId ? cat.categoriaPorId.get(c.padreId) : c;
    return `${String(padre?.orden ?? 9).padStart(2, '0')}-${String(c?.orden ?? 99).padStart(3, '0')}`;
  };
  const disponibles = cat.productos
    .map((p) => ({ producto: p, variantes: cat.variantesPorProducto.get(p.id) || [] }))
    .filter(({ variantes }) => disponibilidad(variantes).hayStock)
    .sort((a, b) => ordenCategoria(a.producto).localeCompare(ordenCategoria(b.producto)) || a.producto.nombre.localeCompare(b.producto.nombre, 'es'));

  const zonaLista = el('div');
  const zonaVista = el('div', { clase: 'vista-previa' });
  const botonCompartir = el('button', { type: 'button', clase: 'boton boton--grande', onClick: compartir });
  const progreso = el('p', { clase: 'campo__ayuda', 'aria-live': 'polite' });

  const visibles = () => disponibles.filter(({ producto }) => genero === 'Todos' || generoProducto(producto, cat.categoriaPorId) === genero);
  const elegidos = () => visibles().filter(({ producto }) => !desmarcados.has(producto.id));

  function actualizarBoton() {
    const n = elegidos().length;
    botonCompartir.disabled = n === 0;
    botonCompartir.textContent = formato === 'texto'
      ? `Enviar lista por WhatsApp (${n})`
      : `Compartir ${n} ${n === 1 ? 'imagen' : 'imágenes'}`;
  }

  function dibujarLista() {
    const lista = visibles();
    if (!lista.length) {
      montar(zonaLista, el('p', { clase: 'vacio' }, disponibles.length ? 'No hay productos con stock en este filtro.' : 'No hay productos con stock para compartir.'));
      actualizarBoton();
      return;
    }
    let categoriaActual = '';
    const filas = [];
    for (const { producto, variantes } of lista) {
      const categoria = nombreCategoria(producto.categoriaId, cat.categoriaPorId) || 'Sin categoría';
      if (categoria !== categoriaActual) {
        categoriaActual = categoria;
        filas.push(el('li', { clase: 'grupo-titulo' }, categoria));
      }
      const id = `sel-${producto.id}`;
      const d = disponibilidad(variantes);
      filas.push(el('li', {},
        el('label', { for: id, clase: 'seleccion' },
          el('input', { type: 'checkbox', id, checked: !desmarcados.has(producto.id), onChange: (e) => {
            if (e.target.checked) desmarcados.delete(producto.id); else desmarcados.add(producto.id);
            actualizarBoton();
            vistaPrevia();
          } }),
          esImagenSegura(producto.foto) ? el('img', { src: producto.foto, alt: '', clase: 'miniatura' }) : el('span', { clase: 'miniatura miniatura--vacia', 'aria-hidden': 'true' }, producto.nombre[0]),
          el('span', { clase: 'resultado__texto' }, el('strong', {}, producto.nombre),
            el('small', {}, [pesos(producto.precio), ...d.lineas].join(' · '))),
          d.ultima ? el('span', { clase: 'etiqueta etiqueta--alerta' }, 'Última') : null)));
    }
    montar(zonaLista, el('ul', { clase: 'lista-seleccion' }, filas));
    actualizarBoton();
  }

  let urlVista = null;
  let turnoVista = 0;
  async function vistaPrevia() {
    const turno = ++turnoVista;
    if (urlVista) { URL.revokeObjectURL(urlVista); urlVista = null; }
    const primero = elegidos()[0];
    if (formato === 'texto') {
      const texto = listaDePrecios({ grupos: agrupar(elegidos()), negocio });
      montar(zonaVista, el('pre', { clase: 'vista-texto' }, texto));
      return;
    }
    if (!primero) { montar(zonaVista); return; }
    montar(zonaVista, el('p', { clase: 'campo__ayuda' }, 'Preparando vista previa…'));
    try {
      const blob = await generarTarjeta({ ...primero, negocio, formato });
      if (turno !== turnoVista) return;
      urlVista = URL.createObjectURL(blob);
      montar(zonaVista,
        el('p', { clase: 'campo__ayuda' }, `Vista previa: ${primero.producto.nombre}`),
        el('img', { src: urlVista, alt: `Vista previa de la imagen de ${primero.producto.nombre}`, clase: `vista-imagen vista-imagen--${formato}` }));
    } catch {
      montar(zonaVista, el('p', { clase: 'campo__ayuda' }, 'No se pudo generar la vista previa.'));
    }
  }

  function agrupar(items) {
    const grupos = [];
    for (const it of items) {
      const titulo = nombreCategoria(it.producto.categoriaId, cat.categoriaPorId).replace(' › ', ' – ') || 'Otros';
      let g = grupos.find((x) => x.titulo === titulo);
      if (!g) { g = { titulo, items: [] }; grupos.push(g); }
      g.items.push(it);
    }
    return grupos;
  }

  async function compartir() {
    const items = elegidos();
    if (!items.length) return;

    if (formato === 'texto') {
      abrirWhatsApp('', listaDePrecios({ grupos: agrupar(items), negocio }));
      return;
    }

    botonCompartir.disabled = true;
    try {
      const archivos = [];
      for (const [i, item] of items.entries()) {
        progreso.textContent = `Preparando imagen ${i + 1} de ${items.length}…`;
        const blob = await generarTarjeta({ ...item, negocio, formato });
        const nombre = `${String(i + 1).padStart(2, '0')}_${item.producto.nombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 40)}.jpg`;
        archivos.push(new File([blob], nombre, { type: 'image/jpeg' }));
      }
      progreso.textContent = '';

      if (navigator.share && archivos.length && puedeCompartirTodos(archivos)) {
        try {
          await navigator.share({ files: archivos, title: negocio?.nombre || 'Catálogo' });
          avisar('Catálogo compartido');
        } catch (e) {
          if (e?.name !== 'AbortError') throw e;
        }
      } else {
        // Notebook u otros: galería para guardar cada imagen
        mostrarGaleria(archivos);
      }
    } catch (error) {
      console.error(error);
      avisar('No se pudo compartir. Probá con menos productos.', 'error');
    } finally {
      progreso.textContent = '';
      actualizarBoton();
    }
  }

  function mostrarGaleria(archivos) {
    turnoVista += 1;
    if (urlVista) { URL.revokeObjectURL(urlVista); urlVista = null; }
    const marca = marcaTiempo();
    montar(zonaVista,
      el('div', { clase: 'alerta alerta--info' }, `Listas ${archivos.length} ${archivos.length === 1 ? 'imagen' : 'imágenes'}. Guardá las que quieras y después subilas a WhatsApp o Instagram.`),
      el('ul', { clase: 'galeria' }, archivos.map((a) => {
        const url = URL.createObjectURL(a);
        return el('li', {},
          el('img', { src: url, alt: a.name, clase: `vista-imagen vista-imagen--${formato}` }),
          el('a', { href: url, download: `catalogo_${marca}_${a.name}`, clase: 'boton boton--chico boton--secundario' }, 'Descargar'));
      })));
    zonaVista.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function puedeCompartirTodos(archivos) {
    try { return navigator.canShare?.({ files: archivos }) ?? puedeCompartir(archivos[0]); } catch { return false; }
  }

  const chipGenero = (valor) => el('button', { type: 'button', clase: 'filtro', 'aria-pressed': String(genero === valor), onClick: (e) => {
    genero = valor;
    e.currentTarget.parentElement.querySelectorAll('.filtro').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget)));
    dibujarLista();
    vistaPrevia();
  } }, valor);

  const selectorFormato = el('div', { clase: 'segmentado', role: 'radiogroup', 'aria-label': 'Formato' },
    [['historia', 'Historia'], ['cuadrada', 'Cuadrada'], ['texto', 'Lista de texto']].map(([valor, texto]) => el('label', {},
      el('input', { type: 'radio', name: 'formato-catalogo', value: valor, checked: formato === valor, onChange: () => {
        formato = valor; actualizarBoton(); vistaPrevia(); ayudaFormato.textContent = AYUDAS[valor];
      } }), texto)));
  const AYUDAS = {
    historia: 'Vertical, una imagen por producto. Ideal para estados de WhatsApp e historias de Instagram.',
    cuadrada: 'Una imagen por producto. Ideal para mandar por chat o publicar en el feed.',
    texto: 'Un solo mensaje con todos los productos, precios y talles. Rápido y liviano.'
  };
  const ayudaFormato = el('p', { clase: 'campo__ayuda' }, AYUDAS[formato]);

  const faltanDatos = !negocio?.whatsapp && !negocio?.instagram;

  montar(contenedor,
    volver('#/mas'),
    el('h1', { clase: 'titulo-pantalla' }, 'Compartir catálogo'),
    faltanDatos ? el('a', { href: '#/mas/config/negocio', clase: 'alerta' },
      'Cargá tu WhatsApp e Instagram en Configuración › Datos del negocio para que aparezcan en las imágenes. Tocá acá.') : null,
    el('div', { clase: 'tarjeta' },
      el('div', { clase: 'campo' }, el('span', { clase: 'campo__etiqueta' }, 'Formato'), selectorFormato, ayudaFormato)),
    el('div', { clase: 'tarjeta' },
      el('div', { clase: 'cabecera-lista' },
        el('h2', { clase: 'campo__etiqueta' }, 'Productos con stock'),
        el('div', { clase: 'botonera' },
          el('button', { type: 'button', clase: 'boton boton--texto boton--mini', onClick: () => { visibles().forEach(({ producto }) => desmarcados.delete(producto.id)); dibujarLista(); vistaPrevia(); } }, 'Todos'),
          el('button', { type: 'button', clase: 'boton boton--texto boton--mini', onClick: () => { visibles().forEach(({ producto }) => desmarcados.add(producto.id)); dibujarLista(); vistaPrevia(); } }, 'Ninguno'))),
      el('div', { clase: 'filtros' }, ['Todos', 'Dama', 'Caballero'].map(chipGenero)),
      zonaLista),
    zonaVista,
    progreso,
    el('div', { clase: 'botonera' }, botonCompartir),
    el('details', { clase: 'tarjeta ayuda-compartir' },
      el('summary', {}, '¿Cómo mandarlo a muchos contactos?'),
      el('ol', { clase: 'pasos' },
        el('li', {}, el('strong', {}, 'Estado de WhatsApp: '), 'tocá Compartir → WhatsApp → "Mi estado". Lo ven todos tus contactos.'),
        el('li', {}, el('strong', {}, 'Lista de difusión: '), 'en WhatsApp Business, Chats → ⋯ → "Nueva difusión", elegí los contactos y guardala. Después, al compartir, elegí esa lista: le llega a cada uno por privado.'),
        el('li', {}, el('strong', {}, 'Contactos sueltos: '), 'WhatsApp deja elegir pocos chats a la vez; para más, usá una lista de difusión.'),
        el('li', {}, el('strong', {}, 'Instagram: '), 'elegí Instagram → Historias, o guardá las imágenes y subilas desde la app.')),
      el('p', { clase: 'campo__ayuda' }, 'Las imágenes muestran solo los talles y colores con stock en este momento. Los productos agotados no aparecen.'))
  );
  dibujarLista();
  vistaPrevia();
}
