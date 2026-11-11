/*
 * Respaldos: guardar y recuperar TODOS los datos de la app.
 * Son la única copia de seguridad, porque los datos viven solo en este dispositivo.
 *
 * Formato del archivo (.json):
 *   { app, formato, creado, versionApp, tablas: {...}, huella }
 * "huella" es un código SHA-256 de las tablas: si el archivo se daña o se modifica,
 * la huella no coincide y la app avisa antes de restaurar.
 */
import { el, montar } from '../util/dom.js';
import { fechaHora } from '../util/formato.js';
import { volver } from '../util/formulario.js';
import { avisar, confirmar } from '../util/avisos.js';
import { ESQUEMA, transaccion, leerTodos } from '../datos/db.js';
import { leerMeta, guardarMeta } from '../datos/repositorios.js';
import { esImagenSegura } from '../util/imagenes.js';
import { descargar, compartirODescargar, marcaTiempo, leerTexto } from '../util/archivos.js';
import { VERSION_APP } from '../version.js';

const APP = 'lenceria-app';
const FORMATO = 1;
const TAMANO_MAXIMO = 150 * 1024 * 1024; // 150 MB

async function huella(texto) {
  const datos = new TextEncoder().encode(texto);
  const resumen = await crypto.subtle.digest('SHA-256', datos);
  return [...new Uint8Array(resumen)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Arma el respaldo completo como archivo. */
export async function crearRespaldo() {
  const tablas = {};
  for (const tabla of Object.keys(ESQUEMA)) tablas[tabla] = await leerTodos(tabla);
  const textoTablas = JSON.stringify(tablas);
  const contenido = {
    app: APP,
    formato: FORMATO,
    creado: new Date().toISOString(),
    versionApp: VERSION_APP,
    tablas,
    huella: await huella(textoTablas)
  };
  const blob = new Blob([JSON.stringify(contenido)], { type: 'application/json' });
  return { blob, nombre: `respaldo_lenceria_${marcaTiempo()}.json`, resumen: resumir(tablas) };
}

function resumir(tablas) {
  const activos = (t) => (tablas[t] || []).filter((r) => !r.eliminado);
  return {
    productos: activos('productos').length,
    ventas: activos('ventas').length,
    clientes: activos('clientes').length,
    gastos: activos('gastos').length,
    compras: activos('compras').length
  };
}

/** Revisa que el archivo sea un respaldo válido de esta app y lo limpia. */
async function validarRespaldo(texto) {
  let datos;
  try { datos = JSON.parse(texto); } catch { throw new Error('El archivo no es un respaldo válido (no se pudo leer).'); }
  if (!datos || typeof datos !== 'object' || datos.app !== APP) throw new Error('El archivo no es un respaldo de esta app.');
  if (datos.formato !== FORMATO) throw new Error('El respaldo es de una versión que esta app no reconoce.');
  if (!datos.tablas || typeof datos.tablas !== 'object') throw new Error('El respaldo está incompleto.');

  const calculada = await huella(JSON.stringify(datos.tablas));
  const integro = calculada === datos.huella;

  const limpias = {};
  for (const tabla of Object.keys(ESQUEMA)) {
    const filas = datos.tablas[tabla] ?? [];
    if (!Array.isArray(filas)) throw new Error(`El respaldo tiene un error en "${tabla}".`);
    limpias[tabla] = filas.map((fila) => {
      if (!fila || typeof fila !== 'object' || Array.isArray(fila) || typeof fila.id !== 'string' || fila.id.length > 100) {
        throw new Error(`El respaldo tiene un registro dañado en "${tabla}".`);
      }
      const copia = { ...fila };
      // Las imágenes solo se aceptan si tienen el formato que genera la app
      for (const campo of ['foto', 'logo']) {
        if (campo in copia && copia[campo] !== null && !esImagenSegura(copia[campo])) copia[campo] = null;
      }
      return copia;
    });
  }
  const desconocidas = Object.keys(datos.tablas).filter((t) => !(t in ESQUEMA));
  return { tablas: limpias, integro, creado: datos.creado, versionApp: datos.versionApp, desconocidas, resumen: resumir(limpias) };
}

async function restaurar(tablas) {
  const nombres = Object.keys(ESQUEMA);
  await transaccion(nombres, 'readwrite', (tx) => {
    for (const t of nombres) {
      const almacen = tx.objectStore(t);
      almacen.clear();
      for (const fila of tablas[t]) almacen.put(fila);
    }
  });
}

export async function mostrar(contenedor) {
  const ultimo = await leerMeta('ultimoRespaldo');
  const zonaRestaurar = el('div');

  async function guardarRespaldo(compartir) {
    try {
      const { blob, nombre } = await crearRespaldo();
      const resultado = compartir
        ? await compartirODescargar(nombre, blob, { titulo: 'Respaldo de la app' })
        : (descargar(nombre, blob), 'descargado');
      if (resultado === 'cancelado') return;
      await guardarMeta('ultimoRespaldo', new Date().toISOString());
      avisar(resultado === 'compartido' ? 'Respaldo compartido' : 'Respaldo descargado');
      mostrar(contenedor);
    } catch (error) {
      console.error(error);
      avisar('No se pudo crear el respaldo.', 'error');
    }
  }

  const entrada = el('input', {
    type: 'file', accept: '.json,application/json', clase: 'archivo-oculto', id: 'archivo-respaldo',
    onChange: async (e) => {
      const archivo = e.target.files?.[0];
      e.target.value = '';
      if (!archivo) return;
      if (archivo.size > TAMANO_MAXIMO) { avisar('El archivo es demasiado grande.', 'error'); return; }
      try {
        const r = await validarRespaldo(await leerTexto(archivo));
        vistaPrevia(r);
      } catch (error) {
        montar(zonaRestaurar, el('div', { clase: 'alerta' }, error.message));
      }
    }
  });

  function vistaPrevia(r) {
    montar(zonaRestaurar, el('div', { clase: 'tarjeta' },
      el('h3', { clase: 'campo__etiqueta' }, 'Contenido del respaldo'),
      el('p', {}, `Creado el ${r.creado ? fechaHora(r.creado) : '¿?'}${r.versionApp ? ` (versión ${r.versionApp})` : ''}`),
      el('ul', { clase: 'lista-simple' },
        el('li', {}, el('span', {}, 'Productos'), el('strong', {}, String(r.resumen.productos))),
        el('li', {}, el('span', {}, 'Ventas'), el('strong', {}, String(r.resumen.ventas))),
        el('li', {}, el('span', {}, 'Clientes'), el('strong', {}, String(r.resumen.clientes))),
        el('li', {}, el('span', {}, 'Gastos'), el('strong', {}, String(r.resumen.gastos))),
        el('li', {}, el('span', {}, 'Compras'), el('strong', {}, String(r.resumen.compras)))),
      r.integro ? el('div', { clase: 'alerta alerta--info' }, 'Archivo verificado: está completo y sin modificaciones.')
        : el('div', { clase: 'alerta' }, 'Atención: el archivo fue modificado o está dañado. Restaurarlo puede traer datos incorrectos.'),
      el('div', { clase: 'alerta' }, 'Restaurar REEMPLAZA todos los datos actuales de este dispositivo. Antes se descarga automáticamente un respaldo de lo que hay ahora.'),
      el('div', { clase: 'botonera' },
        el('button', { type: 'button', clase: 'boton boton--peligro', onClick: async () => {
          if (!await confirmar({ titulo: '¿Restaurar este respaldo?', mensaje: 'Se reemplazan todos los datos actuales.', aceptar: 'Continuar', peligro: true })) return;
          if (!await confirmar({ titulo: 'Confirmación final', mensaje: 'Esta acción no se puede deshacer (salvo con el respaldo de seguridad que se descarga ahora).', aceptar: 'Sí, restaurar', peligro: true })) return;
          try {
            const actual = await crearRespaldo();
            descargar(actual.nombre.replace('respaldo_', 'respaldo_antes_de_restaurar_'), actual.blob);
            await restaurar(r.tablas);
            avisar('Datos restaurados. Reiniciando…');
            setTimeout(() => { location.hash = '#/inicio'; location.reload(); }, 1200);
          } catch (error) {
            console.error(error);
            avisar('No se pudo restaurar. Tus datos actuales no se modificaron.', 'error');
          }
        } }, 'Restaurar'),
        el('button', { type: 'button', clase: 'boton boton--secundario', onClick: () => montar(zonaRestaurar) }, 'Cancelar'))
    ));
  }

  const diasDesde = ultimo ? Math.floor((Date.now() - new Date(ultimo)) / 86400000) : null;

  montar(contenedor,
    volver('#/mas'),
    el('h1', { clase: 'titulo-pantalla' }, 'Respaldos'),
    el('div', { clase: `alerta ${ultimo && diasDesde < 7 ? 'alerta--info' : ''}` },
      ultimo ? `Último respaldo: ${fechaHora(ultimo)} (hace ${diasDesde} ${diasDesde === 1 ? 'día' : 'días'}).` : 'Todavía no hiciste ningún respaldo.'),
    el('p', {}, 'Tus datos están guardados solo en este dispositivo. Si se pierde, se rompe o se borra el navegador, el respaldo es la única forma de recuperarlos.'),
    el('div', { clase: 'tarjeta' },
      el('h2', { clase: 'campo__etiqueta' }, 'Guardar un respaldo'),
      el('p', { clase: 'campo__ayuda' }, 'Recomendado: compartilo a tu propio WhatsApp, a Google Drive o por mail, así queda fuera del teléfono.'),
      el('div', { clase: 'botonera' },
        el('button', { type: 'button', clase: 'boton', onClick: () => guardarRespaldo(true) }, 'Compartir respaldo'),
        el('button', { type: 'button', clase: 'boton boton--secundario', onClick: () => guardarRespaldo(false) }, 'Descargar'))),
    el('div', { clase: 'tarjeta' },
      el('h2', { clase: 'campo__etiqueta' }, 'Restaurar un respaldo'),
      el('p', { clase: 'campo__ayuda' }, 'Elegí un archivo "respaldo_lenceria_….json". Antes de reemplazar nada, vas a ver qué contiene.'),
      el('label', { for: 'archivo-respaldo', clase: 'boton boton--secundario', role: 'button', tabindex: '0',
        onKeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); entrada.click(); } } }, 'Elegir archivo'),
      entrada,
      zonaRestaurar),
    el('div', { clase: 'tarjeta' },
      el('h2', { clase: 'campo__etiqueta' }, 'Pasar los datos a otro dispositivo'),
      el('ol', { clase: 'pasos' },
        el('li', {}, 'En el dispositivo que tiene los datos: ', el('strong', {}, 'Compartir respaldo'), ' y mandalo a tu WhatsApp, Drive o mail.'),
        el('li', {}, 'En el otro dispositivo: abrí la app, entrá a Más › Respaldos.'),
        el('li', {}, 'Descargá el archivo y tocá ', el('strong', {}, 'Elegir archivo'), ' → ', el('strong', {}, 'Restaurar'), '.')),
      el('p', { clase: 'campo__ayuda' }, 'Importante: los dos dispositivos no se sincronizan solos. Usá uno como principal para cargar ventas, y pasá el respaldo cuando cambies de equipo.')),
    el('p', { clase: 'campo__ayuda' }, 'Para planillas de Excel con ventas, gastos o inventario, usá Más › Reportes › Exportar.')
  );
}
