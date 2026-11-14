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
