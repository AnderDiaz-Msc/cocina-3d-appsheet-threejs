# Documentación técnica: dashboard 3D de cocina (homenaje estilo Frisby)

Contenido independiente, no patrocinado ni afiliado a Frisby S.A.. Diseño 3D original; productos con nombres de ejemplo.
Código probado el 2026-11-13: lógica del servidor con datos simulados en Node y escena en el navegador (modo demo).

## a. Arquitectura
```
AppSheet (equipo: mesero, cocina, caja, repartidor)
   │ escribe
   ▼
Google Sheet  ← única fuente de verdad (Mesas, Cuentas, DetalleCuenta, Domicilios…)
   │ lee (solo lectura, caché 8 s)
   ▼
Apps Script  ── doGet() publica index.html
             └─ getEstado() → JSON { mesas, comandas, domicilios, kpis, recibos }
   ▲ google.script.run cada 10 s
   │
Navegador: index.html
   ├─ Three.js r147: escena 3D (salón, freidoras, asador, caja, calle, muñecos, motos)
   └─ SVG: tarjetas KPI, anillo de mesas activas, barras de lo más vendido
```
Clic en una mesa o comanda → panel → enlace profundo a la fila en AppSheet.

## b. Modelo de datos que lee el dashboard
El brief habla de Mesas, Comandas, DetalleComanda, Estaciones, Domicilios, Repartidores y Ventas. En la app real se llaman así:

| Concepto | Tabla real | Columnas clave que usa getEstado() |
|---|---|---|
| Mesas | `Mesas` | MesaID, Numero, Zona, Capacidad |
| Comandas | `Cuentas` | CuentaID, Numero, Mesas (EnumList: mesas unidas), Estado (Abierta / Por cobrar / Pagada / Anulada), Apertura, Mesero, Total_Final, PDF_Recibo |
| DetalleComanda | `DetalleCuenta` | DetalleID, Cuenta, Producto, Cantidad, Precio_Unitario, Estado_Prep (Pendiente / En preparación / Listo / Entregado / Anulado), Enviado, Listo |
| Estaciones | `Carta.Puesto` | Cocina = freidoras · Parrilla = asador; Tiempo_Min = tiempo meta |
| Domicilios | `Domicilios` | DomicilioID, Cliente, Estado (Recibido / En cocina / Listo para recoger / En camino / Entregado / Cancelado), Domiciliario, Hora_Pedido, Hora_Entrega, Activo |
| Repartidores | `User` | UserEmail, UserName, UseRole = "Repartidor" |
| Ventas | `Cuentas` pagadas del día | Total_Final; ticket = ventas / cuentas |

JSON que recibe el navegador (resumen):
```json
{
  "negocio": "…", "generado": "20:41:07",
  "mesas":     [{ "id": "M04", "numero": "4", "estado": "Con pedido", "cuenta": "C01422", "unida": false, "total": 100000, "minutos": 12, "mesero": "Laura" }],
  "comandas":  [{ "id": "D012345", "cuenta": "C01422", "mesa": "4", "plato": "1 x Combo familiar 4 presas", "estacion": "Cocina", "estado": "En preparación", "minutos": 9, "meta": 18 }],
  "domicilios":[{ "id": "DO0006", "cliente": "Juan Gómez (ejemplo)", "estado": "En camino", "repartidor": "Juan (repartidor)", "minutos": 21 }],
  "repartidores": [{ "email": "juan.moto@ejemplo.co", "nombre": "Juan (repartidor)" }],
  "recibos":   [{ "cuenta": "C01421", "numero": "1421", "total": 63000, "pdf": true }],
  "kpis": { "ventas": 2450000, "cuentas": 38, "ticket": 64474, "mesasActivas": 6, "mesasTotal": 10, "tiempoCocina": 14, "enRuta": 1, "top": [{ "nombre": "Combo familiar 4 presas", "cantidad": 21 }] }
}
```
Regla del estado de la mesa (se calcula, no se guarda): sin cuenta abierta = **Libre**; cuenta "Por cobrar" = **Por cobrar**; cuenta con platos Pendiente/En preparación = **Con pedido**; si no = **Ocupada**.

## c. Escena 3D
- Distribución en metros virtuales: salón x −16…4, cocina x 6…16, calle z 13…17, puerta en (4, 12).
- Piezas low-poly: `caja()` y `cilindro()` con `MeshStandardMaterial` + `flatShading`. Piso de madera (salón), baldosa (cocina), muro rojo con franja amarilla (colores genéricos).
- Freidoras: 3 cubas con "aceite" emisivo que pulsa. Asador: vitrina, brasas emisivas y 3 varillas de pollos que giran.
- Pase (mostrador de platos listos), caja con pantalla que se ilumina, marco de puerta y rótulos fijos (FREIDORAS, ASADOR, PASE, CAJA, DOMICILIOS).
- Luces: `HemisphereLight` cálida + `DirectionalLight` con sombras (mapa de 2048) + luz puntual naranja en la cocina.
- Cámaras: Aérea, Salón, Cocina y Domicilios; transición con `camera.position.lerp()` y `controls.target.lerp()`. Si el usuario arrastra, la transición se cancela. En celular arranca en Salón.

## d. Lógica estado → visual
| Dato | Visual |
|---|---|
| Mesa Libre / Ocupada / Con pedido / Por cobrar | Tablero verde / rojo / azul / ámbar, con cambio suave (`color.lerp`). Por cobrar: el tablero "late". |
| Rótulo de la mesa | Número, estado, total y minutos (canvas → textura de Sprite). "(unida)" si la cuenta tiene varias mesas. |
| Comanda Pendiente / En preparación | Tarjeta sobre su estación (freidoras o asador). Borde azul → ámbar (≥ 70 % del tiempo meta) → rojo (≥ 100 %). |
| Comanda Listo | La tarjeta viaja al pase; un mesero va al pase y luego a la mesa de esa cuenta. |
| Comanda Entregado | La tarjeta sale de la escena. |
| Domicilio En camino | La moto del repartidor sale por la calle (x → 26). Otros estados: vuelve a su puesto junto a la puerta. |
| Recibo con PDF_Recibo nuevo | Aviso "Recibo PDF generado" + pantalla de la caja brilla. |

## e. Muñecos y motos
- Muñeco = 2 piernas (cajas) + cuerpo (caja) + cabeza (esfera) + gorro opcional (cilindro). Meseros con camisa roja, cocineros de blanco y el asador con camisa amarilla.
- `asignarTareas()` cada 4 s decide la ruta según los datos. `moverMuneco()` avanza con lerp hacia el destino, gira con `atan2` y balancea las piernas con `sin(t)`.
- Moto = chasis + maleta térmica + 2 toros (ruedas) + piloto reducido. `moverMotos()` interpola x hacia el objetivo.
- Todo corre en `requestAnimationFrame` con `dt` acotado a 50 ms para que no salte al volver a la pestaña.

## f. Indicadores en SVG
`svgKpis()` arma un SVG de 560x92: anillo (mesas activas / total con `stroke-dasharray`) + 4 tarjetas (ventas del día, ticket promedio, tiempo de cocina, domicilios en ruta). `svgTop()` dibuja las barras de lo más vendido. Se regeneran en cada refresco porque son baratos.

## g. Refresco
- El servidor cachea el JSON 8 s (`CacheService`): N pantallas abiertas = 1 lectura.
- El navegador pide cada `REFRESCO` s (10 por defecto). Cada mesa y comanda guarda una **firma** (estado|total|minutos); si no cambió, no se repinta su textura. Las comandas que ya no vienen se eliminan.

## h. Acciones (clic)
`Raycaster` sobre la lista `clicables` (tableros de mesa y sprites de comandas). El panel muestra el detalle y el enlace:
```
https://www.appsheet.com/start/<APP_ID>#appName=<APP_NAME>&table=Cuentas&row=<CuentaID>&view=Cuentas_Detail
```
Es el equivalente externo de `LINKTOROW([CuentaID], "Cuentas_Detail")`. Si la persona tiene acceso a la app, se abre en esa cuenta.

## i. Conexión con el bot de PDF
1. En la app, la caja registra el pago; la acción "Cerrar cuenta si quedó paga" deja la cuenta en **Pagada**.
2. "Generar recibo PDF" (solo con cuenta Pagada) cambia `GenerarPDF`; el bot **PDF recibo de caja** llena la plantilla de Google Docs, guarda el archivo y escribe la ruta en `PDF_Recibo`.
3. En el siguiente refresco, `getEstado()` devuelve `recibos[].pdf = true`; el tablero muestra "PDF ✓", el aviso y la caja iluminada.

## Cómo publicarlo
1. En script.google.com → Nuevo proyecto → crea `Codigo.gs` y un archivo HTML llamado `index` (queda como `index.html`). Pega el código de abajo.
2. Revisa `CONFIG` (id de la hoja, APP_ID y APP_NAME).
3. Implementar → Nueva implementación → Aplicación web → Ejecutar como: yo · Acceso: solo usuarios de tu dominio o "Cualquier persona con cuenta de Google" según el caso. Autoriza el acceso de solo lectura a la hoja.
4. Copia la URL `/exec` y ponla como botón en la tabla HOME de la app (columna Link_Externo).
5. Abierto como archivo local (fuera de Apps Script), entra solo en **modo demo** con datos simulados: sirve para diseñar sin tocar la hoja.

## j. Código completo comentado por bloques

### Codigo.gs
```javascript
/**
 * ============================================================
 *  DASHBOARD 3D DE COCINA · Codigo.gs (Apps Script)
 *  Lee la hoja de la app AppSheet (solo lectura) y entrega
 *  un JSON con el estado del restaurante para la escena 3D.
 *
 *  Flujo: AppSheet -> Google Sheet -> getEstado() -> index.html
 * ============================================================
 */

// ---------- BLOQUE 1 · Configuración ----------
const CONFIG = {
  SPREADSHEET_ID: 'PEGA_AQUI_EL_ID_DE_TU_HOJA', // hoja de la app
  APP_ID: 'PEGA_AQUI_EL_ID_DE_TU_APP',                  // para los enlaces profundos
  APP_NAME: 'NOMBRE_DE_TU_APP',
  CACHE_SEGUNDOS: 8,          // varios usuarios abiertos = una sola lectura cada 8 s
  REFRESCO_SEGUNDOS: 10       // cada cuánto pregunta el navegador
};

// ---------- BLOQUE 2 · Punto de entrada web ----------
function doGet() {
  const t = HtmlService.createTemplateFromFile('index');
  t.refresco = CONFIG.REFRESCO_SEGUNDOS;
  t.appId = CONFIG.APP_ID;
  t.appName = CONFIG.APP_NAME;
  return t.evaluate()
    .setTitle('Cocina 3D en vivo')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ---------- BLOQUE 3 · API que llama el navegador (google.script.run) ----------
function getEstado() {
  const cache = CacheService.getScriptCache();
  const guardado = cache.get('estado3d');
  if (guardado) return JSON.parse(guardado);

  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const T = {};
  ['Config', 'Mesas', 'Carta', 'Cuentas', 'DetalleCuenta', 'Domicilios', 'Clientes', 'User']
    .forEach(function (n) { T[n] = leer_(ss, n); });

  const estado = construirEstado_(T, new Date());
  try { cache.put('estado3d', JSON.stringify(estado), CONFIG.CACHE_SEGUNDOS); } catch (e) { /* demasiado grande */ }
  return estado;
}

// ---------- BLOQUE 4 · Lectura genérica: cada fila como objeto {encabezado: valor} ----------
function leer_(ss, nombre) {
  const hoja = ss.getSheetByName(nombre);
  if (!hoja || hoja.getLastRow() < 2) return [];
  const valores = hoja.getDataRange().getValues();
  const enc = valores.shift().map(function (h) { return String(h).trim(); });
  return valores.filter(function (r) { return r[0] !== '' && r[0] !== null; }).map(function (r) {
    const o = {};
    enc.forEach(function (h, i) { if (h) o[h] = r[i]; });
    return o;
  });
}
function txt_(v) { return v === null || v === undefined ? '' : String(v).trim(); }
function num_(v) {
  if (typeof v === 'number') return v;
  const n = parseFloat(txt_(v).replace(/[$\s.]/g, '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
}
function lista_(v) { return txt_(v).split(',').map(function (s) { return s.trim(); }).filter(String); }
/** Las fechas de la hoja llegan como Date; si llegan como texto d/M/yyyy H:mm se convierten. */
function fecha_(v) {
  if (v instanceof Date) return v;
  const m = txt_(v).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  return m ? new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0)) : null;
}
function mismoDia_(a, b) { return a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
function minutos_(desde, hasta) { return desde ? Math.max(0, Math.round((hasta - desde) / 60000)) : 0; }

// ---------- BLOQUE 5 · Modelo que consume la escena ----------
function construirEstado_(T, ahora) {
  // 5.1 Catálogo de platos: nombre, estación (Cocina = freidoras, Parrilla = asador) y tiempo meta
  const platos = {};
  T.Carta.forEach(function (p) {
    platos[txt_(p.ProductoID)] = { nombre: txt_(p.Nombre), estacion: txt_(p.Puesto) || 'Cocina', meta: num_(p.Tiempo_Min) || 10 };
  });
  const nombres = {};
  T.User.forEach(function (u) { nombres[txt_(u.UserEmail)] = txt_(u.UserName); });

  // 5.2 Día de referencia: hoy, o el último día con ventas (útil en demos)
  let ref = ahora;
  const hayHoy = T.Cuentas.some(function (c) { return mismoDia_(fecha_(c.Apertura), ahora); });
  if (!hayHoy) {
    T.Cuentas.forEach(function (c) { const f = fecha_(c.Apertura); if (f && (!ref || f > ref || ref === ahora)) ref = f; });
  }

  // 5.3 Cuentas del día y cuentas abiertas
  const cuentas = {};
  T.Cuentas.forEach(function (c) {
    const id = txt_(c.CuentaID);
    cuentas[id] = {
      id: id, numero: txt_(c.Numero), mesas: lista_(c.Mesas), estado: txt_(c.Estado),
      apertura: fecha_(c.Apertura), total: num_(c.Total_Final), mesero: nombres[txt_(c.Mesero)] || txt_(c.Mesero),
      pdf: txt_(c.PDF_Recibo) !== '', nota: txt_(c.Nota), pendientes: 0, totalVivo: 0
    };
  });

  const numeroMesa = {};
  T.Mesas.forEach(function (m) { numeroMesa[txt_(m.MesaID)] = txt_(m.Numero); });

  // 5.4 Comandas activas (lo que flota sobre cada estación) y tiempos de cocina del día
  const comandas = [];
  const vendidos = {};
  let sumaCocina = 0, nCocina = 0;
  T.DetalleCuenta.forEach(function (d) {
    const c = cuentas[txt_(d.Cuenta)];
    const est = txt_(d.Estado_Prep);
    if (!c || est === 'Anulado') return;
    const p = platos[txt_(d.Producto)] || { nombre: txt_(d.Producto), estacion: 'Cocina', meta: 10 };
    const enviado = fecha_(d.Enviado), listo = fecha_(d.Listo);
    c.totalVivo += num_(d.Cantidad) * num_(d.Precio_Unitario);
    if (mismoDia_(enviado, ref)) {
      vendidos[p.nombre] = (vendidos[p.nombre] || 0) + num_(d.Cantidad);
      if (listo) { sumaCocina += minutos_(enviado, listo); nCocina++; }
    }
    if (est === 'Pendiente' || est === 'En preparación' || est === 'Listo') {
      if (est !== 'Listo') c.pendientes++;
      comandas.push({
        id: txt_(d.DetalleID), cuenta: c.id, mesa: c.mesas.map(function (m) { return numeroMesa[m] || m; }).join('+') || 'Domicilio',
        plato: num_(d.Cantidad) + ' x ' + p.nombre, estacion: p.estacion, estado: est,
        minutos: minutos_(enviado, ahora), meta: p.meta
      });
    }
  });

  // 5.5 Mesas con estado visual: Libre / Ocupada / Con pedido / Por cobrar
  const mesas = T.Mesas.map(function (m) {
    const id = txt_(m.MesaID);
    const c = Object.keys(cuentas).map(function (k) { return cuentas[k]; })
      .filter(function (x) { return (x.estado === 'Abierta' || x.estado === 'Por cobrar') && x.mesas.indexOf(id) >= 0; })[0];
    let estado = 'Libre';
    if (c) estado = c.estado === 'Por cobrar' ? 'Por cobrar' : (c.pendientes > 0 ? 'Con pedido' : 'Ocupada');
    return {
      id: id, numero: txt_(m.Numero), zona: txt_(m.Zona), puestos: num_(m.Capacidad),
      estado: estado, cuenta: c ? c.id : '', unida: c ? c.mesas.length > 1 : false,
      total: c ? c.totalVivo : 0, minutos: c ? minutos_(c.apertura, ahora) : 0, mesero: c ? c.mesero : ''
    };
  });

  // 5.6 Domicilios: la moto sale con "En camino" y vuelve con "Entregado"
  const clientes = {};
  T.Clientes.forEach(function (c) { clientes[txt_(c.ClienteID)] = txt_(c.Nombre); });
  const domicilios = T.Domicilios.filter(function (d) { return txt_(d.Activo) !== 'FALSE'; }).map(function (d) {
    return {
      id: txt_(d.DomicilioID), cliente: clientes[txt_(d.Cliente)] || txt_(d.Cliente), estado: txt_(d.Estado),
      repartidor: nombres[txt_(d.Domiciliario)] || 'Sin asignar', minutos: minutos_(fecha_(d.Hora_Pedido), fecha_(d.Hora_Entrega) || ahora)
    };
  });
  const repartidores = T.User.filter(function (u) { return txt_(u.UseRole) === 'Repartidor'; })
    .map(function (u) { return { email: txt_(u.UserEmail), nombre: txt_(u.UserName) }; });

  // 5.7 Indicadores (tarjetas SVG)
  const pagadasDia = Object.keys(cuentas).map(function (k) { return cuentas[k]; })
    .filter(function (c) { return c.estado === 'Pagada' && mismoDia_(c.apertura, ref); });
  const ventas = pagadasDia.reduce(function (s, c) { return s + c.total; }, 0);
  const top = Object.keys(vendidos).map(function (k) { return { nombre: k, cantidad: vendidos[k] }; })
    .sort(function (a, b) { return b.cantidad - a.cantidad; }).slice(0, 5);

  // 5.8 Recibos PDF: las últimas cuentas pagadas, marcando si el bot ya generó el archivo
  const recibos = Object.keys(cuentas).map(function (k) { return cuentas[k]; })
    .filter(function (c) { return c.estado === 'Pagada'; })
    .sort(function (a, b) { return (b.apertura || 0) - (a.apertura || 0); }).slice(0, 6)
    .map(function (c) { return { cuenta: c.id, numero: c.numero, total: c.total, pdf: c.pdf }; });

  const negocio = T.Config.length ? txt_(T.Config[0].Negocio) : 'Restaurante';
  return {
    negocio: negocio,
    generado: Utilities.formatDate(ahora, Session.getScriptTimeZone(), 'HH:mm:ss'),
    diaReferencia: Utilities.formatDate(ref, Session.getScriptTimeZone(), 'dd/MM/yyyy'),
    mesas: mesas, comandas: comandas, domicilios: domicilios, repartidores: repartidores, recibos: recibos,
    kpis: {
      ventas: ventas, cuentas: pagadasDia.length, ticket: pagadasDia.length ? Math.round(ventas / pagadasDia.length) : 0,
      mesasActivas: mesas.filter(function (m) { return m.estado !== 'Libre'; }).length, mesasTotal: mesas.length,
      tiempoCocina: nCocina ? Math.round(sumaCocina / nCocina) : 0,
      enRuta: domicilios.filter(function (d) { return d.estado === 'En camino'; }).length,
      top: top
    }
  };
}
```

### index.html
```html
<!DOCTYPE html>
<html lang="es">
<head>
<base target="_top">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Cocina 3D en vivo</title>
<!-- BLOQUE 0 · Librerías: Three.js r147 (versión con build global) y sus controles de órbita -->
<script src="https://cdn.jsdelivr.net/npm/three@0.147.0/build/three.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/controls/OrbitControls.js"></script>
<style>
  :root { --rojo:#d7262e; --amarillo:#ffc72c; --verde:#22a352; --ambar:#f59e0b; --azul:#2f6fe4; --gris:#8b93a1;
          --fondo:#120c0a; --panel:rgba(22,16,14,.82); --texto:#fff7ea; --suave:#d9c9b4; }
  * { box-sizing:border-box; margin:0; padding:0; }
  html, body { width:100%; height:100%; overflow:hidden; background:var(--fondo); color:var(--texto); font-family:"Segoe UI", Roboto, Arial, sans-serif; }
  #escena { position:fixed; inset:0; }
  .capa { position:fixed; z-index:2; }
  /* Encabezado */
  #cabecera { top:12px; left:16px; right:16px; display:flex; align-items:center; gap:12px; pointer-events:none; }
  #cabecera h1 { font-size:20px; font-weight:800; letter-spacing:.3px; }
  #cabecera h1 b { color:var(--amarillo); }
  #reloj { margin-left:auto; font-size:13px; color:var(--suave); background:var(--panel); padding:6px 10px; border-radius:20px; }
  .punto { display:inline-block; width:8px; height:8px; border-radius:50%; background:var(--verde); margin-right:6px; animation:latir 1.6s infinite; }
  @keyframes latir { 50% { opacity:.25; } }
  /* KPIs en SVG */
  #kpis { top:52px; left:16px; width:min(560px, calc(100% - 32px)); }
  #kpis svg { width:100%; height:auto; display:block; }
  /* Panel derecho: top de productos y recibos */
  #lateral { top:52px; right:16px; width:250px; display:flex; flex-direction:column; gap:10px; }
  .tarjeta { background:var(--panel); border-radius:14px; padding:12px; backdrop-filter:blur(6px); }
  .tarjeta h3 { font-size:12px; text-transform:uppercase; letter-spacing:.8px; color:var(--suave); margin-bottom:8px; }
  .recibo { display:flex; justify-content:space-between; font-size:13px; padding:4px 0; border-bottom:1px solid rgba(255,255,255,.08); }
  .recibo .ok { color:var(--verde); font-weight:700; } .recibo .no { color:var(--gris); }
  .recibo.nuevo { animation:brillo 2.5s; } @keyframes brillo { 0%,40% { background:rgba(255,199,44,.35); } }
  /* Cámaras */
  #camaras { bottom:16px; left:50%; transform:translateX(-50%); display:flex; gap:8px; background:var(--panel); padding:6px; border-radius:30px; }
  #camaras button { border:0; background:transparent; color:var(--texto); font:600 13px inherit; padding:8px 14px; border-radius:20px; cursor:pointer; }
  #camaras button.activa { background:var(--rojo); }
  /* Leyenda */
  #leyenda { bottom:16px; left:16px; font-size:12px; display:flex; gap:10px; flex-wrap:wrap; max-width:46%; }
  #leyenda span::before { content:""; display:inline-block; width:10px; height:10px; border-radius:3px; margin-right:5px; background:var(--c); vertical-align:-1px; }
  /* Detalle al hacer clic */
  #detalle { right:16px; bottom:70px; width:280px; display:none; }
  #detalle.abierto { display:block; }
  #detalle a { display:inline-block; margin-top:10px; background:var(--amarillo); color:#3a1d00; font-weight:800; font-size:13px; padding:8px 12px; border-radius:10px; text-decoration:none; }
  #detalle .cerrar { float:right; cursor:pointer; color:var(--suave); }
  #aviso { top:50%; left:50%; transform:translate(-50%,-50%); background:var(--rojo); padding:14px 22px; border-radius:14px; font-weight:800; display:none; }
  #aviso.ver { display:block; animation:aparecer 3s forwards; } @keyframes aparecer { 0% { opacity:0; transform:translate(-50%,-40%); } 15%,80% { opacity:1; transform:translate(-50%,-50%); } 100% { opacity:0; } }
  /* Celular y iPad: el panel lateral baja y se encoge */
  @media (max-width: 900px) { #lateral { top:auto; bottom:70px; right:16px; width:200px; } #lateral .tarjeta:first-child { display:none; } #leyenda { display:none; } }
  @media (max-width: 560px) { #lateral { display:none; } #cabecera h1 { font-size:16px; } #camaras button { padding:7px 9px; font-size:12px; } }
</style>
</head>
<body>
<div id="escena"></div>
<div id="cabecera" class="capa"><h1>Cocina <b>3D</b> en vivo · <span id="negocio">…</span></h1><div id="reloj"><span class="punto"></span><span id="hora">conectando…</span></div></div>
<div id="kpis" class="capa"></div>
<div id="lateral" class="capa">
  <div class="tarjeta"><h3>Lo más vendido</h3><div id="top"></div></div>
  <div class="tarjeta"><h3>Recibos PDF (bot)</h3><div id="recibos"></div></div>
</div>
<div id="leyenda" class="capa">
  <span style="--c:var(--verde)">Libre</span><span style="--c:var(--rojo)">Ocupada</span>
  <span style="--c:var(--azul)">Con pedido</span><span style="--c:var(--ambar)">Por cobrar</span>
</div>
<div id="camaras" class="capa">
  <button data-cam="aerea" class="activa">Aérea</button><button data-cam="salon">Salón</button>
  <button data-cam="cocina">Cocina</button><button data-cam="domicilios">Domicilios</button>
</div>
<div id="detalle" class="capa tarjeta"></div>
<div id="aviso" class="capa"></div>

<script>
// =====================================================================
// BLOQUE 1 · Configuración y utilidades
// =====================================================================
var REFRESCO = Number('<?= refresco ?>') || 10;            // segundos entre consultas
var APP_ID = '<?= appId ?>', APP_NAME = '<?= appName ?>';   // los llena Apps Script
if (APP_ID.indexOf('<') === 0) { APP_ID = 'PEGA_AQUI_EL_ID_DE_TU_APP'; APP_NAME = 'NOMBRE_DE_TU_APP'; }
var MODO_DEMO = !(window.google && google.script && google.script.run);  // abierto fuera de Apps Script

var COLOR = { 'Libre':0x22a352, 'Ocupada':0xd7262e, 'Con pedido':0x2f6fe4, 'Por cobrar':0xf59e0b };
function pesos(v) { return '$' + Math.round(v || 0).toLocaleString('es-CO'); }
function corto(v) { return v >= 1e6 ? '$' + (v / 1e6).toFixed(1).replace('.', ',') + ' M' : v >= 1e3 ? '$' + Math.round(v / 1e3) + ' mil' : pesos(v); }
function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]; }); }
function lerp(a, b, t) { return a + (b - a) * t; }
/** Enlace profundo a la cuenta dentro de la app AppSheet (equivale a LINKTOROW). */
function enlaceCuenta(id) {
  return 'https://www.appsheet.com/start/' + APP_ID + '#appName=' + encodeURIComponent(APP_NAME) +
         '&table=Cuentas&row=' + encodeURIComponent(id) + '&view=Cuentas_Detail';
}

// =====================================================================
// BLOQUE 2 · Escena, cámara, luces y controles
// =====================================================================
var contenedor = document.getElementById('escena');
var renderer = new THREE.WebGLRenderer({ antialias:true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.outputEncoding = THREE.sRGBEncoding;
contenedor.appendChild(renderer.domElement);

var scene = new THREE.Scene();
scene.background = new THREE.Color(0x120c0a);
scene.fog = new THREE.Fog(0x120c0a, 45, 90);
var camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
var controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.maxPolarAngle = Math.PI * 0.47; controls.minDistance = 8; controls.maxDistance = 60;

scene.add(new THREE.HemisphereLight(0xfff3e0, 0x3a2418, 0.6));
var sol = new THREE.DirectionalLight(0xffe6c8, 0.9);
sol.position.set(-14, 26, 16); sol.castShadow = true;
sol.shadow.mapSize.set(2048, 2048);
['left','right','top','bottom'].forEach(function (k, i) { sol.shadow.camera[k] = [-30, 30, 22, -22][i]; });
scene.add(sol);
var luzCocina = new THREE.PointLight(0xffb347, 0.8, 18); luzCocina.position.set(10, 6, -3); scene.add(luzCocina);

function ajustarTamano() {
  var w = innerWidth, h = innerHeight;
  renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
}
addEventListener('resize', ajustarTamano); ajustarTamano();

// =====================================================================
// BLOQUE 3 · Fábrica de piezas low-poly (cajas, cilindros, rótulos)
// =====================================================================
function mat(color, extra) { return new THREE.MeshStandardMaterial(Object.assign({ color:color, roughness:.7, metalness:.05, flatShading:true }, extra || {})); }
function caja(w, h, d, color, x, y, z) {
  var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof color === 'number' ? mat(color) : color);
  m.position.set(x || 0, y || 0, z || 0); m.castShadow = m.receiveShadow = true; return m;
}
function cilindro(r1, r2, h, color, seg) {
  var m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg || 12), typeof color === 'number' ? mat(color) : color);
  m.castShadow = m.receiveShadow = true; return m;
}
/** Rótulo: un canvas 2D convertido en textura sobre un Sprite (siempre mira a la cámara). */
function rotulo(ancho, alto, escala) {
  var cv = document.createElement('canvas'); cv.width = ancho; cv.height = alto;
  var tex = new THREE.CanvasTexture(cv); tex.encoding = THREE.sRGBEncoding;
  var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map:tex, transparent:true, depthWrite:false }));
  sp.scale.set(escala, escala * alto / ancho, 1);
  sp.userData.ctx = cv.getContext('2d'); sp.userData.tex = tex;
  return sp;
}
function cajaRedonda(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

// =====================================================================
// BLOQUE 4 · El local: piso, zonas, cocina, asador, freidoras, caja y calle
// =====================================================================
// Distribución (x hacia la derecha, z hacia el frente):
//   Salón  x -16..4   ·  Cocina  x 6..16  ·  Calle z 13..17  ·  Puerta x 4 z 11
scene.add(caja(34, .4, 26, 0x2a1a14, 0, -.2, 0));                // base
scene.add(caja(21, .1, 22, 0x9b6a43, -6, .05, -1));              // piso del salón (madera)
scene.add(caja(11, .1, 22, 0xd9d2c7, 11, .05, -1));              // piso de la cocina (baldosa)
scene.add(caja(34, .08, 4, 0x3b3b40, 0, .04, 15));               // calle
for (var i = -16; i < 17; i += 3) scene.add(caja(1.4, .02, .2, 0xf2f2f2, i, .1, 15));  // líneas de la calle
scene.add(caja(.4, 3, 22, 0xf3e9da, 5.2, 1.5, -1));              // muro entre salón y cocina
scene.add(caja(34, 3, .4, 0xd7262e, 0, 1.5, -12));               // muro del fondo (rojo genérico)
scene.add(caja(34, .5, .45, 0xffc72c, 0, 3.1, -12));             // franja amarilla

// Pase: el mostrador donde la cocina deja los platos listos
var pase = caja(.9, 1.1, 8, 0xc9c2b8, 5.2, .55, -1); scene.add(pase);
// Freidoras (Puesto = Cocina): tres cubas con aceite que brilla
var freidoras = [];
[-7.5, -5, -2.5].forEach(function (z) {
  var g = new THREE.Group();
  g.add(caja(2, 1.2, 1.6, 0x9aa3ad, 0, .6, 0));
  var aceite = caja(1.7, .05, 1.3, mat(0xe0a127, { emissive:0x8a4a00, emissiveIntensity:.5 }), 0, 1.23, 0);
  g.add(aceite); g.userData.aceite = aceite;
  g.position.set(9, 0, z); scene.add(g); freidoras.push(g);
});
// Asador de pollo (Puesto = Parrilla): vitrina con varillas que giran
var asador = new THREE.Group();
asador.add(caja(3, 1, 2, 0x5b6068, 0, .5, 0));
asador.add(caja(3, 1.8, .1, mat(0xbfe3ff, { transparent:true, opacity:.25 }), 0, 1.9, .95));
var brasas = caja(2.6, .1, 1.6, mat(0xff5a1f, { emissive:0xff3300, emissiveIntensity:.9 }), 0, 1.05, 0); asador.add(brasas);
var varillas = [];
[1.5, 2.1, 2.7].forEach(function (y) {
  var v = new THREE.Group();
  for (var k = -1; k <= 1; k++) { var pollo = new THREE.Mesh(new THREE.SphereGeometry(.28, 8, 6), mat(0xc0661d)); pollo.scale.set(1, .8, 1.3); pollo.position.x = k * .8; pollo.castShadow = true; v.add(pollo); }
  v.position.y = y; asador.add(v); varillas.push(v);
});
asador.position.set(13.5, 0, 2); scene.add(asador);
// Mesón de despacho de domicilios y caja
var caja_ = caja(3, 1.1, 1.2, 0x7a3b1f, -1, .55, 8.5); scene.add(caja_);
var pantallaCaja = caja(.9, .6, .08, mat(0x111111, { emissive:0x113355, emissiveIntensity:.6 }), -1, 1.45, 8.4); scene.add(pantallaCaja);
scene.add(caja(3, 2.6, .3, 0x4a2a18, 4, 1.3, 11.6));            // marco de la puerta
var puerta = new THREE.Vector3(4, 0, 12.6);

// Rótulos fijos de cada estación
function rotuloFijo(texto, x, y, z, color) {
  var r = rotulo(256, 64, 3.2), g = r.userData.ctx;
  g.fillStyle = color || 'rgba(0,0,0,.65)'; cajaRedonda(g, 4, 4, 248, 56, 14); g.fill();
  g.fillStyle = '#fff'; g.font = '800 30px Segoe UI, Arial'; g.textAlign = 'center'; g.fillText(texto, 128, 44);
  r.userData.tex.needsUpdate = true; r.position.set(x, y, z); scene.add(r); return r;
}
rotuloFijo('FREIDORAS', 9, 3.4, -5, 'rgba(215,38,46,.85)');
rotuloFijo('ASADOR', 13.5, 4.1, 2, 'rgba(215,38,46,.85)');
rotuloFijo('PASE', 5.2, 2.6, 3.5);
rotuloFijo('CAJA', -1, 2.6, 8.5);
rotuloFijo('DOMICILIOS', 4, 3.4, 12);

// =====================================================================
// BLOQUE 5 · Mesas (una por fila de la tabla Mesas)
// =====================================================================
var mesas3d = {};           // MesaID -> { grupo, tablero, rotulo, datos }
var clicables = [];         // objetos que responden al clic
function posicionMesa(i) { var col = i % 4, fila = Math.floor(i / 4); return new THREE.Vector3(-14 + col * 4.4, 0, -8 + fila * 5.2); }
function crearMesa(m, i) {
  var g = new THREE.Group(), p = posicionMesa(i);
  var tablero = cilindro(1.1, 1.1, .18, 0x22a352, 16); tablero.position.y = 1;
  var pata = cilindro(.12, .2, 1, 0x3a2a20); pata.position.y = .5;
  g.add(tablero, pata);
  for (var s = 0; s < Math.min(m.puestos || 4, 6); s++) {           // sillas alrededor
    var a = s / Math.min(m.puestos || 4, 6) * Math.PI * 2;
    g.add(caja(.5, .55, .5, 0x6b4a33, Math.cos(a) * 1.55, .28, Math.sin(a) * 1.55));
  }
  var r = rotulo(256, 128, 2.6); r.position.y = 2.4; g.add(r);
  g.position.copy(p); scene.add(g);
  tablero.userData.tipo = 'mesa'; tablero.userData.id = m.id; clicables.push(tablero);
  mesas3d[m.id] = { grupo:g, tablero:tablero, rotulo:r, datos:null, firma:'' };
}
function pintarRotuloMesa(obj, m) {
  var g = obj.rotulo.userData.ctx, color = '#' + COLOR[m.estado].toString(16).padStart(6, '0');
  g.clearRect(0, 0, 256, 128);
  g.fillStyle = 'rgba(18,12,10,.8)'; cajaRedonda(g, 6, 6, 244, 116, 18); g.fill();
  g.fillStyle = color; cajaRedonda(g, 6, 6, 244, 34, 18); g.fill();
  g.fillStyle = '#fff'; g.textAlign = 'center';
  g.font = '800 24px Segoe UI, Arial'; g.fillText('MESA ' + m.numero + (m.unida ? ' (unida)' : ''), 128, 32);
  g.font = '700 22px Segoe UI, Arial'; g.fillText(m.estado, 128, 70);
  g.font = '600 20px Segoe UI, Arial'; g.fillStyle = '#ffd98a';
  g.fillText(m.estado === 'Libre' ? (m.puestos + ' puestos') : (pesos(m.total) + ' · ' + m.minutos + ' min'), 128, 102);
  obj.rotulo.userData.tex.needsUpdate = true;
}
/** Solo repinta si la firma (estado + total + minutos) cambió. */
function actualizarMesa(m, i) {
  if (!mesas3d[m.id]) crearMesa(m, i);
  var obj = mesas3d[m.id], firma = [m.estado, m.total, m.minutos, m.unida].join('|');
  obj.datos = m;
  if (obj.firma === firma) return;
  obj.firma = firma;
  obj.colorMeta = new THREE.Color(COLOR[m.estado]);   // el color se mezcla suave en el bucle
  pintarRotuloMesa(obj, m);
}

// =====================================================================
// BLOQUE 6 · Comandas flotantes con temporizador
// =====================================================================
var comandas3d = {};        // DetalleID -> sprite
function puntoEstacion(c, n) {
  if (c.estado === 'Listo') return new THREE.Vector3(5.2, 2.4 + Math.floor(n / 3) * .85, -4 + (n % 3) * 2.2);    // sobre el pase
  if (c.estacion === 'Parrilla') return new THREE.Vector3(13.5 + (n % 2) * 2, 4.9 + Math.floor(n / 2) * .85, 2);   // sobre el asador
  return new THREE.Vector3(9, 4.2 + Math.floor(n / 3) * .85, -7.5 + (n % 3) * 2.5);                                // sobre las freidoras
}
function pintarComanda(sp, c) {
  var g = sp.userData.ctx, ratio = c.minutos / c.meta;
  var borde = c.estado === 'Listo' ? '#22a352' : ratio >= 1 ? '#d7262e' : ratio >= .7 ? '#f59e0b' : '#2f6fe4';
  g.clearRect(0, 0, 320, 120);
  g.fillStyle = '#fffaf0'; cajaRedonda(g, 4, 4, 312, 112, 14); g.fill();
  g.lineWidth = 8; g.strokeStyle = borde; g.stroke();
  g.fillStyle = '#2a1a10'; g.font = '800 22px Segoe UI, Arial'; g.fillText(c.plato.slice(0, 24), 18, 40);
  g.font = '600 19px Segoe UI, Arial'; g.fillStyle = '#6b5a4a'; g.fillText('Mesa ' + c.mesa + ' · ' + c.estado, 18, 72);
  g.fillStyle = borde; g.font = '800 24px Segoe UI, Arial';
  g.fillText(c.estado === 'Listo' ? '¡LISTO!' : c.minutos + ' / ' + c.meta + ' min', 18, 104);
  sp.userData.tex.needsUpdate = true;
}
function actualizarComandas(lista) {
  var vistas = {}, contador = {};
  lista.forEach(function (c) {
    var clave = c.estado === 'Listo' ? 'pase' : c.estacion;
    var n = contador[clave] = (contador[clave] || 0) + 1;
    var sp = comandas3d[c.id];
    if (!sp) {
      sp = rotulo(320, 120, 1.9); sp.userData.tipo = 'comanda'; sp.userData.id = c.id;
      sp.position.copy(puntoEstacion(c, n - 1)).add(new THREE.Vector3(0, 3, 0));   // entra cayendo
      scene.add(sp); clicables.push(sp); comandas3d[c.id] = sp;
    }
    var firma = [c.estado, c.minutos].join('|');
    if (sp.userData.firma !== firma) { pintarComanda(sp, c); sp.userData.firma = firma; }
    sp.userData.datos = c; sp.userData.destino = puntoEstacion(c, n - 1);
    vistas[c.id] = true;
  });
  Object.keys(comandas3d).forEach(function (id) {             // las que ya se entregaron se van
    if (!vistas[id]) { var sp = comandas3d[id]; scene.remove(sp); clicables.splice(clicables.indexOf(sp), 1); delete comandas3d[id]; }
  });
}

// =====================================================================
// BLOQUE 7 · Muñecos: meseros y cocineros que caminan con lerp
// =====================================================================
function muneco(camisa, gorro) {
  var g = new THREE.Group();
  var piernaI = caja(.22, .7, .22, 0x2b2b33, -.14, .35, 0), piernaD = caja(.22, .7, .22, 0x2b2b33, .14, .35, 0);
  var cuerpo = caja(.6, .8, .36, camisa, 0, 1.1, 0);
  var cabeza = new THREE.Mesh(new THREE.SphereGeometry(.24, 10, 8), mat(0xe0b08a)); cabeza.position.y = 1.75; cabeza.castShadow = true;
  g.add(piernaI, piernaD, cuerpo, cabeza);
  if (gorro) { var gor = cilindro(.2, .24, .3, 0xffffff); gor.position.y = 2.05; g.add(gor); }
  g.userData = { piernas:[piernaI, piernaD], destino:new THREE.Vector3(), velocidad:2.2, espera:0 };
  scene.add(g); return g;
}
var meseros = [muneco(0xd7262e), muneco(0xd7262e), muneco(0xd7262e)];
meseros.forEach(function (m, i) { m.position.set(-2 + i, 0, 4); });
var cocineros = [muneco(0xffffff, true), muneco(0xffffff, true), muneco(0xffc72c, true)];
cocineros[0].position.set(7.4, 0, -7); cocineros[1].position.set(7.4, 0, -3); cocineros[2].position.set(13.5, 0, 3.6);

/** Elige el siguiente destino de cada muñeco según el estado del restaurante. */
function asignarTareas() {
  var listos = Object.keys(comandas3d).map(function (k) { return comandas3d[k].userData.datos; }).filter(function (c) { return c.estado === 'Listo'; });
  var conGente = Object.keys(mesas3d).map(function (k) { return mesas3d[k]; }).filter(function (o) { return o.datos && o.datos.estado !== 'Libre'; });
  meseros.forEach(function (m, i) {
    if (m.userData.espera > 0) return;
    if (listos[i]) {                 // hay plato listo: va al pase y luego a la mesa
      var mesa = Object.keys(mesas3d).map(function (k) { return mesas3d[k]; }).filter(function (o) { return o.datos && o.datos.cuenta === listos[i].cuenta; })[0];
      m.userData.ruta = [new THREE.Vector3(4.2, 0, -2 + i * 1.5)].concat(mesa ? [mesa.grupo.position.clone().add(new THREE.Vector3(1.6, 0, 0))] : []);
    } else if (conGente.length) {    // sin platos: recorre mesas ocupadas
      var o = conGente[Math.floor(Math.random() * conGente.length)];
      m.userData.ruta = [o.grupo.position.clone().add(new THREE.Vector3(-1.6, 0, .4))];
    } else {
      m.userData.ruta = [new THREE.Vector3(-3 + i * 1.2, 0, 7)];   // esperan cerca de la caja
    }
  });
  var hayFritos = Object.keys(comandas3d).some(function (k) { var c = comandas3d[k].userData.datos; return c.estacion !== 'Parrilla' && c.estado !== 'Listo'; });
  cocineros.slice(0, 2).forEach(function (c, i) {
    var z = hayFritos ? [-7.5, -5, -2.5][Math.floor(Math.random() * 3)] : -6 + i * 3;
    c.userData.ruta = [new THREE.Vector3(7.4, 0, z)];
  });
  cocineros[2].userData.ruta = [new THREE.Vector3(12 + Math.random() * 3, 0, 3.6)];
}
function moverMuneco(m, dt, t) {
  var ruta = m.userData.ruta;
  if (!ruta || !ruta.length) { m.userData.espera = Math.max(0, m.userData.espera - dt); return; }
  var d = ruta[0], dx = d.x - m.position.x, dz = d.z - m.position.z, dist = Math.hypot(dx, dz);
  if (dist < .1) { ruta.shift(); if (!ruta.length) m.userData.espera = 1.5; return; }
  var paso = Math.min(1, m.userData.velocidad * dt / dist);
  m.position.x = lerp(m.position.x, d.x, paso); m.position.z = lerp(m.position.z, d.z, paso);
  m.rotation.y = Math.atan2(dx, dz);
  var balanceo = Math.sin(t * 10) * .35;                        // caminado: piernas alternadas
  m.userData.piernas[0].rotation.x = balanceo; m.userData.piernas[1].rotation.x = -balanceo;
  m.position.y = Math.abs(Math.sin(t * 10)) * .05;
}

// =====================================================================
// BLOQUE 8 · Motos de domicilio (salen con "En camino", vuelven con "Entregado")
// =====================================================================
var motos = {};             // nombre del repartidor -> moto
function crearMoto(i) {
  var g = new THREE.Group();
  g.add(caja(1.4, .4, .45, 0xd7262e, 0, .6, 0));                 // chasis
  g.add(caja(.6, .5, .6, 0xffc72c, -.45, 1.05, 0));              // maleta térmica
  [-.55, .55].forEach(function (x) { var r = new THREE.Mesh(new THREE.TorusGeometry(.3, .1, 6, 12), mat(0x1a1a1a)); r.position.set(x, .35, 0); g.add(r); });
  var piloto = muneco(0x222831); piloto.scale.setScalar(.7); piloto.position.set(.1, .5, 0); scene.remove(piloto); g.add(piloto);
  var base = new THREE.Vector3(1 + i * 2, 0, 13.6);
  g.position.copy(base); g.userData = { base:base, x:base.x, objetivo:base.x, enRuta:false };
  scene.add(g); return g;
}
function actualizarMotos(domicilios, repartidores) {
  repartidores.forEach(function (r, i) { if (!motos[r.nombre]) motos[r.nombre] = crearMoto(i); });
  Object.keys(motos).forEach(function (nombre) {
    var enCamino = domicilios.some(function (d) { return d.repartidor === nombre && d.estado === 'En camino'; });
    var moto = motos[nombre];
    moto.userData.enRuta = enCamino;
    moto.userData.objetivo = enCamino ? 26 : moto.userData.base.x;   // 26 = fuera de cuadro por la derecha
  });
}
function moverMotos(dt) {
  Object.keys(motos).forEach(function (k) {
    var m = motos[k], u = m.userData;
    m.position.x = lerp(m.position.x, u.objetivo, Math.min(1, dt * .6));
    m.position.z = u.enRuta || Math.abs(m.position.x - u.base.x) > .5 ? 15 : u.base.z;   // por la calle
    m.rotation.y = u.objetivo > m.position.x ? 0 : Math.PI;
    m.visible = m.position.x < 24;
  });
}

// =====================================================================
// BLOQUE 9 · Indicadores en SVG (tarjetas, anillo de progreso y barras)
// =====================================================================
function svgKpis(k) {
  var tarjetas = [['Ventas del día', corto(k.ventas)], ['Ticket promedio', corto(k.ticket)],
                  ['Cocina (prom.)', k.tiempoCocina + ' min'], ['Domicilios en ruta', k.enRuta]];
  var ancho = 560, h = 92, s = '<svg viewBox="0 0 ' + ancho + ' ' + h + '" xmlns="http://www.w3.org/2000/svg">';
  // Anillo: mesas activas sobre el total
  var r = 30, cir = 2 * Math.PI * r, p = k.mesasTotal ? k.mesasActivas / k.mesasTotal : 0;
  s += '<rect x="0" y="0" width="100" height="' + h + '" rx="14" fill="rgba(22,16,14,.82)"/>' +
       '<circle cx="50" cy="40" r="' + r + '" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="8"/>' +
       '<circle cx="50" cy="40" r="' + r + '" fill="none" stroke="#ffc72c" stroke-width="8" stroke-linecap="round" stroke-dasharray="' + (cir * p) + ' ' + cir + '" transform="rotate(-90 50 40)"/>' +
       '<text x="50" y="46" text-anchor="middle" font-size="18" font-weight="800" fill="#fff">' + k.mesasActivas + '/' + k.mesasTotal + '</text>' +
       '<text x="50" y="84" text-anchor="middle" font-size="11" fill="#d9c9b4">mesas activas</text>';
  tarjetas.forEach(function (t, i) {
    var x = 108 + i * 113;
    s += '<rect x="' + x + '" y="0" width="105" height="' + h + '" rx="14" fill="rgba(22,16,14,.82)"/>' +
         '<rect x="' + x + '" y="0" width="105" height="5" rx="2" fill="' + (i % 2 ? '#ffc72c' : '#d7262e') + '"/>' +
         '<text x="' + (x + 10) + '" y="30" font-size="11" fill="#d9c9b4">' + t[0] + '</text>' +
         '<text x="' + (x + 10) + '" y="64" font-size="22" font-weight="800" fill="#fff">' + esc(t[1]) + '</text>';
  });
  return s + '</svg>';
}
function svgTop(top) {
  if (!top.length) return '<small>Sin ventas en el día</small>';
  var max = top[0].cantidad, s = '<svg viewBox="0 0 226 ' + top.length * 30 + '" xmlns="http://www.w3.org/2000/svg" width="100%">';
  top.forEach(function (p, i) {
    var w = Math.max(6, 130 * p.cantidad / max), y = i * 30;
    s += '<text x="0" y="' + (y + 12) + '" font-size="11" fill="#fff7ea">' + esc(p.nombre.slice(0, 30)) + '</text>' +
         '<rect x="0" y="' + (y + 16) + '" width="' + w + '" height="8" rx="4" fill="' + (i ? '#ffc72c' : '#d7262e') + '"/>' +
         '<text x="' + (w + 6) + '" y="' + (y + 24) + '" font-size="11" font-weight="700" fill="#ffc72c">' + p.cantidad + '</text>';
  });
  return s + '</svg>';
}

// =====================================================================
// BLOQUE 10 · Recibos PDF: el bot de AppSheet llena PDF_Recibo y aquí se nota
// =====================================================================
var pdfVistos = {}, primeraCarga = true;
function pintarRecibos(recibos) {
  var html = '';
  recibos.forEach(function (r) {
    var nuevo = r.pdf && !pdfVistos[r.cuenta] && !primeraCarga;
    if (nuevo) avisar('🧾 Recibo PDF generado · Cuenta ' + r.numero);
    if (r.pdf) pdfVistos[r.cuenta] = true;
    html += '<div class="recibo' + (nuevo ? ' nuevo' : '') + '"><span>Cuenta ' + esc(r.numero) + ' · ' + corto(r.total) + '</span>' +
            (r.pdf ? '<span class="ok">PDF ✓</span>' : '<span class="no">pendiente</span>') + '</div>';
  });
  document.getElementById('recibos').innerHTML = html || '<small>Aún no hay cuentas pagadas</small>';
  if (recibos.some(function (r) { return r.pdf && !primeraCarga; })) pantallaCaja.material.emissiveIntensity = 2;
}
function avisar(texto) {
  var a = document.getElementById('aviso'); a.textContent = texto;
  a.classList.remove('ver'); void a.offsetWidth; a.classList.add('ver');
}

// =====================================================================
// BLOQUE 11 · Refresco: pide el estado cada N segundos y aplica solo los cambios
// =====================================================================
var ESTADO = null;
function aplicarEstado(e) {
  ESTADO = e;
  document.getElementById('negocio').textContent = e.negocio;
  document.getElementById('hora').textContent = 'Actualizado ' + e.generado + (MODO_DEMO ? ' · demo' : '');
  e.mesas.forEach(actualizarMesa);
  actualizarComandas(e.comandas);
  actualizarMotos(e.domicilios, e.repartidores);
  document.getElementById('kpis').innerHTML = svgKpis(e.kpis);
  document.getElementById('top').innerHTML = svgTop(e.kpis.top);
  pintarRecibos(e.recibos);
  asignarTareas();
  primeraCarga = false;
}
function pedirEstado() {
  if (MODO_DEMO) { aplicarEstado(DEMO.siguiente()); return; }
  google.script.run.withSuccessHandler(aplicarEstado)
    .withFailureHandler(function (err) { document.getElementById('hora').textContent = 'Error: ' + err.message; })
    .getEstado();
}

// =====================================================================
// BLOQUE 12 · Clic en mesa o comanda: detalle + enlace profundo a AppSheet
// =====================================================================
var raycaster = new THREE.Raycaster(), puntero = new THREE.Vector2();
renderer.domElement.addEventListener('click', function (ev) {
  puntero.set(ev.clientX / innerWidth * 2 - 1, -ev.clientY / innerHeight * 2 + 1);
  raycaster.setFromCamera(puntero, camera);
  var golpe = raycaster.intersectObjects(clicables, false)[0];
  if (!golpe) return;
  var u = golpe.object.userData, html = '<span class="cerrar" onclick="this.parentNode.classList.remove(\'abierto\')">✕</span>';
  if (u.tipo === 'mesa') {
    var m = mesas3d[u.id].datos;
    html += '<h3>Mesa ' + esc(m.numero) + ' · ' + esc(m.zona) + '</h3><b>' + esc(m.estado) + '</b>' +
            (m.cuenta ? '<br>Cuenta ' + esc(m.cuenta) + ' · ' + pesos(m.total) + '<br>Mesero: ' + esc(m.mesero) + '<br>Abierta hace ' + m.minutos + ' min' +
            '<br><a href="' + enlaceCuenta(m.cuenta) + '" target="_blank">Abrir en AppSheet ›</a>' : '<br>' + m.puestos + ' puestos disponibles');
  } else {
    var c = u.datos;
    html += '<h3>Comanda · ' + esc(c.estacion === 'Parrilla' ? 'Asador' : 'Freidoras') + '</h3><b>' + esc(c.plato) + '</b><br>Mesa ' + esc(c.mesa) +
            '<br>' + esc(c.estado) + ' · ' + c.minutos + ' de ' + c.meta + ' min' +
            '<br><a href="' + enlaceCuenta(c.cuenta) + '" target="_blank">Ver la cuenta en AppSheet ›</a>';
  }
  var d = document.getElementById('detalle'); d.innerHTML = html; d.classList.add('abierto');
});

// =====================================================================
// BLOQUE 13 · Cámaras con transición suave
// =====================================================================
var CAMARAS = {
  aerea:      { pos:[0, 34, 26],   mira:[0, 0, 0] },
  salon:      { pos:[-6, 12, 14],  mira:[-6, 0, -2] },
  cocina:     { pos:[-3, 15, 13],  mira:[10, 2, -2] },
  domicilios: { pos:[-4, 7, 26],   mira:[6, 0, 13] }
};
var camDestino = null;
function irACamara(nombre) {
  var c = CAMARAS[nombre];
  camDestino = { pos:new THREE.Vector3().fromArray(c.pos), mira:new THREE.Vector3().fromArray(c.mira) };
  document.querySelectorAll('#camaras button').forEach(function (b) { b.classList.toggle('activa', b.dataset.cam === nombre); });
}
document.querySelectorAll('#camaras button').forEach(function (b) { b.addEventListener('click', function () { irACamara(b.dataset.cam); }); });
camera.position.set(0, 50, 40); controls.target.set(0, 0, 0); irACamara(innerWidth < 560 ? 'salon' : 'aerea');
controls.addEventListener('start', function () { camDestino = null; });   // si el usuario mueve la cámara, se respeta

// =====================================================================
// BLOQUE 14 · Bucle de animación (requestAnimationFrame)
// =====================================================================
var reloj = new THREE.Clock(), tareas = 0;
function animar() {
  requestAnimationFrame(animar);
  var dt = Math.min(reloj.getDelta(), .05), t = reloj.elapsedTime;
  if (camDestino) {
    camera.position.lerp(camDestino.pos, dt * 2); controls.target.lerp(camDestino.mira, dt * 2);
    if (camera.position.distanceTo(camDestino.pos) < .05) camDestino = null;
  }
  Object.keys(mesas3d).forEach(function (k) {                      // color de mesa: transición suave
    var o = mesas3d[k]; if (o.colorMeta) o.tablero.material.color.lerp(o.colorMeta, dt * 3);
    if (o.datos && o.datos.estado === 'Por cobrar') o.tablero.position.y = 1 + Math.sin(t * 4) * .04;
  });
  Object.keys(comandas3d).forEach(function (k) {                   // comandas: bajan a su lugar y flotan
    var sp = comandas3d[k], d = sp.userData.destino;
    sp.position.lerp(d, dt * 3); sp.position.y += Math.sin(t * 2 + k.length) * .003;
  });
  varillas.forEach(function (v, i) { v.rotation.x += dt * (1.2 + i * .2); });   // el asador gira
  freidoras.forEach(function (f, i) { f.userData.aceite.material.emissiveIntensity = .4 + Math.abs(Math.sin(t * 6 + i)) * .4; });
  brasas.material.emissiveIntensity = .7 + Math.sin(t * 3) * .2;
  pantallaCaja.material.emissiveIntensity = lerp(pantallaCaja.material.emissiveIntensity, .6, dt);
  meseros.concat(cocineros).forEach(function (m) { moverMuneco(m, dt, t); });
  moverMotos(dt);
  if ((tareas += dt) > 4) { tareas = 0; asignarTareas(); }
  controls.update();
  renderer.render(scene, camera);
}
animar();

// =====================================================================
// BLOQUE 15 · Modo demostración (si se abre el archivo fuera de Apps Script)
// =====================================================================
var DEMO = (function () {
  var platos = [['Combo familiar 4 presas','Cocina',18,48000],['Pollo asado entero','Parrilla',25,52000],['Balde de alitas x16','Cocina',20,45000],
                ['Medio pollo asado','Parrilla',20,36000],['Combo 2 presas','Cocina',12,15000],['Alitas x4','Cocina',10,12000],['Papas a la francesa','Cocina',8,8000]];
  var mesas = [], comandas = [], doms = [], recibos = [], n = 0, ventas = 0, cuentasPag = 0, vendidos = {};
  for (var i = 0; i < 12; i++) mesas.push({ id:'M' + (i + 1), numero:String(i + 1), zona:i < 4 ? 'Ventana' : i < 8 ? 'Centro' : 'Terraza', puestos:4, estado:'Libre', cuenta:'', unida:false, total:0, minutos:0, mesero:'' });
  var reps = [{ nombre:'Juan (repartidor)' }, { nombre:'Pedro (repartidor)' }];
  function paso() {
    n++;
    mesas.forEach(function (m) {
      if (m.estado !== 'Libre') m.minutos += 1;
      var r = Math.random();
      var ocupadas = mesas.filter(function (x) { return x.estado !== 'Libre'; }).length;
      if (m.estado === 'Libre' && r < .08 && ocupadas < 8) { m.estado = 'Con pedido'; m.cuenta = 'C9' + n + m.id; m.mesero = ['Laura','Andrés','Camila'][n % 3]; m.minutos = 0; m.total = 0;
        for (var k = 0; k < 2 + Math.floor(Math.random() * 2); k++) { var p = platos[Math.floor(Math.random() * platos.length)]; m.total += p[3];
          comandas.push({ id:'D' + n + m.id + k, cuenta:m.cuenta, mesa:m.numero, plato:'1 x ' + p[0], estacion:p[1], estado:'Pendiente', minutos:0, meta:p[2] }); vendidos[p[0]] = (vendidos[p[0]] || 0) + 1; } }
      else if (m.estado === 'Ocupada' && r < .3) m.estado = 'Por cobrar';
      else if (m.estado === 'Por cobrar' && r < .5) { ventas += m.total; cuentasPag++; recibos.unshift({ cuenta:m.cuenta, numero:String(100 + cuentasPag), total:m.total, pdf:false }); m.estado = 'Libre'; m.cuenta = ''; m.total = 0; }
    });
    recibos.forEach(function (r) { if (!r.pdf && Math.random() < .5) r.pdf = true; }); recibos = recibos.slice(0, 6);
    comandas.forEach(function (c) { c.minutos += 2; if (c.estado === 'Pendiente' && Math.random() < .5) c.estado = 'En preparación'; else if (c.estado === 'En preparación' && Math.random() < .35) c.estado = 'Listo'; else if (c.estado === 'Listo' && Math.random() < .5) c.estado = 'Entregado'; });
    comandas = comandas.filter(function (c) { return c.estado !== 'Entregado'; });
    mesas.forEach(function (m) { if (m.estado === 'Con pedido' && !comandas.some(function (c) { return c.cuenta === m.cuenta && c.estado !== 'Listo'; })) m.estado = 'Ocupada'; });
    if (n % 3 === 1) doms = [{ id:'DO1', cliente:'Juan Gómez (ejemplo)', estado:n % 6 < 3 ? 'En camino' : 'Entregado', repartidor:reps[0].nombre, minutos:18 },
                             { id:'DO2', cliente:'Marta Ríos (ejemplo)', estado:n % 4 < 2 ? 'Listo para recoger' : 'En camino', repartidor:reps[1].nombre, minutos:9 }];
    var top = Object.keys(vendidos).map(function (k) { return { nombre:k, cantidad:vendidos[k] }; }).sort(function (a, b) { return b.cantidad - a.cantidad; }).slice(0, 5);
    var ahora = new Date();
    return { negocio:'Demo', generado:ahora.toTimeString().slice(0, 8), diaReferencia:'', mesas:JSON.parse(JSON.stringify(mesas)), comandas:JSON.parse(JSON.stringify(comandas)),
             domicilios:doms, repartidores:reps, recibos:JSON.parse(JSON.stringify(recibos)),
             kpis:{ ventas:ventas, cuentas:cuentasPag, ticket:cuentasPag ? Math.round(ventas / cuentasPag) : 0, mesasActivas:mesas.filter(function (m) { return m.estado !== 'Libre'; }).length,
                    mesasTotal:mesas.length, tiempoCocina:14, enRuta:doms.filter(function (d) { return d.estado === 'En camino'; }).length, top:top } };
  }
  return { siguiente:paso };
})();

pedirEstado();
setInterval(pedirEstado, (MODO_DEMO ? 4 : REFRESCO) * 1000);
</script>
</body>
</html>
```
