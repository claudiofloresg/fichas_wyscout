/**
 * Code.gs — Apps Script de la hoja "lista_fichas" de VARONIL (Extensiones → Apps Script, pegar todo esto).
 * Va junto con eliminar.gs (otro archivo del mismo proyecto).
 *
 * Un solo Apps Script para las dos secciones de la página:
 *   Varonil  → esta hoja (a la que está ligado el script)
 *   Femenil  → la hoja lista_fichas de Femenil (FEMENIL_LISTA_ID)
 * La página manda rama: 'varonil' | 'femenil' en cada solicitud.
 *
 * Hace:
 *  1. "＋ Nueva ficha": agregar / quitar / ver la lista, publicar, actualizar datos y ver el estado. Pide PIN.
 *  2. Foto, mapa y video permanentes (guardarImagen / guardarVideo): SIN PIN, en segundo plano.
 *     La imagen se guarda en data_fichas/fotos o data_fichas/mapas de la sección (la carpeta donde está su
 *     lista_fichas), con el nombre Wyscout del jugador, y reemplaza la anterior (va a la papelera de Drive).
 *     El video se guarda en la pestaña "Nombres y video" de la lista de la sección. Después se publica solo.
 *  3. Menú "Fichas" dentro de esta hoja: Publicar fichas, Actualizar datos y Ver estado.
 *  4. Temporadas (columna J "Temporada"): cada ficha es de una temporada (26-27, 25-26, 24-25…). La página manda
 *     la temporada en la que estás y solo ve/agrega/quita las de esa temporada. Vacía = TEMPORADA_ACTUAL.
 *
 * Propiedades del script (⚙ Configuración del proyecto → Propiedades del script):
 *   PIN           el PIN que se escribe en la página
 *   GITHUB_TOKEN  token fine-grained de GitHub (solo este repo, permiso Actions: Read and write)
 *
 * La primera vez después de pegar esto: elige la función "autorizar" arriba y presiona ▶ Ejecutar,
 * y acepta los permisos (Drive y la hoja de Femenil). Luego: Implementar → Administrar implementaciones →
 * ✏️ → Versión: Nueva versión → Implementar.
 */
const REPO = 'claudiofloresg/fichas_wyscout';
const WORKFLOW = 'actualizar.yml';
const RAMA = 'main';                       // rama de git (no confundir con la sección Varonil/Femenil)
const PAGINA = 'https://claudiofloresg.github.io/fichas_wyscout/';
const FEMENIL_LISTA_ID = '1PqO-IILu8th4w9lDFOJd-2fB_g7YxGbK3TOZKKB1xzE';
const TEMPORADA_ACTUAL = '26-27';          // la de docs/ (la que sale al abrir la página)
// H, I y J van al final para no mover las columnas que ya existen
const ENCABEZADOS = ['ID', 'Liga', 'Posición', 'Nombre completo', 'Comparar con 1', 'Comparar con 2', 'Fecha',
  'Liga comparar 1', 'Liga comparar 2', 'Temporada'];
const HOJA_NOMBRES = 'Nombres y video';
const ENC_NOMBRES = ['NOMBRE EXCEL', 'NOMBRE COMPLETO', 'VIDEO'];
const MAX_FALLOS = 8;            // PIN incorrecto: después de 8 intentos se bloquea 15 minutos
const MAX_IMAGEN = 8000000;      // base64 (~6 MB de imagen)

// ============================================================ página → hoja
function doPost(e) {
  let req;
  try { req = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'Solicitud inválida' }); }

  // Foto, mapa, video y eliminar ficha: sin PIN (en segundo plano desde la página)
  try {
    if (req.accion === 'guardarImagen') return json_(guardarImagen_(req));
    if (req.accion === 'guardarVideo') return json_(guardarVideo_(req));
    if (req.accion === 'eliminar') return json_(eliminarFicha_(req));
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  }

  const props = PropertiesService.getScriptProperties();
  const cache = CacheService.getScriptCache();
  const fallos = Number(cache.get('fallos') || 0);
  if (fallos >= MAX_FALLOS) return json_({ ok: false, error: 'Demasiados intentos con PIN incorrecto. Espera 15 minutos.' });
  const pinOk = props.getProperty('PIN');
  if (!pinOk) return json_({ ok: false, error: 'Falta configurar el PIN en las propiedades del script.' });
  if (String(req.pin || '') !== String(pinOk)) {
    cache.put('fallos', String(fallos + 1), 900);
    return json_({ ok: false, pin: false, error: 'PIN incorrecto' });
  }

  try {
    const sec = seccion_(req.rama);
    switch (req.accion) {
      case 'verificar': return json_({ ok: true });
      case 'lista': return json_({ ok: true, filas: leerFilas_(sec), pendiente: pendiente_(sec) });
      case 'agregar': return json_(agregar_(req));
      case 'quitar': return json_(quitar_(req));
      case 'publicar':
        if (!leerFilas_(sec).length) throw new Error('La lista está vacía: no hay nada que publicar.');
        publicar_(); return json_({ ok: true });
      // "Actualizar datos": vuelve a bajar la base de datos y todo lo de Drive aunque la lista no cambie
      case 'actualizar': publicar_(); return json_({ ok: true });
      case 'estado': return json_({ ok: true, run: estado_() });
      default: return json_({ ok: false, error: 'Acción desconocida' });
    }
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  }
}

// ============================================================ secciones (Varonil / Femenil)
function seccion_(v) { return v === 'femenil' ? 'femenil' : 'varonil'; }

/** Libro de la sección: Varonil = esta hoja; Femenil = la de FEMENIL_LISTA_ID. */
function libro_(v) {
  return seccion_(v) === 'femenil' ? SpreadsheetApp.openById(FEMENIL_LISTA_ID) : SpreadsheetApp.getActiveSpreadsheet();
}

/** Primera pestaña del libro de la sección = la lista de fichas. */
function hoja_(v) {
  const sh = libro_(v).getSheets()[0];
  if (sh.getLastRow() === 0) sh.appendRow(ENCABEZADOS);
  const enc = sh.getRange(1, 1, 1, ENCABEZADOS.length).getValues()[0];
  if (enc.some((x) => !x)) sh.getRange(1, 1, 1, ENCABEZADOS.length).setValues([ENCABEZADOS]).setFontWeight('bold');
  return sh;
}

function limpio_(v, max) {
  // sin fórmulas (=, +, -, @ al inicio) y largo máximo
  return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().replace(/^[=+\-@]+/, '').slice(0, max || 120);
}

/** '25-26', '2025-26', '25/26' -> '25-26'. Vacía -> TEMPORADA_ACTUAL. */
function temporada_(v) {
  const s = String(v == null ? '' : v).replace(/\s+/g, '').replace(/[\/–]/g, '-');
  const m = s.match(/^(?:20)?(\d{2})-(?:20)?(\d{2})$/);
  return m ? m[1] + '-' + m[2] : (s || TEMPORADA_ACTUAL);
}

/** Clave de un renglón: ID + liga + posición + temporada (el mismo jugador puede estar en dos temporadas). */
function claveT_(id, liga, pos, temp) { return clave_(id, liga, pos) + '|' + temporada_(temp); }

function clave_(id, liga, pos) {
  const n = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  return [n(id), n(liga), n(pos)].join('|');
}

function leerFilas_(v) {
  const sh = hoja_(v);
  if (sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, ENCABEZADOS.length).getDisplayValues()
    .filter((r) => r[0])
    .map((r) => ({ id: r[0], liga: r[1], posicion: r[2], nombre: r[3], comp1: r[4], comp2: r[5], fecha: r[6],
      ligac1: r[7], ligac2: r[8], temporada: temporada_(r[9]) }));
}

function agregar_(d) {
  const sec = seccion_(d.rama);
  const f = {
    id: limpio_(d.id), liga: limpio_(d.liga), posicion: limpio_(d.posicion), nombre: limpio_(d.nombre),
    comp1: limpio_(d.comp1), comp2: limpio_(d.comp2), ligac1: limpio_(d.ligac1), ligac2: limpio_(d.comp2 ? d.ligac2 : ''),
    temporada: temporada_(limpio_(d.temporada, 10)),
  };
  if (!f.id || !f.liga || !f.posicion || !f.nombre || !f.comp1) throw new Error('Faltan campos obligatorios.');
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sh = hoja_(sec);
    const fila = [f.id, f.liga, f.posicion, f.nombre, f.comp1, f.comp2,
      Utilities.formatDate(new Date(), 'America/Mexico_City', 'dd/MM/yyyy HH:mm'), f.ligac1, f.ligac2, f.temporada];
    const k = claveT_(f.id, f.liga, f.posicion, f.temporada);
    const datos = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, ENCABEZADOS.length).getDisplayValues() : [];
    const claves = datos.map((r) => claveT_(r[0], r[1], r[2], r[9]));
    // Editar: se reemplaza el renglón ORIGINAL aunque se corrija el ID, la liga o la posición
    const o = d.original || null;
    let i = o ? claves.indexOf(claveT_(o.id, o.liga, o.posicion, o.temporada || f.temporada)) : -1;
    if (i < 0) i = claves.indexOf(k);
    const rango = i >= 0 ? sh.getRange(i + 2, 1, 1, fila.length) : sh.getRange(sh.getLastRow() + 1, 1, 1, fila.length);
    rango.clearDataValidations();
    rango.setNumberFormat('@').setValues([fila]);
    // si ya había otro renglón con el ID corregido, se borra (no quedan repetidos)
    for (let j = claves.length - 1; j >= 0; j--) {
      if (j !== i && claves[j] === k) sh.deleteRow(j + 2);
    }
    marcarPendiente_(true, sec);
    return { ok: true, nuevo: i < 0, filas: leerFilas_(sec) };
  } finally {
    lock.releaseLock();
  }
}

function quitar_(d) {
  const sec = seccion_(d.rama);
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sh = hoja_(sec);
    const k = claveT_(d.id, d.liga, d.posicion, d.temporada);
    const datos = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, ENCABEZADOS.length).getDisplayValues() : [];
    for (let i = datos.length - 1; i >= 0; i--) {
      if (claveT_(datos[i][0], datos[i][1], datos[i][2], datos[i][9]) === k) sh.deleteRow(i + 2);
    }
    marcarPendiente_(true, sec);
    return { ok: true, filas: leerFilas_(sec) };
  } finally {
    lock.releaseLock();
  }
}

// ============================================================ foto, mapa y video permanentes (sin PIN)
/** Carpeta data_fichas/<sub> de la sección (la carpeta donde está su lista_fichas). Se crea si falta. */
function carpetaSeccion_(v, sub) {
  const padres = DriveApp.getFileById(libro_(v).getId()).getParents();
  if (!padres.hasNext()) throw new Error('No encuentro la carpeta data_fichas de la sección.');
  const dataFichas = padres.next();
  const it = dataFichas.getFoldersByName(sub);
  return it.hasNext() ? it.next() : dataFichas.createFolder(sub);
}

function nombreArchivo_(s) {
  return limpio_(s, 80).replace(/[\\/:*?"<>|#%]/g, '').trim();
}

function guardarImagen_(d) {
  const sub = d.tipo === 'foto' ? 'fotos' : d.tipo === 'mapa' ? 'mapas' : null;
  if (!sub) throw new Error('Tipo inválido.');
  const jugador = nombreArchivo_(d.jugador);
  if (!jugador) throw new Error('Falta el jugador.');
  const b64 = String(d.imagen || '');
  if (!b64 || b64.length > MAX_IMAGEN) throw new Error('Imagen vacía o demasiado grande.');
  const bytes = Utilities.base64Decode(b64);
  if (bytes.length < 4 || (bytes[0] & 0xff) !== 0xff || (bytes[1] & 0xff) !== 0xd8) throw new Error('La imagen debe ser JPEG.');
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const carpeta = carpetaSeccion_(d.rama, sub);
    // la anterior de ese jugador (cualquier extensión) va a la papelera de Drive
    const k = clave_(jugador, '', '');
    const it = carpeta.getFiles();
    while (it.hasNext()) {
      const f = it.next();
      if (clave_(f.getName().replace(/\.[^.]+$/, ''), '', '') === k) f.setTrashed(true);
    }
    carpeta.createFile(Utilities.newBlob(bytes, 'image/jpeg', jugador + '.jpg'));
  } finally {
    lock.releaseLock();
  }
  publicarSilencioso_();
  return { ok: true };
}

function guardarVideo_(d) {
  const jugador = limpio_(d.jugador);
  const video = limpio_(d.video, 500);
  if (!jugador) throw new Error('Falta el jugador.');
  if (!/^https?:\/\/\S+\.\S+$/i.test(video)) throw new Error('El link del video no es válido.');
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const ss = libro_(d.rama);
    let sh = ss.getSheetByName(HOJA_NOMBRES);
    if (!sh) {                                      // siempre al final: la lista sigue siendo la primera pestaña
      sh = ss.insertSheet(HOJA_NOMBRES, ss.getNumSheets());
      sh.getRange(1, 1, 1, ENC_NOMBRES.length).setValues([ENC_NOMBRES]).setFontWeight('bold');
      sh.setFrozenRows(1);
    }
    const n = sh.getLastRow() - 1;
    const datos = n > 0 ? sh.getRange(2, 1, n, 1).getValues() : [];
    const k = clave_(jugador, '', '');
    let fila = -1;
    for (let i = 0; i < datos.length; i++) {
      if (clave_(datos[i][0], '', '') === k) { fila = i + 2; break; }
    }
    if (fila > 0) {
      sh.getRange(fila, 3).clearDataValidations().setNumberFormat('@').setValue(video);
    } else {
      sh.getRange(sh.getLastRow() + 1, 1, 1, 3).clearDataValidations().setNumberFormat('@').setValues([[jugador, '', video]]);
    }
  } finally {
    lock.releaseLock();
  }
  publicarSilencioso_();
  return { ok: true };
}

// ============================================================ GitHub
function github_(metodo, ruta, cuerpo) {
  const token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  if (!token) throw new Error('Falta GITHUB_TOKEN en las propiedades del script.');
  const r = UrlFetchApp.fetch('https://api.github.com/repos/' + REPO + ruta, {
    method: metodo,
    contentType: 'application/json',
    payload: cuerpo ? JSON.stringify(cuerpo) : undefined,
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    muteHttpExceptions: true,
  });
  const c = r.getResponseCode();
  if (c === 401) throw new Error('GitHub rechazó el token (¿venció?). Genera otro y cámbialo en GITHUB_TOKEN.');
  if (c === 403 || c === 404) throw new Error('El token no tiene permiso de Actions en ' + REPO + ' (código ' + c + ').');
  if (c >= 300) throw new Error('GitHub respondió ' + c + ': ' + r.getContentText().slice(0, 200));
  return c === 204 ? null : JSON.parse(r.getContentText());
}

/** Publica todo (las tres secciones se generan en la misma corrida). */
function publicar_() {
  github_('post', '/actions/workflows/' + WORKFLOW + '/dispatches', { ref: RAMA });
  marcarPendiente_(false, 'varonil');
  marcarPendiente_(false, 'femenil');
}

/** Igual, pero si GitHub falla no se pierde lo guardado (sale en la siguiente publicación). */
function publicarSilencioso_() {
  try { publicar_(); } catch (err) { console.error('No se pudo publicar: ' + err); }
}

// "Hay cambios sin publicar": se prende al agregar/quitar (o editar la hoja a mano) y se apaga al publicar
function marcarPendiente_(v, sec) {
  PropertiesService.getScriptProperties().setProperty(seccion_(sec) === 'femenil' ? 'PENDIENTE_femenil' : 'PENDIENTE', v ? '1' : '0');
}
function pendiente_(sec) {
  return PropertiesService.getScriptProperties().getProperty(seccion_(sec) === 'femenil' ? 'PENDIENTE_femenil' : 'PENDIENTE') === '1';
}
function onEdit() { marcarPendiente_(true, 'varonil'); }   // solo avisa de la hoja de Varonil (la de este script)

function estado_() {
  const r = github_('get', '/actions/workflows/' + WORKFLOW + '/runs?per_page=1');
  const run = (r.workflow_runs || [])[0];
  if (!run) return null;
  return { status: run.status, conclusion: run.conclusion, creado: run.created_at, url: run.html_url };
}

// ============================================================ menú en la hoja
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Fichas')
    .addItem('Publicar fichas', 'menuPublicar')
    .addItem('Actualizar datos (base de datos y Drive)', 'menuActualizar')
    .addItem('Ver estado de la publicación', 'menuEstado')
    .addToUi();
}

function menuPublicar() {
  const ui = SpreadsheetApp.getUi();
  if (ui.alert('Publicar fichas', 'Se publican Varonil, Femenil y Pumas. Tarda de 2 a 5 minutos.', ui.ButtonSet.OK_CANCEL) !== ui.Button.OK) return;
  publicar_();
  ui.alert('Listo', 'Se mandó a publicar. En unos minutos se ve en ' + PAGINA, ui.ButtonSet.OK);
}

function menuActualizar() {
  const ui = SpreadsheetApp.getUi();
  if (ui.alert('Actualizar datos', 'Se vuelve a bajar la base de datos y todo lo de Drive, y se rehacen las fichas. Tarda de 3 a 6 minutos.',
    ui.ButtonSet.OK_CANCEL) !== ui.Button.OK) return;
  publicar_();
  ui.alert('Listo', 'Se mandó a actualizar. En unos minutos se ve en ' + PAGINA, ui.ButtonSet.OK);
}

function menuEstado() {
  const r = estado_();
  const t = !r ? 'Todavía no hay publicaciones.'
    : r.status !== 'completed' ? 'En proceso (' + r.status + ').'
      : r.conclusion === 'success' ? 'La última publicación terminó bien.' : 'La última publicación falló: ' + r.url;
  SpreadsheetApp.getUi().alert('Estado', t, SpreadsheetApp.getUi().ButtonSet.OK);
}

/** Ejecútala UNA vez desde el editor (▶ Ejecutar) para dar los permisos de Drive y de la hoja de Femenil. */
function autorizar() {
  const fem = SpreadsheetApp.openById(FEMENIL_LISTA_ID).getName();
  const v = carpetaSeccion_('varonil', 'fotos').getName();
  const f = carpetaSeccion_('femenil', 'fotos').getName();
  console.log('Listo. Femenil: ' + fem + ' · carpetas: ' + v + ' / ' + f);
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
