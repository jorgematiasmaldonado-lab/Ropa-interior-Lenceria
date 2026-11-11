/*
 * Configuración: datos del negocio, categorías, listas editables y preferencias.
 * Rutas: #/mas/config · #/mas/config/negocio · #/mas/config/categorias
 *        #/mas/config/listas · #/mas/config/listas/<tipo> · #/mas/config/preferencias
 */
import { el, icono, montar } from '../util/dom.js';
import { avisar, confirmar, pedirTexto } from '../util/avisos.js';
import * as validar from '../util/validacion.js';
import { procesarImagen, esImagenSegura } from '../util/imagenes.js';
import { listar, crear, actualizar, eliminar, leerUnico, guardarUnico } from '../datos/repositorios.js';
import { aplicarTema, refrescarEncabezado, configurarInactividad } from '../app.js';

const TRAZOS = {
  arriba: ['M12 19V5M6 11l6-6 6 6'],
  abajo: ['M12 5v14M6 13l6 6 6-6'],
  lapiz: ['M4 20h4L19 9l-4-4L4 16v4Z'],
  papelera: ['M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13']
};

/** Listas que la usuaria puede editar (medios de pago y tipos de entrega quedan fijos). */
const LISTAS_EDITABLES = {
  talle: { titulo: 'Talles', ayuda: 'Ej.: 90, 95, M, L/XL' },
  color: { titulo: 'Colores', ayuda: 'Ej.: Negro, Nude, Rojo' },
  tela: { titulo: 'Telas', ayuda: 'Ej.: Algodón, Encaje, Lycra' },
  marca: { titulo: 'Marcas', ayuda: 'Ej.: Marcela Koury, Capicúa' },
  categoriaGasto: { titulo: 'Categorías de gastos', ayuda: 'Ej.: Publicidad, Envíos' },
  canal: { titulo: 'Canales de venta', ayuda: 'Ej.: WhatsApp, Instagram' }
};

export async function mostrar(contenedor, partes = []) {
  const [seccion, detalle] = partes;
  if (seccion === 'negocio') return pantallaNegocio(contenedor);
  if (seccion === 'categorias') return pantallaCategorias(contenedor);
  if (seccion === 'listas' && LISTAS_EDITABLES[detalle]) return pantallaLista(contenedor, detalle);
  if (seccion === 'listas') return pantallaListas(contenedor);
  if (seccion === 'preferencias') return pantallaPreferencias(contenedor);
  return pantallaMenu(contenedor);
}

/* =========================================================
   Menú principal de Configuración
   ========================================================= */
function pantallaMenu(contenedor) {
  const opciones = [
    ['#/mas/config/negocio', 'Datos del negocio', 'Nombre, logo, WhatsApp, Instagram y comprobante'],
    ['#/mas/config/categorias', 'Categorías de productos', 'Subcategorías de Dama y Caballero'],
    ['#/mas/config/listas', 'Listas', 'Talles, colores, telas, marcas, gastos y canales'],
    ['#/mas/config/preferencias', 'Preferencias', 'Tema, inactividad y recordatorio de respaldo']
  ];
  montar(contenedor,
    botonVolver('#/mas'),
    el('h1', { clase: 'titulo-pantalla' }, 'Configuración'),
    listaEnlaces(opciones)
  );
}

function listaEnlaces(opciones) {
  return el('ul', { clase: 'lista' },
    opciones.map(([href, titulo, detalle]) => el('li', {},
      el('a', { href, clase: 'lista__item' },
        el('span', {}, titulo, detalle ? el('small', {}, detalle) : null),
        el('span', { clase: 'lista__flecha', 'aria-hidden': 'true' }, '›')
      )
    ))
  );
}

function botonVolver(href) {
  return el('p', { clase: 'volver' }, el('a', { href, clase: 'boton boton--secundario boton--chico' }, '‹ Volver'));
}

/* =========================================================
   Datos del negocio
   ========================================================= */
async function pantallaNegocio(contenedor) {
  const negocio = (await leerUnico('negocio')) || {};
  let logoNuevo; // undefined = sin cambios · null = quitar · string = nuevo logo

  const campos = {
    nombre: campoTexto('nombre', 'Nombre del emprendimiento', negocio.nombre, { max: 60, obligatorio: true }),
    duena: campoTexto('duena', 'Nombre de la dueña', negocio.duena, { max: 60 }),
    whatsapp: campoTexto('whatsapp', 'WhatsApp', negocio.whatsapp, {
      tipo: 'tel', max: 20, ayuda: 'Con código de área, sin 0 ni 15. Ej.: 3541 123456', modoTeclado: 'tel'
    }),
    instagram: campoTexto('instagram', 'Instagram', negocio.instagram, { max: 40, prefijo: '@' }),
    cuit: campoTexto('cuit', 'CUIT (opcional)', negocio.cuit, { max: 13, modoTeclado: 'numeric' }),
    notaComprobante: campoTexto('notaComprobante', 'Nota del comprobante', negocio.notaComprobante, {
      max: 300, multilinea: true, ayuda: 'Aparece en todos los comprobantes. Ej.: política de cambios, alias para transferencias.'
    }),
    leyendaComprobante: campoTexto('leyendaComprobante', 'Leyenda legal del comprobante', negocio.leyendaComprobante || 'Documento no válido como factura', { max: 80 })
  };

  // ----- Logo -----
  let vistaActual = el('div', { clase: 'logo-editor__vista' });
  const dibujarLogo = () => {
    const valor = logoNuevo === undefined ? negocio.logo : logoNuevo;
    const nueva = esImagenSegura(valor)
      ? el('img', { src: valor, alt: 'Logo del negocio', clase: 'logo-editor__vista' })
      : el('div', { clase: 'logo-editor__vista logo-editor__vacio' }, 'Sin logo');
    vistaActual.replaceWith(nueva);
    vistaActual = nueva;
  };

  const errorLogo = el('span', { clase: 'campo__error', role: 'alert' });
  const entradaArchivo = el('input', {
    type: 'file', accept: 'image/png,image/jpeg,image/webp', clase: 'archivo-oculto', id: 'archivo-logo',
    onChange: async (e) => {
      errorLogo.textContent = '';
      const archivo = e.target.files?.[0];
      e.target.value = '';
      if (!archivo) return;
      try {
        logoNuevo = await procesarImagen(archivo, { lado: 256, formato: 'image/png' });
        dibujarLogo();
        avisar('Logo listo. Tocá "Guardar cambios".');
      } catch (error) {
        errorLogo.textContent = error.message;
      }
    }
  });

  const zonaLogo = el('div', { clase: 'logo-editor' },
    vistaActual,
    el('div', {},
      el('div', { clase: 'botonera' },
        el('label', { for: 'archivo-logo', clase: 'boton boton--chico', tabindex: '0', role: 'button',
          onKeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); entradaArchivo.click(); } } }, 'Elegir logo'),
        el('button', { type: 'button', clase: 'boton boton--texto', onClick: () => { logoNuevo = null; dibujarLogo(); } }, 'Quitar')
      ),
      el('span', { clase: 'campo__ayuda' }, 'PNG, JPG o WEBP. Se achica automáticamente.'),
      errorLogo,
      entradaArchivo
    )
  );

  // ----- Guardar -----
  const form = el('form', {
    novalidate: true,
    onSubmit: async (e) => {
      e.preventDefault();
      limpiarErrores(campos);
      try {
        const datos = {
          nombre: validar.texto('nombre', campos.nombre.valor(), { obligatorio: true, max: 60, etiqueta: 'El nombre' }),
          duena: validar.texto('duena', campos.duena.valor(), { max: 60, etiqueta: 'El nombre' }),
          whatsapp: validar.whatsapp('whatsapp', campos.whatsapp.valor()),
          instagram: validar.instagram('instagram', campos.instagram.valor()),
          cuit: validar.cuit('cuit', campos.cuit.valor()),
          notaComprobante: validar.textoLargo('notaComprobante', campos.notaComprobante.valor(), { max: 300, etiqueta: 'La nota' }),
          leyendaComprobante: validar.texto('leyendaComprobante', campos.leyendaComprobante.valor(), { max: 80, etiqueta: 'La leyenda' }) || 'Documento no válido como factura'
        };
        if (logoNuevo !== undefined) datos.logo = logoNuevo;
        await guardarUnico('negocio', datos);
        Object.assign(negocio, datos);
        logoNuevo = undefined;
        // Mostrar los valores ya limpios (ej.: CUIT con guiones)
        for (const [clave, campo] of Object.entries(campos)) campo.poner(datos[clave] ?? '');
        await refrescarEncabezado();
        avisar('Datos guardados');
      } catch (error) {
        if (error instanceof validar.ErrorValidacion && campos[error.campo]) {
          campos[error.campo].marcarError(error.message);
        } else {
          console.error(error);
          avisar('No se pudo guardar. Intentá de nuevo.', 'error');
        }
      }
    }
  },
    el('div', { clase: 'tarjeta' },
      el('h2', { clase: 'campo__etiqueta' }, 'Logo'),
      zonaLogo,
      campos.nombre.nodo, campos.duena.nodo
    ),
    el('div', { clase: 'tarjeta' },
      el('h2', { clase: 'campo__etiqueta' }, 'Contacto'),
      campos.whatsapp.nodo, campos.instagram.nodo, campos.cuit.nodo
    ),
    el('div', { clase: 'tarjeta' },
      el('h2', { clase: 'campo__etiqueta' }, 'Comprobante de venta'),
      el('p', { clase: 'campo__ayuda' }, 'El comprobante muestra: producto, precio, método de pago y esta información.'),
      campos.notaComprobante.nodo, campos.leyendaComprobante.nodo
    ),
    el('div', { clase: 'botonera' }, el('button', { type: 'submit', clase: 'boton' }, 'Guardar cambios'))
  );

  montar(contenedor, botonVolver('#/mas/config'), el('h1', { clase: 'titulo-pantalla' }, 'Datos del negocio'), form);
  dibujarLogo();
}

/** Crea un campo de formulario con etiqueta, ayuda y mensaje de error. */
function campoTexto(id, etiqueta, valor = '', { tipo = 'text', max = 80, obligatorio = false, multilinea = false, ayuda = '', prefijo = '', modoTeclado = '' } = {}) {
  const idCampo = `campo-${id}`;
  const idError = `${idCampo}-error`;
  const atributos = {
    id: idCampo, name: id, maxlength: max, autocomplete: 'off',
    'aria-describedby': idError, required: obligatorio, inputmode: modoTeclado || null
  };
  const entrada = multilinea
    ? el('textarea', atributos)
    : el('input', { ...atributos, type: tipo });
  entrada.value = valor || '';

  const error = el('span', { clase: 'campo__error', id: idError, role: 'alert' });
  const nodo = el('div', { clase: 'campo' },
    el('label', { for: idCampo, clase: 'campo__etiqueta' }, etiqueta, obligatorio ? ' *' : ''),
    prefijo ? el('div', { clase: 'prefijo' }, el('span', { clase: 'prefijo__texto' }, prefijo), entrada) : entrada,
    ayuda ? el('span', { clase: 'campo__ayuda' }, ayuda) : null,
    error
  );
  return {
    nodo,
    valor: () => entrada.value,
    poner: (v) => { entrada.value = v; },
    marcarError: (mensaje) => {
      error.textContent = mensaje;
      entrada.setAttribute('aria-invalid', 'true');
      entrada.focus();
    },
    limpiar: () => { error.textContent = ''; entrada.removeAttribute('aria-invalid'); }
  };
}

function limpiarErrores(campos) {
  Object.values(campos).forEach((c) => c.limpiar());
}

/* =========================================================
   Categorías de productos (Dama / Caballero)
   ========================================================= */
async function pantallaCategorias(contenedor) {
  const todas = await listar('categorias');
  const principales = todas.filter((c) => !c.padreId).sort(porOrden);

  const secciones = principales.map((padre) => {
    const zona = el('div');
    editorLista(zona, {
      tabla: 'categorias',
      campo: 'nombre',
      filtro: (c) => c.padreId === padre.id,
      nuevo: (nombre, orden) => ({ nombre, genero: padre.genero, padreId: padre.id, orden }),
      placeholder: `Nueva categoría de ${padre.nombre}`,
      avisoEliminar: 'Los productos que ya usan esta categoría no se modifican.'
    });
    return [el('h2', { clase: 'subtitulo' }, padre.nombre), zona];
  });

  montar(contenedor,
    botonVolver('#/mas/config'),
    el('h1', { clase: 'titulo-pantalla' }, 'Categorías'),
    el('p', { clase: 'campo__ayuda' }, 'Organizan los productos en Inventario y en los reportes.'),
    secciones
  );
}

/* =========================================================
   Listas (talles, colores, etc.)
   ========================================================= */
function pantallaListas(contenedor) {
  montar(contenedor,
    botonVolver('#/mas/config'),
    el('h1', { clase: 'titulo-pantalla' }, 'Listas'),
    listaEnlaces(Object.entries(LISTAS_EDITABLES).map(([tipo, { titulo, ayuda }]) =>
      [`#/mas/config/listas/${tipo}`, titulo, ayuda])),
    el('p', { clase: 'campo__ayuda' }, 'Los medios de pago (Efectivo y Transferencia) y los tipos de envío son fijos.')
  );
}

function pantallaLista(contenedor, tipo) {
  const info = LISTAS_EDITABLES[tipo];
  const zona = el('div');
  montar(contenedor,
    botonVolver('#/mas/config/listas'),
    el('h1', { clase: 'titulo-pantalla' }, info.titulo),
    zona
  );
  editorLista(zona, {
    tabla: 'listas',
    campo: 'valor',
    filtro: (r) => r.tipo === tipo,
    nuevo: (valor, orden) => ({ tipo, valor, orden, activo: true }),
    placeholder: info.ayuda,
    avisoEliminar: 'Lo que ya está cargado con este valor no se modifica.'
  });
}

const porOrden = (a, b) => (a.orden ?? 0) - (b.orden ?? 0);
const mismoNombre = (a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }) === 0;

/**
 * Editor genérico de listas: agregar, renombrar, ordenar y eliminar.
 */
function editorLista(zona, { tabla, campo, filtro, nuevo, placeholder, avisoEliminar }) {
  const entrada = el('input', { type: 'text', maxlength: 40, placeholder, autocomplete: 'off', 'aria-label': placeholder });
  const errorAgregar = el('span', { clase: 'campo__error', role: 'alert' });
  const listaNodo = el('ul', { clase: 'lista-edicion' });
  let items = [];

  async function recargar() {
    items = (await listar(tabla)).filter(filtro).sort(porOrden);
    if (!items.length) {
      montar(listaNodo, el('li', { clase: 'vacio' }, 'Todavía no hay elementos.'));
      return;
    }
    montar(listaNodo, items.map((item, i) => el('li', {},
      el('div', { clase: 'fila' },
        el('span', { clase: 'fila__nombre' }, item[campo]),
        botonIcono(TRAZOS.arriba, `Subir ${item[campo]}`, () => mover(i, -1), i === 0),
        botonIcono(TRAZOS.abajo, `Bajar ${item[campo]}`, () => mover(i, 1), i === items.length - 1),
        botonIcono(TRAZOS.lapiz, `Renombrar ${item[campo]}`, () => renombrar(item)),
        botonIcono(TRAZOS.papelera, `Eliminar ${item[campo]}`, () => borrar(item), false, true)
      )
    )));
  }

  function validarNombre(valor, excepto = null) {
    const nombre = validar.texto('nombre', valor, { obligatorio: true, max: 40, etiqueta: 'El nombre' });
    if (items.some((it) => it.id !== excepto && mismoNombre(it[campo], nombre))) {
      throw new validar.ErrorValidacion('nombre', `"${nombre}" ya está en la lista.`);
    }
    return nombre;
  }

  async function agregar(e) {
    e.preventDefault();
    errorAgregar.textContent = '';
    try {
      const nombre = validarNombre(entrada.value);
      const orden = items.length ? Math.max(...items.map((it) => it.orden ?? 0)) + 1 : 0;
      await crear(tabla, nuevo(nombre, orden));
      entrada.value = '';
      await recargar();
      avisar(`"${nombre}" agregado`);
      entrada.focus();
    } catch (error) {
      errorAgregar.textContent = error.message;
    }
  }

  async function renombrar(item) {
    const valor = await pedirTexto({ titulo: 'Renombrar', valor: item[campo] });
    if (valor === null) return;
    try {
      const nombre = validarNombre(valor, item.id);
      if (nombre === item[campo]) return;
      await actualizar(tabla, item.id, { [campo]: nombre });
      await recargar();
      avisar('Nombre actualizado');
    } catch (error) {
      avisar(error.message, 'error');
    }
  }

  async function borrar(item) {
    const ok = await confirmar({
      titulo: `¿Eliminar "${item[campo]}"?`,
      mensaje: avisoEliminar,
      aceptar: 'Eliminar',
      peligro: true
    });
    if (!ok) return;
    await eliminar(tabla, item.id);
    await recargar();
    avisar('Eliminado');
  }

  async function mover(indice, direccion) {
    const destino = indice + direccion;
    if (destino < 0 || destino >= items.length) return;
    const ordenados = [...items];
    [ordenados[indice], ordenados[destino]] = [ordenados[destino], ordenados[indice]];
    for (let i = 0; i < ordenados.length; i++) {
      if (ordenados[i].orden !== i) await actualizar(tabla, ordenados[i].id, { orden: i });
    }
    await recargar();
  }

  montar(zona,
    el('form', { clase: 'agregar', onSubmit: agregar, novalidate: true },
      entrada,
      el('button', { type: 'submit', clase: 'boton' }, 'Agregar')
    ),
    errorAgregar,
    listaNodo
  );
  recargar();
}

function botonIcono(trazos, etiqueta, accion, deshabilitado = false, peligro = false) {
  return el('button', {
    type: 'button',
    clase: `boton-icono ${peligro ? 'boton-icono--peligro' : ''}`,
    'aria-label': etiqueta,
    title: etiqueta,
    disabled: deshabilitado,
    onClick: accion
  }, icono(...trazos));
}

/* =========================================================
   Preferencias
   ========================================================= */
async function pantallaPreferencias(contenedor) {
  const pref = (await leerUnico('preferencias')) || {};

  async function guardar(cambios, mensaje = 'Guardado') {
    try {
      await guardarUnico('preferencias', cambios);
      Object.assign(pref, cambios);
      avisar(mensaje);
    } catch (error) {
      console.error(error);
      avisar('No se pudo guardar.', 'error');
    }
  }

  // Tema
  const temas = [['claro', 'Claro'], ['oscuro', 'Oscuro'], ['auto', 'Automático']];
  const selectorTema = el('div', { clase: 'segmentado', role: 'radiogroup', 'aria-label': 'Tema' },
    temas.map(([valor, texto]) => el('label', {},
      el('input', {
        type: 'radio', name: 'tema', value: valor, checked: (pref.tema || 'oscuro') === valor,
        onChange: async () => { aplicarTema(valor); await guardar({ tema: valor }, `Tema ${texto.toLowerCase()}`); }
      }),
      texto
    ))
  );

  // Inactividad
  const opcionesInactividad = [[15, '15 minutos'], [30, '30 minutos'], [60, '1 hora'], [0, 'Nunca']];
  const actual = pref.minutosInactividad ?? 30;
  const selectInactividad = el('select', {
    id: 'pref-inactividad',
    onChange: async (e) => {
      const minutos = Number(e.target.value);
      configurarInactividad(minutos);
      await guardar({ minutosInactividad: minutos });
    }
  }, opcionesInactividad.map(([valor, texto]) => el('option', { value: valor, selected: valor === actual }, texto)));

  // Recordatorio de respaldo
  const errorDias = el('span', { clase: 'campo__error', role: 'alert' });
  const entradaDias = el('input', {
    id: 'pref-dias', type: 'number', min: 1, max: 30, step: 1, inputmode: 'numeric',
    value: pref.diasRecordatorioRespaldo ?? 7,
    onChange: async (e) => {
      errorDias.textContent = '';
      e.target.removeAttribute('aria-invalid');
      try {
        const dias = validar.entero('dias', e.target.value, { min: 1, max: 30, etiqueta: 'La cantidad de días' });
        await guardar({ diasRecordatorioRespaldo: dias });
      } catch (error) {
        errorDias.textContent = error.message;
        e.target.setAttribute('aria-invalid', 'true');
      }
    }
  });

  montar(contenedor,
    botonVolver('#/mas/config'),
    el('h1', { clase: 'titulo-pantalla' }, 'Preferencias'),
    el('div', { clase: 'tarjeta' },
      el('div', { clase: 'campo' },
        el('span', { clase: 'campo__etiqueta' }, 'Tema'),
        selectorTema,
        el('span', { clase: 'campo__ayuda' }, 'Automático usa el mismo modo que el teléfono o la notebook.')
      )
    ),
    el('div', { clase: 'tarjeta' },
      el('div', { clase: 'campo' },
        el('label', { for: 'pref-inactividad', clase: 'campo__etiqueta' }, 'Volver a Inicio después de'),
        selectInactividad,
        el('span', { clase: 'campo__ayuda' }, 'Si la app queda sin usar ese tiempo, vuelve a la pantalla de Inicio.')
      ),
      el('div', { clase: 'campo' },
        el('label', { for: 'pref-dias', clase: 'campo__etiqueta' }, 'Recordarme hacer un respaldo cada (días)'),
        entradaDias,
        errorDias
      )
    ),
    el('p', { clase: 'campo__ayuda' }, 'Los cambios se guardan automáticamente.')
  );
}
