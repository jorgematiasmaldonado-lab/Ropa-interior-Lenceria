/*
 * Datos que se cargan automáticamente la primera vez que se abre la app.
 * Basados en el catálogo del emprendimiento. Todo es editable después
 * desde Configuración.
 */
import { transaccion } from './db.js';
import { nuevoId, leerMeta } from './repositorios.js';

const VERSION_DATOS_INICIALES = 1;

const CATEGORIAS = {
  Dama: ['Conjuntos', 'Lencería', 'Corpiños', 'Bombachas y colaless', 'Packs', 'Bikinis', 'Pijamas'],
  Caballero: ['Bóxers', 'Slips', 'Pijamas']
};

const LISTAS = {
  medioPago: ['Efectivo', 'Transferencia'],
  canal: ['WhatsApp', 'Instagram', 'Presencial', 'Otro'],
  entrega: ['Retira', 'Envío en zona (gratis)', 'Envío con costo'],
  categoriaGasto: ['Publicidad', 'Envíos', 'Packaging', 'Monotributo', 'Comisiones', 'Otros'],
  talle: ['85', '90', '95', '100', '105', '110', 'S', 'M', 'L', 'XL', 'XXL', 'L/XL', 'Único'],
  color: ['Negro', 'Blanco', 'Nude', 'Rojo', 'Gris', 'Rosa', 'Lila', 'Verde lima', 'Surtido'],
  tela: ['Algodón', 'Morley', 'Lycra', 'Encaje', 'Microtul', 'Seda fría'],
  marca: ['Marcela Koury', 'Capicúa', 'UOMO']
};

export async function cargarDatosIniciales() {
  const yaCargados = await leerMeta('datosIniciales', 0);
  if (yaCargados >= VERSION_DATOS_INICIALES) return false;

  const t = new Date().toISOString();
  const base = () => ({ id: nuevoId(), creadoEn: t, modificadoEn: t, eliminado: false, version: 1 });

  await transaccion(['categorias', 'listas', 'negocio', 'preferencias', 'meta'], 'readwrite', (tx) => {
    let orden = 0;
    for (const [genero, subcategorias] of Object.entries(CATEGORIAS)) {
      const padre = { ...base(), nombre: genero, genero, padreId: '', orden: orden++ };
      tx.objectStore('categorias').add(padre);
      subcategorias.forEach((nombre, i) => {
        tx.objectStore('categorias').add({ ...base(), nombre, genero, padreId: padre.id, orden: i });
      });
    }

    for (const [tipo, valores] of Object.entries(LISTAS)) {
      valores.forEach((valor, i) => {
        tx.objectStore('listas').add({ ...base(), tipo, valor, orden: i, activo: true });
      });
    }

    tx.objectStore('negocio').put({
      id: 'principal',
      nombre: 'Ropa Interior & Lencería',
      duena: 'Abigail Maldonado',
      whatsapp: '',
      instagram: '',
      cuit: '',
      logo: null,
      leyendaComprobante: 'Documento no válido como factura',
      notaComprobante: '',
      creadoEn: t, modificadoEn: t, eliminado: false, version: 1
    });

    tx.objectStore('preferencias').put({
      id: 'principal',
      minutosInactividad: 30,
      diasRecordatorioRespaldo: 7,
      tema: 'oscuro',
      cotizacionDolar: null,
      creadoEn: t, modificadoEn: t, eliminado: false, version: 1
    });

    tx.objectStore('meta').put({ id: 'datosIniciales', valor: VERSION_DATOS_INICIALES, modificadoEn: t });
    tx.objectStore('meta').put({ id: 'proximoNumeroComprobante', valor: 1, modificadoEn: t });
    tx.objectStore('meta').put({ id: 'ultimoRespaldo', valor: null, modificadoEn: t });
    tx.objectStore('meta').put({ id: 'instaladaEl', valor: t, modificadoEn: t });
  });
  return true;
}
