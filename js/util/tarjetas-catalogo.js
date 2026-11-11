/*
 * Imágenes del catálogo para compartir (estados, historias y chats).
 * Formatos: 'historia' (1080×1920) y 'cuadrada' (1080×1080).
 * Siempre con los colores de la marca, sin importar el tema de la app.
 */
import { pesos } from './formato.js';
import { esImagenSegura } from './imagenes.js';
import { ordenVariantes } from '../datos/catalogo.js';

const C = {
  fondo: '#F5EEE6', papel: '#FFFBF7', coral: '#B5574F', coralTexto: '#A04A43',
  texto: '#3A2B2B', suave: '#6F5E5C', lila: '#EADDF4', lilaFuerte: '#7B5E95', linea: '#E6D8CC'
};
const SERIF = 'Georgia, "Times New Roman", serif';
const SANS = '-apple-system, "Segoe UI", Roboto, Arial, sans-serif';

const cacheImagenes = new Map();
function cargarImagen(src) {
  if (!esImagenSegura(src)) return Promise.resolve(null);
  if (cacheImagenes.has(src)) return cacheImagenes.get(src);
  const promesa = new Promise((resolver) => {
    const img = new Image();
    img.onload = () => resolver(img);
    img.onerror = () => resolver(null);
    img.src = src;
  });
  cacheImagenes.set(src, promesa);
  return promesa;
}

/**
 * Describe lo disponible de un producto (solo variantes con stock).
 * Devuelve { lineas: string[], ultima: boolean, hayStock: boolean }
 */
export function disponibilidad(variantes) {
  const conStock = variantes.filter((v) => v.stock > 0).sort(ordenVariantes);
  const total = conStock.reduce((s, v) => s + v.stock, 0);
  if (!conStock.length) return { lineas: [], ultima: false, hayStock: false };

  const talles = [...new Set(conStock.map((v) => v.talle).filter((t) => t && t !== 'Único'))];
  const colores = [...new Set(conStock.map((v) => v.color).filter(Boolean))];
  const lineas = [];

  // ¿Están todas las combinaciones talle × color? Entonces se muestran por separado.
  const grillaCompleta = talles.length && colores.length &&
    talles.every((t) => colores.every((c) => conStock.some((v) => v.talle === t && v.color === c)));

  if (talles.length && colores.length && !grillaCompleta) {
    lineas.push(conStock.map((v) => [v.talle && v.talle !== 'Único' ? `T${v.talle}` : '', v.color].filter(Boolean).join(' ')).join(' · '));
  } else {
    if (talles.length) lineas.push(`${talles.length === 1 ? 'Talle' : 'Talles'} ${talles.join(' · ')}`);
    else if (conStock.some((v) => v.talle === 'Único')) lineas.push('Talle único');
    if (colores.length) lineas.push(colores.length === 1 && colores[0] === 'Surtido' ? 'Colores surtidos' : colores.join(' · '));
  }
  return { lineas, ultima: total === 1, hayStock: true };
}

function renglones(ctx, texto, ancho, maxLineas = 3) {
  const palabras = String(texto || '').split(/\s+/);
  const salida = [];
  let linea = '';
  for (const p of palabras) {
    const prueba = linea ? `${linea} ${p}` : p;
    if (ctx.measureText(prueba).width > ancho && linea) {
      salida.push(linea);
      linea = p;
      if (salida.length === maxLineas) break;
    } else linea = prueba;
  }
  if (salida.length < maxLineas && linea) salida.push(linea);
  if (salida.length === maxLineas && palabras.join(' ').length > salida.join(' ').length) {
    let ult = salida[maxLineas - 1];
    while (ult.length > 1 && ctx.measureText(`${ult}…`).width > ancho) ult = ult.slice(0, -1);
    salida[maxLineas - 1] = `${ult}…`;
  }
  return salida;
}

function rectRedondeado(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Dibuja la foto recortada para llenar el espacio (como "cover"). */
function dibujarFoto(ctx, img, x, y, w, h, radio) {
  ctx.save();
  rectRedondeado(ctx, x, y, w, h, radio);
  ctx.clip();
  if (img) {
    const escala = Math.max(w / img.width, h / img.height);
    const dw = img.width * escala;
    const dh = img.height * escala;
    ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  } else {
    ctx.fillStyle = C.lila;
    ctx.fillRect(x, y, w, h);
  }
  ctx.restore();
}

function dibujarLogo(ctx, logo, cx, cy, lado) {
  if (!logo) return false;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, lado / 2, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(logo, cx - lado / 2, cy - lado / 2, lado, lado);
  ctx.restore();
  return true;
}

function pastilla(ctx, texto, x, y, { tam = 34, fondo = C.coral, color = '#fff' } = {}) {
  ctx.font = `700 ${tam}px ${SANS}`;
  const w = ctx.measureText(texto).width + tam * 1.2;
  const h = tam * 1.8;
  ctx.fillStyle = fondo;
  rectRedondeado(ctx, x, y, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(texto, x + tam * 0.6, y + h / 2 + 1);
  ctx.textBaseline = 'alphabetic';
}

function textoPie(negocio) {
  const partes = [];
  if (negocio?.whatsapp) partes.push(`Pedidos por WhatsApp ${negocio.whatsapp}`);
  if (negocio?.instagram) partes.push(`@${negocio.instagram}`);
  return partes.join('  ·  ') || 'Pedidos por WhatsApp';
}

function subtitulo(producto) {
  const pack = producto.unidad === 'pack' && !/pack/i.test(producto.nombre) ? `Pack x${producto.cantidadPack || 3}` : '';
  return [producto.marca, producto.tela, pack].filter(Boolean).join(' · ');
}

/**
 * Genera la imagen de un producto.
 * @returns {Promise<Blob>} JPEG
 */
export async function generarTarjeta({ producto, variantes, negocio, formato = 'historia' }) {
  const [foto, logo] = await Promise.all([cargarImagen(producto.foto), cargarImagen(negocio?.logo)]);
  const disp = disponibilidad(variantes);
  const lienzo = document.createElement('canvas');
  const historia = formato === 'historia';
  lienzo.width = 1080;
  lienzo.height = historia ? 1920 : 1080;
  const ctx = lienzo.getContext('2d');
  ctx.fillStyle = C.fondo;
  ctx.fillRect(0, 0, lienzo.width, lienzo.height);

  const nombreNegocio = negocio?.nombre || 'Ropa Interior & Lencería';

  if (historia) {
    // Encabezado
    const hayLogo = dibujarLogo(ctx, logo, 540, 130, 130);
    ctx.textAlign = 'center';
    ctx.fillStyle = C.coralTexto;
    ctx.font = `400 58px ${SERIF}`;
    ctx.fillText(nombreNegocio, 540, hayLogo ? 268 : 170);

    // Primero se mide el texto, y la foto ocupa el espacio que sobra.
    ctx.font = `400 62px ${SERIF}`;
    const lineasNombre = renglones(ctx, producto.nombre, 960, 2);
    ctx.font = `500 38px ${SANS}`;
    const lineasDisp = disp.lineas.flatMap((l) => renglones(ctx, l, 940, 2));
    const sub = subtitulo(producto);
    const altoTexto = 90 + lineasNombre.length * 72 + (sub ? 44 : 0) + 150 + lineasDisp.length * 50;
    const fy = hayLogo ? 310 : 230;
    const fh = Math.max(600, (1920 - 130 - 30) - altoTexto - fy);
    dibujarFoto(ctx, foto, 60, fy, 960, fh, 36);
    if (disp.ultima) pastilla(ctx, '¡Última unidad!', 96, fy + 36, { tam: 38 });

    // Datos
    let y = fy + fh + 90;
    ctx.textAlign = 'center';
    ctx.fillStyle = C.texto;
    ctx.font = `400 62px ${SERIF}`;
    for (const l of lineasNombre) { ctx.fillText(l, 540, y); y += 72; }
    if (sub) { ctx.fillStyle = C.suave; ctx.font = `400 34px ${SANS}`; ctx.fillText(sub, 540, y - 16); y += 44; }
    y += 70;
    ctx.fillStyle = C.coral;
    ctx.font = `700 92px ${SANS}`;
    ctx.fillText(pesos(producto.precio).replace(',00', ''), 540, y);
    y += 70;
    ctx.fillStyle = C.texto;
    ctx.font = `500 38px ${SANS}`;
    for (const l of lineasDisp) { ctx.fillText(l, 540, y); y += 50; }

    // Pie
    ctx.fillStyle = C.coral;
    ctx.fillRect(0, 1920 - 130, 1080, 130);
    ctx.fillStyle = '#fff';
    ctx.font = `600 36px ${SANS}`;
    ctx.fillText(textoPie(negocio), 540, 1920 - 52);
  } else {
    // Cuadrada: foto a la izquierda, datos a la derecha
    dibujarFoto(ctx, foto, 40, 40, 520, 1000, 32);
    if (disp.ultima) pastilla(ctx, '¡Última unidad!', 70, 70, { tam: 30 });

    const x = 600;
    const ancho = 440;
    const cx = x + ancho / 2;
    let y = 70;
    const hayLogo = dibujarLogo(ctx, logo, cx, y + 50, 100);
    if (hayLogo) y += 130;
    ctx.textAlign = 'center';
    ctx.fillStyle = C.coralTexto;
    ctx.font = `400 36px ${SERIF}`;
    for (const l of renglones(ctx, nombreNegocio, ancho, 2)) { ctx.fillText(l, cx, y + 30); y += 44; }
    y += 30;
    ctx.strokeStyle = C.linea; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x + 40, y); ctx.lineTo(x + ancho - 40, y); ctx.stroke();
    y += 80;

    ctx.fillStyle = C.texto;
    ctx.font = `400 48px ${SERIF}`;
    for (const l of renglones(ctx, producto.nombre, ancho, 4)) { ctx.fillText(l, cx, y); y += 58; }
    const sub = subtitulo(producto);
    if (sub) {
      ctx.fillStyle = C.suave; ctx.font = `400 28px ${SANS}`;
      for (const l of renglones(ctx, sub, ancho, 2)) { ctx.fillText(l, cx, y); y += 36; }
    }
    y += 60;
    ctx.fillStyle = C.coral;
    ctx.font = `700 76px ${SANS}`;
    ctx.fillText(pesos(producto.precio).replace(',00', ''), cx, y);
    y += 64;
    ctx.fillStyle = C.texto;
    ctx.font = `500 30px ${SANS}`;
    for (const linea of disp.lineas) {
      for (const l of renglones(ctx, linea, ancho, 3)) { ctx.fillText(l, cx, y); y += 40; }
    }

    // Pie
    ctx.fillStyle = C.suave;
    ctx.font = `500 26px ${SANS}`;
    const pie = renglones(ctx, textoPie(negocio), ancho, 2);
    let py = 1040 - (pie.length - 1) * 34;
    for (const l of pie) { ctx.fillText(l, cx, py); py += 34; }
  }

  return new Promise((resolver, rechazar) => lienzo.toBlob(
    (b) => (b ? resolver(b) : rechazar(new Error('No se pudo crear la imagen.'))), 'image/jpeg', 0.88));
}

/** Lista de precios en texto para WhatsApp. */
export function listaDePrecios({ grupos, negocio }) {
  const lineas = [`*${negocio?.nombre || 'Ropa Interior & Lencería'}*`, '✨ Disponible ahora ✨', ''];
  for (const { titulo, items } of grupos) {
    if (!items.length) continue;
    lineas.push(`*${titulo}*`);
    for (const { producto, variantes } of items) {
      const d = disponibilidad(variantes);
      const detalle = d.lineas.join(' – ');
      lineas.push(`• ${producto.nombre}: ${pesos(producto.precio).replace(',00', '')}${detalle ? ` (${detalle})` : ''}${d.ultima ? ' ¡Última!' : ''}`);
    }
    lineas.push('');
  }
  lineas.push('Para pedir, respondé este mensaje 💬');
  if (negocio?.instagram) lineas.push(`Instagram: @${negocio.instagram}`);
  return lineas.join('\n');
}
