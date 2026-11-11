# Ropa Interior & Lencería – App de gestión

App web instalable (PWA) para registrar ventas, mercadería, gastos y clientes del emprendimiento de Abigail Maldonado.
Funciona sin internet. Los datos se guardan **solo en el dispositivo**.

Desarrollo: **JMM Gestiones & Tecnología** – © 2026 Maldonado Jorge Matias – Todos los derechos reservados.

Versión: **1.2.0**

---

## Qué incluye

| Módulo | Dónde | Qué hace |
|---|---|---|
| Inicio | Inicio | Balance del día/semana/mes (ventas, gastos, ganancia), accesos rápidos y avisos (respaldo, sin stock, última unidad, deudas) |
| Catálogo inicial | Inventario (cuando está vacío) | Botón "Cargar catálogo inicial": 18 productos del catálogo con fotos, precios, talles y colores (1 unidad c/u) |
| Compartir catálogo | Más › Compartir catálogo (o Inventario) | Imágenes por producto en formato historia (1080×1920) o cuadrado (1080×1080) con logo, foto, precio, talles/colores disponibles y "¡Última unidad!"; o lista de precios en texto. Se comparten a contactos, listas de difusión, estados de WhatsApp o Instagram |
| Productos | Inventario | Fichas con foto, categoría, marca, tela, unidad o pack, costo, precio, mayorista y margen. Talles y colores con stock propio y precio especial opcional. Ajustes de stock con motivo e historial de movimientos |
| Compras | Inventario › Compras | Ingreso de mercadería en pesos o dólares (cotización manual o sugerida oficial/blue), gastos adicionales prorrateados, costo promedio automático, anulación |
| Proveedores | Inventario › Proveedores | Alta, edición y baja |
| Ventas | Ventas | Venta rápida con buscador, precio editable o mayorista, cliente, canal, entrega (retira / envío en zona gratis / envío con costo), descuento, efectivo + transferencia, fiado |
| Comprobante | Detalle de la venta | Imagen PNG para compartir por WhatsApp, texto por WhatsApp o descarga. Leyenda "Documento no válido como factura" |
| Cambios y anulaciones | Detalle de la venta | Cambio de talle/color (mueve el stock) y anulación con motivo (devuelve stock y cancela la deuda) |
| Gastos | Gastos | En pesos o dólares, por categoría, con foto del comprobante |
| Clientes | Más › Clientes | Fichas, talles habituales, cuenta corriente, pagos parciales y recordatorio de deuda por WhatsApp |
| Reportes | Más › Reportes | Ganancia bruta y neta, ticket promedio, cobros por medio, ventas por canal, Dama/Caballero, categoría, marca, talle, más vendidos, sin rotación, valor del inventario, deudas. Exporta a Excel (CSV) e imprime/guarda PDF |
| Respaldos | Más › Respaldos | Respaldo completo compartible (WhatsApp, Drive, mail), restauración con vista previa y verificación, traspaso entre dispositivos |
| Configuración | Más › Configuración | Datos del negocio y logo, categorías, listas (talles, colores, telas, marcas, gastos, canales), tema, inactividad y recordatorio de respaldo |

---

## Publicar en GitHub Pages (paso a paso)

1. Entrar a <https://github.com> e iniciar sesión (o crear una cuenta gratuita).
2. Arriba a la derecha: **+** → **New repository**.
   - Nombre: por ejemplo `lenceria-app`.
   - Visibilidad: **Public** (GitHub Pages gratis lo requiere; el código no contiene datos ni claves).
   - Tocar **Create repository**.
3. En el repositorio nuevo: **Add file** → **Upload files**.
4. Arrastrar **todo el contenido** de la carpeta `lenceria-app` (no la carpeta en sí: tienen que quedar `index.html`, `sw.js`, `css/`, `js/`, `img/`, etc. en la raíz).
   - Importante: incluir el archivo oculto `.nojekyll`. Si el explorador no lo muestra, crearlo después con **Add file → Create new file**, nombre `.nojekyll`, vacío.
5. Abajo: **Commit changes**.
6. Ir a **Settings** → **Pages**.
   - *Source*: **Deploy from a branch**.
   - *Branch*: **main** y carpeta **/ (root)** → **Save**.
7. Esperar 1 o 2 minutos. La dirección queda así: `https://TU-USUARIO.github.io/lenceria-app/`
8. Activar **Enforce HTTPS** en la misma pantalla (si aparece la opción).

### Instalar en el iPhone de Abigail
1. Abrir la dirección en **Safari**.
2. Botón **Compartir** → **Agregar a pantalla de inicio** → **Agregar**.
3. Abrirla siempre desde el ícono.

### Instalar en la notebook
Abrir la dirección en Chrome o Edge → ícono **Instalar** en la barra de direcciones (o Más › Instalar la app).

### Publicar una actualización
1. Cambiar la versión en **dos** lugares (deben coincidir):
   - `sw.js` → `const VERSION = 'v1.2.0';`
   - `js/version.js` → `VERSION_APP = '1.2.0';`
2. Si se agregó un archivo nuevo, sumarlo a la lista `ARCHIVOS` de `sw.js`.
3. Subir los archivos cambiados a GitHub (Upload files → Commit).
4. En los dispositivos aparece **"Hay una nueva versión – Actualizar"**. Los datos no se pierden.

---

## Probar en la notebook antes de publicar
La app no funciona abriendo `index.html` con doble clic: necesita un servidor.
- **VS Code**: extensión **Live Server** → clic derecho en `index.html` → *Open with Live Server*.
- **Python**: `python -m http.server 8000` y abrir `http://localhost:8000`.

---

## Seguridad (revisión de la Etapa 11)

| Punto | Estado |
|---|---|
| Datos solo en el dispositivo (IndexedDB). Ningún dato del negocio se envía a servidores | ✅ |
| Única conexión externa: cotización del dólar en dolarapi.com (opcional, sin datos del negocio) y enlaces de WhatsApp | ✅ |
| Política de seguridad de contenido (CSP): solo se ejecutan scripts y estilos propios | ✅ |
| Sin librerías ni scripts de terceros (nada por CDN) | ✅ |
| Prevención de XSS: los textos se insertan siempre como texto (`textContent`), nunca como HTML | ✅ |
| Imágenes: solo PNG/JPG/WEBP (no SVG), tamaño máximo y re-dibujado (se descartan datos ocultos) | ✅ |
| Respaldos: se valida estructura, tipo de app, tablas y registros; huella SHA-256 detecta archivos dañados o modificados | ✅ |
| Restaurar: vista previa, doble confirmación y respaldo automático de lo actual antes de reemplazar | ✅ |
| Exportación a Excel protegida contra "fórmulas inyectadas" | ✅ |
| Validación de datos (montos, cantidades, CUIT con dígito verificador, WhatsApp, Instagram, largos máximos) | ✅ |
| Operaciones de stock y dinero en transacciones (todo o nada) | ✅ |
| Borrado lógico: nada se elimina definitivamente; registro de auditoría de cada cambio | ✅ |
| Ventas y compras anuladas quedan registradas con motivo | ✅ |
| Enlaces externos con `noopener noreferrer` y sin envío de referencia | ✅ |
| HTTPS obligatorio (GitHub Pages) | ✅ al publicar |
| Contraseña / PIN | ⏸ Pospuesto a pedido (acceso libre por ser uso interno) |
| Cifrado de datos | ⏸ Pospuesto a pedido |
| Cabeceras HTTP propias (HSTS, X-Frame-Options) | ⚠️ GitHub Pages no permite configurarlas; HSTS ya viene incluido en github.io |

**Riesgo principal:** como no hay contraseña, cualquiera que tenga el teléfono desbloqueado puede ver los datos. Y como los datos están solo en el dispositivo, **el respaldo semanal es fundamental** (en iPhone, Safari puede borrar datos de apps web que no se usan por varias semanas).

---

## Estructura
```
index.html  manifest.json  sw.js  .nojekyll  LEEME.md
css/app.css
js/app.js · js/version.js
js/datos/   db.js · repositorios.js · operaciones.js · catalogo.js · catalogo-inicial.js · datos-iniciales.js
js/modulos/ inicio.js · ventas.js · inventario.js · compras.js · selector.js · gastos.js
            clientes.js · reportes.js · respaldos.js · compartir-catalogo.js · configuracion.js · mas.js
js/util/    dom.js · formato.js · formulario.js · validacion.js · avisos.js · imagenes.js
            archivos.js · csv.js · cotizacion.js · whatsapp.js · comprobante.js · tarjetas-catalogo.js
img/        logo-jmm.png · iconos/ · catalogo/ (18 fotos)
```

## Pendientes conversados para más adelante
- PIN o contraseña de acceso.
- Sincronización en la nube entre dispositivos.
- Factura electrónica ARCA.
- Lector de código de barras con la cámara.
- Logo del emprendimiento como ícono de la app (hoy es un ícono provisorio "RI&L").
