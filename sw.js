/*
 * Service Worker – permite que la app funcione sin internet.
 * Guarda una copia de todos los archivos de la app en el dispositivo.
 * IMPORTANTE: al publicar una actualización, cambiar VERSION para que
 * los dispositivos descarguen los archivos nuevos.
 * Los DATOS de la app (ventas, productos, etc.) NO se guardan acá,
 * sino en IndexedDB, y no se borran al actualizar.
 */
const VERSION = 'v1.0.0';
const CACHE = `lenceria-app-${VERSION}`;

const ARCHIVOS = [
  './',
  './index.html',
  './manifest.json',
  './css/app.css',
  './js/app.js',
  './js/version.js',
  './js/datos/db.js',
  './js/datos/repositorios.js',
  './js/datos/datos-iniciales.js',
  './js/datos/operaciones.js',
  './js/datos/catalogo.js',
  './js/util/dom.js',
  './js/util/formato.js',
  './js/util/formulario.js',
  './js/util/validacion.js',
  './js/util/avisos.js',
  './js/util/imagenes.js',
  './js/util/archivos.js',
  './js/util/csv.js',
  './js/util/cotizacion.js',
  './js/util/whatsapp.js',
  './js/util/comprobante.js',
  './js/modulos/inicio.js',
  './js/modulos/selector.js',
  './js/modulos/inventario.js',
  './js/modulos/compras.js',
  './js/modulos/ventas.js',
  './js/modulos/gastos.js',
  './js/modulos/clientes.js',
  './js/modulos/reportes.js',
  './js/modulos/respaldos.js',
  './js/modulos/mas.js',
  './js/modulos/configuracion.js',
  './img/logo-jmm.png',
  './img/iconos/icono-192.png',
  './img/iconos/icono-512.png',
  './img/iconos/icono-maskable-512.png',
  './img/iconos/apple-touch-icon.png',
  './img/iconos/favicon-32.png'
];

// Instalación: descarga y guarda todos los archivos.
self.addEventListener('install', (evento) => {
  evento.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ARCHIVOS)));
  // No se activa sola: espera a que la usuaria toque "Actualizar".
});

// Activación: borra copias de versiones anteriores.
self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(
        claves.filter((c) => c.startsWith('lenceria-app-') && c !== CACHE).map((c) => caches.delete(c))
      ))
      .then(() => self.clients.claim())
  );
});

// Mensaje desde la app para aplicar la actualización.
self.addEventListener('message', (evento) => {
  if (evento.data === 'ACTUALIZAR') self.skipWaiting();
});

// Pedidos: primero la copia guardada; si no está, se busca en internet.
self.addEventListener('fetch', (evento) => {
  const pedido = evento.request;
  if (pedido.method !== 'GET') return;
  const url = new URL(pedido.url);
  if (url.origin !== self.location.origin) return; // ej.: cotización del dólar → siempre en línea

  evento.respondWith(
    caches.match(pedido, { ignoreSearch: true }).then((guardado) => {
      if (guardado) return guardado;
      return fetch(pedido).catch(() => {
        if (pedido.mode === 'navigate') return caches.match('./index.html');
        return Response.error();
      });
    })
  );
});
