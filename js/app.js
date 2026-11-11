/*
 * Arranque de la app: base de datos, navegación entre pantallas,
 * indicador de conexión, actualizaciones e inactividad.
 */
import { abrirDB } from './datos/db.js';
import { cargarDatosIniciales } from './datos/datos-iniciales.js';
import { leerUnico } from './datos/repositorios.js';
import { el, montar } from './util/dom.js';
import { esImagenSegura } from './util/imagenes.js';

/** Estado compartido con otras pantallas. */
export const estado = {
  instalada: window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true,
  puedeInstalar: false
};

const contenido = document.getElementById('contenido');

/* ---------- Pantallas ---------- */
const PANTALLAS = {
  inicio: () => import('./modulos/inicio.js'),
  ventas: () => import('./modulos/ventas.js'),
  inventario: () => import('./modulos/inventario.js'),
  gastos: () => import('./modulos/gastos.js'),
  mas: () => import('./modulos/mas.js')
};

async function navegar() {
  const [ruta = 'inicio', ...resto] = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const nombre = PANTALLAS[ruta] ? ruta : 'inicio';

  document.querySelectorAll('.nav__item').forEach((a) => {
    if (a.dataset.ruta === nombre) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });

  try {
    const modulo = await PANTALLAS[nombre]();
    await modulo.mostrar(contenido, nombre, resto);
    window.scrollTo(0, 0);
  } catch (error) {
    mostrarError(error);
  }
}

function mostrarError(error) {
  console.error(error);
  // Mensaje simple, sin detalles internos.
  montar(contenido,
    el('div', { clase: 'alerta' }, 'Ocurrió un problema al mostrar esta pantalla. Cerrá y volvé a abrir la app.')
  );
}

/* ---------- Indicador de conexión ---------- */
function actualizarEstadoRed() {
  const etiqueta = document.getElementById('estado-red');
  const enLinea = navigator.onLine;
  etiqueta.textContent = enLinea ? 'En línea' : 'Sin conexión';
  etiqueta.classList.toggle('estado-red--offline', !enLinea);
}

/* ---------- Service Worker y actualizaciones ---------- */
async function registrarServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const registro = await navigator.serviceWorker.register('./sw.js', { scope: './' });

    const avisar = (sw) => {
      if (!sw) return;
      const aviso = document.getElementById('aviso-version');
      aviso.classList.remove('oculto');
      document.getElementById('boton-actualizar').onclick = () => sw.postMessage('ACTUALIZAR');
    };

    // Ya hay una versión nueva esperando
    if (registro.waiting && navigator.serviceWorker.controller) avisar(registro.waiting);

    registro.addEventListener('updatefound', () => {
      const nuevo = registro.installing;
      nuevo?.addEventListener('statechange', () => {
        if (nuevo.state === 'installed' && navigator.serviceWorker.controller) avisar(nuevo);
      });
    });

    // Cuando la nueva versión toma el control, se recarga la página (los datos no se pierden).
    let recargando = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (recargando) return;
      recargando = true;
      location.reload();
    });

    // Buscar actualizaciones al volver a la app
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && navigator.onLine) registro.update().catch(() => {});
    });
  } catch (error) {
    console.warn('No se pudo activar el modo sin conexión:', error);
  }
}

/* ---------- Instalación (Chrome / Edge) ---------- */
let eventoInstalar = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  eventoInstalar = e;
  estado.puedeInstalar = true;
});
window.addEventListener('appinstalled', () => {
  estado.instalada = true;
  estado.puedeInstalar = false;
  eventoInstalar = null;
});

export async function pedirInstalacion() {
  if (!eventoInstalar) return;
  eventoInstalar.prompt();
  await eventoInstalar.userChoice;
  eventoInstalar = null;
  estado.puedeInstalar = false;
  navegar();
}

/* ---------- Inactividad ---------- */
let minutosInactividad = 30; // 0 = nunca
let temporizador = null;

function reiniciarInactividad() {
  clearTimeout(temporizador);
  if (minutosInactividad > 0) {
    temporizador = setTimeout(alQuedarInactiva, minutosInactividad * 60 * 1000);
  }
}

function alQuedarInactiva() {
  // Vuelve a la pantalla de Inicio (sin PIN: se verá más adelante).
  if (location.hash !== '#/inicio') location.hash = '#/inicio';
  else navegar();
}

export function configurarInactividad(minutos) {
  minutosInactividad = Number(minutos) || 0;
  reiniciarInactividad();
}

/* ---------- Tema claro / oscuro ---------- */
export function aplicarTema(tema = 'oscuro') {
  const valor = ['claro', 'oscuro', 'auto'].includes(tema) ? tema : 'oscuro';
  document.documentElement.dataset.tema = valor;
  const oscuro = valor === 'oscuro' || (valor === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]').setAttribute('content', oscuro ? '#1E1718' : '#F5EEE6');
}
window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
  if (document.documentElement.dataset.tema === 'auto') aplicarTema('auto');
});

/* ---------- Encabezado (nombre y logo del negocio) ---------- */
export async function refrescarEncabezado() {
  const negocio = await leerUnico('negocio');
  if (!negocio) return;
  document.getElementById('nombre-negocio').textContent = negocio.nombre || 'Ropa Interior & Lencería';
  document.getElementById('nombre-duena').textContent = negocio.duena || '';
  document.title = negocio.nombre || 'Ropa Interior & Lencería';
  const logo = document.getElementById('logo-negocio');
  if (esImagenSegura(negocio.logo)) {
    logo.src = negocio.logo;
    logo.alt = `Logo de ${negocio.nombre}`;
    logo.classList.remove('oculto');
  } else {
    logo.removeAttribute('src');
    logo.classList.add('oculto');
  }
}

/* ---------- Arranque ---------- */
async function iniciar() {
  actualizarEstadoRed();
  window.addEventListener('online', actualizarEstadoRed);
  window.addEventListener('offline', actualizarEstadoRed);

  try {
    await abrirDB();
    await cargarDatosIniciales();
  } catch (error) {
    console.error(error);
    montar(contenido, el('div', { clase: 'alerta' },
      'No se pudo abrir la base de datos de este dispositivo. Si estás en modo incógnito, abrí la app en una ventana normal.'));
    return;
  }

  // Pedir al navegador que no borre los datos automáticamente
  if (navigator.storage?.persist) {
    navigator.storage.persisted().then((ya) => ya || navigator.storage.persist()).catch(() => {});
  }

  const preferencias = await leerUnico('preferencias');
  aplicarTema(preferencias?.tema);
  minutosInactividad = preferencias?.minutosInactividad ?? 30;
  await refrescarEncabezado();

  ['pointerdown', 'keydown', 'scroll', 'touchstart'].forEach((ev) =>
    window.addEventListener(ev, reiniciarInactividad, { passive: true }));
  reiniciarInactividad();

  window.addEventListener('hashchange', navegar);
  if (!location.hash) history.replaceState(null, '', '#/inicio');
  await navegar();

  registrarServiceWorker();
}

iniciar();
