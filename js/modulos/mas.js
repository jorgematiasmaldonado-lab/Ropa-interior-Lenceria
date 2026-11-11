/*
 * Pantalla "Más": accesos a otros módulos, instalación y datos de la app.
 */
import { el, montar } from '../util/dom.js';
import { fechaHora } from '../util/formato.js';
import { leerMeta } from '../datos/repositorios.js';
import { VERSION_APP } from '../version.js';
import { estado, pedirInstalacion } from '../app.js';

const MODULOS = [
  ['#/mas/clientes', 'Clientes y deudas', 'Fichas, fiado y recordatorios por WhatsApp'],
  ['#/mas/reportes', 'Reportes', 'Ganancia, lo más vendido, inventario y Excel'],
  ['#/mas/respaldos', 'Respaldos', 'Guardar y recuperar todos tus datos'],
  ['#/inventario/compras', 'Compras y proveedores', 'Ingreso de mercadería en pesos o dólares'],
  ['#/mas/config', 'Configuración', 'Datos del negocio, logo, listas y tema']
];

export async function mostrar(contenedor, ruta, resto = []) {
  const [sub] = resto;
  if (sub === 'instalar') return mostrarInstalar(contenedor);
  if (sub === 'config') return (await import('./configuracion.js')).mostrar(contenedor, resto.slice(1));
  if (sub === 'clientes') return (await import('./clientes.js')).mostrar(contenedor, resto.slice(1));
  if (sub === 'reportes') return (await import('./reportes.js')).mostrar(contenedor, resto.slice(1));
  if (sub === 'respaldos') return (await import('./respaldos.js')).mostrar(contenedor, resto.slice(1));

  const instaladaEl = await leerMeta('instaladaEl');
  const persistente = navigator.storage?.persisted ? await navigator.storage.persisted() : false;
  let ocupado = '';
  if (navigator.storage?.estimate) {
    const { usage } = await navigator.storage.estimate();
    ocupado = `${(usage / 1024 / 1024).toFixed(1)} MB usados`;
  }

  montar(contenedor,
    el('h1', { clase: 'titulo-pantalla' }, 'Más opciones'),

    el('ul', { clase: 'lista' },
      MODULOS.map(([href, titulo, detalle]) => el('li', {},
        el('a', { href, clase: 'lista__item' },
          el('span', {}, titulo, el('small', {}, detalle)),
          el('span', { clase: 'lista__flecha', 'aria-hidden': 'true' }, '›')
        )
      ))
    ),

    el('h2', { clase: 'subtitulo' }, 'La app'),
    el('ul', { clase: 'lista' },
      el('li', {}, el('a', { href: '#/mas/instalar', clase: 'lista__item' },
        el('span', {}, estado.instalada ? 'App instalada' : 'Instalar la app',
          el('small', {}, 'En iPhone, tablet o notebook')),
        el('span', { clase: 'lista__flecha', 'aria-hidden': 'true' }, '›')
      )),
      el('li', {}, el('div', { clase: 'lista__item' },
        el('span', {}, 'Almacenamiento',
          el('small', {}, [persistente ? 'Protegido (el navegador no lo borra solo)' : 'No protegido: hacé respaldos seguido', ocupado].filter(Boolean).join(' · '))),
        el('span', { clase: 'etiqueta' }, persistente ? 'OK' : 'Atención')
      )),
      el('li', {}, el('div', { clase: 'lista__item' },
        el('span', {}, `Versión ${VERSION_APP}`,
          el('small', {}, instaladaEl ? `En uso desde ${fechaHora(instaladaEl)}` : '')),
        el('span', { clase: 'etiqueta' }, navigator.onLine ? 'En línea' : 'Sin conexión')
      ))
    ),

    el('p', { clase: 'balance__etiqueta' },
      'Tus datos se guardan solo en este dispositivo. No se envían a ningún servidor.')
  );
}

function mostrarInstalar(contenedor) {
  const esIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  const iphone = el('div', { clase: 'tarjeta' },
    el('h2', {}, 'iPhone / iPad'),
    el('ol', { clase: 'pasos' },
      el('li', {}, 'Abrí la app en ', el('strong', {}, 'Safari'), '.'),
      el('li', {}, 'Tocá el botón ', el('strong', {}, 'Compartir'), ' (el cuadrado con la flecha hacia arriba).'),
      el('li', {}, 'Elegí ', el('strong', {}, 'Agregar a pantalla de inicio'), ' y después ', el('strong', {}, 'Agregar'), '.'),
      el('li', {}, 'Abrí la app siempre desde el ícono nuevo de tu pantalla de inicio.')
    ),
    el('p', { clase: 'balance__etiqueta' },
      'Importante: en iPhone, si la app no se usa por varias semanas, el sistema puede borrar los datos. Hacé respaldos seguido.')
  );

  const notebook = el('div', { clase: 'tarjeta' },
    el('h2', {}, 'Notebook / PC (Chrome o Edge)'),
    estado.puedeInstalar
      ? el('p', {}, el('button', { type: 'button', clase: 'boton', onClick: pedirInstalacion }, 'Instalar ahora'))
      : null,
    el('ol', { clase: 'pasos' },
      el('li', {}, 'En la barra de direcciones, tocá el ícono de ', el('strong', {}, 'Instalar'), ' (una pantalla con una flecha).'),
      el('li', {}, 'Si no aparece: menú ', el('strong', {}, '⋮'), ' → ', el('strong', {}, 'Transmitir, guardar y compartir'), ' → ', el('strong', {}, 'Instalar página como app'), '.'),
      el('li', {}, 'La app queda en el escritorio y en el menú de inicio.')
    )
  );

  montar(contenedor,
    el('p', {}, el('a', { href: '#/mas', clase: 'boton boton--secundario boton--chico' }, '‹ Volver')),
    el('h1', { clase: 'titulo-pantalla' }, 'Instalar la app'),
    estado.instalada ? el('div', { clase: 'alerta alerta--info' }, 'Ya estás usando la app instalada.') : null,
    esIOS ? [iphone, notebook] : [notebook, iphone]
  );
}
