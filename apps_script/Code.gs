/**
 * Code.gs — Apps Script de la hoja "lista_fichas" (Extensiones → Apps Script, pegar todo esto).
 *
 * Hace dos cosas:
 *  1. Recibe lo que manda la página (botón "＋ Nueva ficha"): agregar / quitar / ver la lista,
 *     publicar (dispara el workflow de GitHub) y ver el estado de la publicación. Todo pide PIN.
 *  2. Menú "Fichas" dentro de la hoja: Publicar fichas, Ver estado y Actualizar listas desplegables.
 *
 * Propiedades del script (⚙ Configuración del proyecto → Propiedades del script):
 *   PIN           el PIN que se escribe en la página
 *   GITHUB_TOKEN  token fine-grained de GitHub (solo este repo, permiso Actions: Read and write)
 */
const REPO = 'claudiofloresg/fichas_wyscout';
const WORKFLOW = 'actualizar.yml';
const RAMA = 'main';
const PAGINA = 'https://claudiofloresg.github.io/fichas_wyscout/';
const ENCABEZADOS = ['ID', 'Liga', 'Posición', 'Nombre completo', 'Comparar con 1', 'Comparar con 2', 'Agregado por', 'Fecha'];
const MAX_FALLOS = 8;            // PIN incorrecto: después de 8 intentos se bloquea 15 minutos

// ============================================================ página → hoja
function doPost(e) {
  let req;
  try { req = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'Solicitud inválida' }); }

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
    switch (req.accion) {
      case 'verificar': return json_({ ok: true });
      case 'lista': return json_({ ok: true, filas: leerFilas_() });
      case 'agregar': return json_(agregar_(req));
      case 'quitar': return json_(quitar_(req));
      case 'publicar': publicar_(); return json_({ ok: true });
      case 'estado': return json_({ ok: true, run: estado_() });
      default: return json_({ ok: false, error: 'Acción desconocida' });
    }
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  }
}

function doGet() {
  return json_({ ok: true, mensaje: 'Apps Script de lista_fichas funcionando.' });
}

// ============================================================ hoja
function hoja_() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  if (sh.getLastRow() === 0) sh.appendRow(ENCABEZADOS);
  return sh;
}

function limpio_(v, max) {
  // sin fórmulas (=, +, -, @ al inicio) y largo máximo
  return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().replace(/^[=+\-@]+/, '').slice(0, max || 120);
}

function clave_(id, liga, pos) {
  const n = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  return [n(id), n(liga), n(pos)].join('|');
}

function leerFilas_() {
  const sh = hoja_();
  if (sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, ENCABEZADOS.length).getDisplayValues()
    .filter((r) => r[0])
    .map((r) => ({ id: r[0], liga: r[1], posicion: r[2], nombre: r[3], comp1: r[4], comp2: r[5], quien: r[6], fecha: r[7] }));
}

function agregar_(d) {
  const f = {
    id: limpio_(d.id), liga: limpio_(d.liga), posicion: limpio_(d.posicion), nombre: limpio_(d.nombre),
    comp1: limpio_(d.comp1), comp2: limpio_(d.comp2), quien: limpio_(d.quien, 40),
  };
  if (!f.id || !f.liga || !f.posicion || !f.nombre || !f.comp1) throw new Error('Faltan campos obligatorios.');
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sh = hoja_();
    const fila = [f.id, f.liga, f.posicion, f.nombre, f.comp1, f.comp2, f.quien,
      Utilities.formatDate(new Date(), 'America/Mexico_City', 'dd/MM/yyyy HH:mm')];
    const k = clave_(f.id, f.liga, f.posicion);
    const datos = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 3).getValues() : [];
    const i = datos.findIndex((r) => clave_(r[0], r[1], r[2]) === k);
    const rango = i >= 0 ? sh.getRange(i + 2, 1, 1, fila.length) : sh.getRange(sh.getLastRow() + 1, 1, 1, fila.length);
    rango.setNumberFormat('@').setValues([fila]);
    return { ok: true, nuevo: i < 0, filas: leerFilas_() };
  } finally {
    lock.releaseLock();
  }
}

function quitar_(d) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sh = hoja_();
    const k = clave_(d.id, d.liga, d.posicion);
    const datos = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 3).getValues() : [];
    for (let i = datos.length - 1; i >= 0; i--) {
      if (clave_(datos[i][0], datos[i][1], datos[i][2]) === k) sh.deleteRow(i + 2);
    }
    return { ok: true, filas: leerFilas_() };
  } finally {
    lock.releaseLock();
  }
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

function publicar_() {
  github_('post', '/actions/workflows/' + WORKFLOW + '/dispatches', { ref: RAMA });
}

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
    .addItem('Ver estado de la publicación', 'menuEstado')
    .addSeparator()
    .addItem('Actualizar listas desplegables', 'menuDesplegables')
    .addToUi();
}

function menuPublicar() {
  const ui = SpreadsheetApp.getUi();
  if (ui.alert('Publicar fichas', 'Se publican todas las fichas de esta hoja. Tarda de 2 a 5 minutos.', ui.ButtonSet.OK_CANCEL) !== ui.Button.OK) return;
  publicar_();
  ui.alert('Listo', 'Se mandó a publicar. En unos minutos se ve en ' + PAGINA, ui.ButtonSet.OK);
}

function menuEstado() {
  const r = estado_();
  const t = !r ? 'Todavía no hay publicaciones.'
    : r.status !== 'completed' ? 'En proceso (' + r.status + ').'
      : r.conclusion === 'success' ? 'La última publicación terminó bien.' : 'La última publicación falló: ' + r.url;
  SpreadsheetApp.getUi().alert('Estado', t, SpreadsheetApp.getUi().ButtonSet.OK);
}

/** Pone listas desplegables (Liga, Posición, Comparar con) leyendo las opciones de la página. */
function menuDesplegables() {
  const txt = UrlFetchApp.fetch(PAGINA + 'data/opciones.js?ts=' + Date.now()).getContentText();
  const op = JSON.parse(txt.replace(/^window\.OPCIONES\s*=\s*/, '').replace(/;\s*$/, ''));
  const sh = hoja_();
  const n = Math.max(sh.getMaxRows() - 1, 1);
  const lista = (vals) => SpreadsheetApp.newDataValidation().requireValueInList(vals, true).setAllowInvalid(false).build();
  sh.getRange(2, 2, n).setDataValidation(lista(op.ligas));
  sh.getRange(2, 3, n).setDataValidation(lista(op.posiciones));
  const pumas = op.pumas.map((p) => p[0]);
  if (pumas.length) {
    sh.getRange(2, 5, n).setDataValidation(lista(pumas));
    sh.getRange(2, 6, n).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(pumas, true).setAllowInvalid(true).build());
  }
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, ENCABEZADOS.length).setValues([ENCABEZADOS]).setFontWeight('bold');
  SpreadsheetApp.getUi().alert('Listo', 'Listas actualizadas (' + op.ligas.length + ' ligas, ' + pumas.length + ' jugadores de Pumas).', SpreadsheetApp.getUi().ButtonSet.OK);
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
