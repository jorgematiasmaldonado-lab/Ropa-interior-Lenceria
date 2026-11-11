/*
 * Comprobante de venta (no fiscal) como imagen PNG, para compartir por WhatsApp.
 * Muestra: productos, precios, método de pago y la información del negocio.
 */
import { pesos, fechaHora } from './formato.js';
import { esImagenSegura } from './imagenes.js';

const ANCHO = 1080;
const MARGEN = 72;

function cargarImagen(src) {
  return new Promise((resolver) => {
    if (!esImagenSegura(src)) return resolver(null);
    const img = new Image();
    img.onload = () => resolver(img);
    img.onerror = () => resolver(null);
    img.src = src;
  });
}

/** Parte un texto en renglones que entran en el ancho indicado. */
function renglones(ctx, texto, ancho) {
  const salida = [];
  for (const parrafo of String(texto || '').split('\n')) {
    let linea = '';
    for (const palabra of parrafo.split(' ')) {
      const prueba = linea ? `${linea} ${palabra}` : palabra;
      if (ctx.measureText(prueba).width > ancho && linea) { salida.push(linea); linea = palabra; } else linea = prueba;
    }
    salida.push(linea);
  }
  return salida;
}

/**
 * @returns {Promise<Blob>} imagen PNG
 */
export async function generarComprobante({ venta, items, pagos, negocio, cliente }) {
  const logo = await cargarImagen(negocio?.logo);
  const serif = 'Georgia, "Times New Roman", serif';
  const sans = '-apple-system, "Segoe UI", Roboto, Arial, sans-serif';
  const COLOR = { fondo: '#F5EEE6', papel: '#FFFBF7', coral: '#A04A43', texto: '#3A2B2B', suave: '#6F5E5C', linea: '#E6D8CC' };

  // Se dibuja dos veces: primero para medir el alto, después en limpio.
  const dibujar = (ctx, medir) => {
    let y = MARGEN;
    const texto = (t, x, { tam = 34, peso = '400', color = COLOR.texto, fuente = sans, alinear = 'left' } = {}) => {
      ctx.font = `${peso} ${tam}px ${fuente}`;
      ctx.fillStyle = color;
      ctx.textAlign = alinear;
      if (!medir) ctx.fillText(t, x, y);
    };
    const separador = () => {
      y += 26;
      if (!medir) { ctx.strokeStyle = COLOR.linea; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(MARGEN, y); ctx.lineTo(ANCHO - MARGEN, y); ctx.stroke(); }
      y += 50;
    };

    if (!medir) { ctx.fillStyle = COLOR.papel; ctx.fillRect(0, 0, ANCHO, ctx.canvas.height); }

    if (logo) {
      const lado = 150;
      if (!medir) {
        ctx.save();
        ctx.beginPath(); ctx.arc(ANCHO / 2, y + lado / 2, lado / 2, 0, Math.PI * 2); ctx.clip();
        ctx.drawImage(logo, ANCHO / 2 - lado / 2, y, lado, lado);
        ctx.restore();
      }
      y += lado + 60;
    } else {
      y += 20;
    }
    texto(negocio?.nombre || 'Ropa Interior & Lencería', ANCHO / 2, { tam: 52, fuente: serif, color: COLOR.coral, alinear: 'center' });
    y += 48;
    const contacto = [negocio?.whatsapp ? `WhatsApp ${negocio.whatsapp}` : '', negocio?.instagram ? `@${negocio.instagram}` : ''].filter(Boolean).join('  ·  ');
    if (contacto) { texto(contacto, ANCHO / 2, { tam: 28, color: COLOR.suave, alinear: 'center' }); y += 40; }
    if (negocio?.cuit) { texto(`CUIT ${negocio.cuit}`, ANCHO / 2, { tam: 26, color: COLOR.suave, alinear: 'center' }); y += 36; }
    separador();

    texto(`Comprobante N° ${String(venta.numero).padStart(5, '0')}`, MARGEN, { tam: 36, peso: '700' });
    texto(fechaHora(venta.fecha), ANCHO - MARGEN, { tam: 30, color: COLOR.suave, alinear: 'right' });
    y += 48;
    if (cliente?.nombre || venta.clienteNombre) { texto(`Cliente: ${cliente?.nombre || venta.clienteNombre}`, MARGEN, { tam: 30, color: COLOR.suave }); y += 44; }
    if (venta.estado === 'anulada') { texto('VENTA ANULADA', MARGEN, { tam: 34, peso: '700', color: '#A3362E' }); y += 44; }
    separador();

    for (const it of items) {
      ctx.font = `600 34px ${sans}`;
      const nombre = renglones(ctx, it.descripcion + (it.marca ? ` · ${it.marca}` : ''), ANCHO - MARGEN * 2 - 260);
      nombre.forEach((linea, i) => {
        texto(linea, MARGEN, { tam: 34, peso: '600' });
        if (i === 0) texto(pesos(it.subtotal), ANCHO - MARGEN, { tam: 34, peso: '600', alinear: 'right' });
        y += 44;
      });
      const detalle = [it.talle ? `Talle ${it.talle}` : '', it.color, `${it.cantidad} × ${pesos(it.precioUnit)}`, it.descuento ? `desc. ${pesos(it.descuento)}` : ''].filter(Boolean).join(' · ');
      texto(detalle, MARGEN, { tam: 28, color: COLOR.suave });
      y += 54;
    }
    separador();

    const linea = (et, valor, opciones = {}) => {
      texto(et, MARGEN, { tam: 32, ...opciones });
      texto(valor, ANCHO - MARGEN, { tam: 32, alinear: 'right', ...opciones });
      y += 48;
    };
    linea('Subtotal', pesos(venta.subtotal));
    if (venta.descuento) linea('Descuento', `− ${pesos(venta.descuento)}`);
    if (venta.entrega && venta.entrega !== 'Retira') linea(venta.entrega === 'Envío con costo' ? 'Envío' : venta.entrega, venta.costoEnvio ? pesos(venta.costoEnvio) : 'Gratis');
    y += 8;
    linea('TOTAL', pesos(venta.total), { tam: 44, peso: '700', color: COLOR.coral });
    y += 10;
    for (const p of pagos) linea(`Pagado con ${p.medio.toLowerCase()}`, pesos(p.monto), { color: COLOR.suave, tam: 30 });
    if (venta.saldo > 0) linea('Saldo pendiente', pesos(venta.saldo), { peso: '700', color: '#A3362E' });

    if (venta.nota) {
      y += 10;
      ctx.font = `400 28px ${sans}`;
      for (const l of renglones(ctx, `Nota: ${venta.nota}`, ANCHO - MARGEN * 2)) { texto(l, MARGEN, { tam: 28, color: COLOR.suave }); y += 40; }
    }
    if (negocio?.notaComprobante) {
      separador();
      ctx.font = `400 28px ${sans}`;
      for (const l of renglones(ctx, negocio.notaComprobante, ANCHO - MARGEN * 2)) { texto(l, ANCHO / 2, { tam: 28, alinear: 'center' }); y += 40; }
    }
    y += 30;
    texto('¡Gracias por tu compra!', ANCHO / 2, { tam: 36, fuente: serif, color: COLOR.coral, alinear: 'center' });
    y += 50;
    texto(negocio?.leyendaComprobante || 'Documento no válido como factura', ANCHO / 2, { tam: 24, color: COLOR.suave, alinear: 'center' });
    y += MARGEN;
    return y;
  };

  const medidor = document.createElement('canvas').getContext('2d');
  medidor.canvas.width = ANCHO;
  const alto = Math.ceil(dibujar(medidor, true));

  const lienzo = document.createElement('canvas');
  lienzo.width = ANCHO;
  lienzo.height = alto;
  dibujar(lienzo.getContext('2d'), false);
  return new Promise((resolver, rechazar) => lienzo.toBlob((b) => (b ? resolver(b) : rechazar(new Error('No se pudo crear la imagen.'))), 'image/png'));
}

/** Texto del comprobante para mandar por WhatsApp. */
export function textoComprobante({ venta, items, pagos, negocio }) {
  const lineas = [
    `*${negocio?.nombre || 'Ropa Interior & Lencería'}*`,
    `Comprobante N° ${String(venta.numero).padStart(5, '0')} – ${fechaHora(venta.fecha)}`,
    '',
    ...items.map((it) => `• ${it.descripcion}${it.talle ? ` T${it.talle}` : ''}${it.color ? ` ${it.color}` : ''} x${it.cantidad}: ${pesos(it.subtotal)}`),
    ''
  ];
  if (venta.descuento) lineas.push(`Descuento: −${pesos(venta.descuento)}`);
  if (venta.entrega && venta.entrega !== 'Retira') lineas.push(`Envío: ${venta.costoEnvio ? pesos(venta.costoEnvio) : 'gratis'}`);
  lineas.push(`*Total: ${pesos(venta.total)}*`);
  for (const p of pagos) lineas.push(`Pagado con ${p.medio.toLowerCase()}: ${pesos(p.monto)}`);
  if (venta.saldo > 0) lineas.push(`Saldo pendiente: ${pesos(venta.saldo)}`);
  if (negocio?.notaComprobante) lineas.push('', negocio.notaComprobante);
  lineas.push('', '¡Gracias por tu compra!', `_${negocio?.leyendaComprobante || 'Documento no válido como factura'}_`);
  return lineas.join('\n');
}
