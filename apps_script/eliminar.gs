/**
 * eliminar.gs — botón "🗑 Eliminar ficha" de la página.
 * Va como ARCHIVO NUEVO en el mismo proyecto de Apps Script (junto a Code.gs); usa sus funciones
 * hoja_(), clave_(), limpio_(), github_(), marcarPendiente_() y las constantes WORKFLOW y RAMA.
 *
 * En Code.gs:
 *   a) dentro de doPost → switch (req.accion), agrega esta línea:
 *        case 'eliminar': return json_(eliminarFicha_(req));
 *   b) BORRA la función doGet() de Code.gs (la de aquí abajo la reemplaza).
 *
 * Qué hace:
 *  1. Si la ficha está en la lista (primera pestaña), borra su renglón.
 *  2. La anota en la pestaña "Eliminadas" (se crea sola). Así también se quitan las fichas que vienen
 *     de los Excel por posición. Para que una de Excel vuelva a salir: borra su renglón de "Eliminadas".
 *  3. Publica (dispara el workflow de GitHub).
 * Y doGet(?accion=eliminadas) le da a la página la lista de eliminadas (solo jugador, equipo, posición y fecha;
 * sin PIN) para que las oculte AL MOMENTO a todos, sin esperar a GitHub. Eliminar sí pide PIN.
 */
const HOJA_ELIMINADAS = 'Eliminadas';
const ENC_ELIMINADAS = ['Jugador', 'Equipo', 'Posición', 'Liga', 'Nombre completo', 'Fecha'];

function eliminarFicha_(d) {
  const jugador = limpio_(d.jugador), posicion = limpio_(d.posicion);
  if (!jugador || !posicion) throw new Error('Faltan datos de la ficha.');
  const equipo = limpio_(d.equipo), liga = limpio_(d.liga), nombre = limpio_(d.nombre);
  const fila = d.fila || {};
  let quitadas = 0;
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    // 1) renglón de la lista (tal cual está en la hoja; si no viene, por nombre + liga + posición)
    const sh = hoja_();
    const claves = new Set();
    if (fila.id) claves.add(clave_(fila.id, fila.liga, fila.posicion));
    if (liga) {
      claves.add(clave_(jugador, liga, posicion));
      if (equipo) claves.add(clave_(jugador + ' (' + equipo + ')', liga, posicion));
    }
    const n = sh.getLastRow() - 1;
    const datos = n > 0 ? sh.getRange(2, 1, n, 3).getValues() : [];
    for (let i = datos.length - 1; i >= 0; i--) {
      if (claves.has(clave_(datos[i][0], datos[i][1], datos[i][2]))) { sh.deleteRow(i + 2); quitadas++; }
    }

    // 2) pestaña "Eliminadas" (siempre al final: la lista debe seguir siendo la primera pestaña)
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let el = ss.getSheetByName(HOJA_ELIMINADAS);
    if (!el) {
      el = ss.insertSheet(HOJA_ELIMINADAS, ss.getNumSheets());
      el.getRange(1, 1, 1, ENC_ELIMINADAS.length).setValues([ENC_ELIMINADAS]).setFontWeight('bold');
      el.setFrozenRows(1);
    }
    const fecha = Utilities.formatDate(new Date(), 'America/Mexico_City', 'dd/MM/yyyy HH:mm');
    const r = el.getRange(el.getLastRow() + 1, 1, 1, ENC_ELIMINADAS.length);
    r.clearDataValidations();
    r.setNumberFormat('@').setValues([[jugador, equipo, posicion, liga, nombre, fecha]]);
  } finally {
    lock.releaseLock();
  }

  // 3) publicar
  github_('post', '/actions/workflows/' + WORKFLOW + '/dispatches', { ref: RAMA });
  marcarPendiente_(false);
  return { ok: true, quitadas: quitadas };
}

// ============================================================ lectura pública (sin PIN): solo lo eliminado
function doGet(e) {
  const accion = e && e.parameter ? e.parameter.accion : '';
  if (accion === 'eliminadas') return json_({ ok: true, eliminadas: leerEliminadas_() });
  return json_({ ok: true, mensaje: 'Apps Script de lista_fichas funcionando.' });
}

function leerEliminadas_() {
  const el = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_ELIMINADAS);
  if (!el || el.getLastRow() < 2) return [];
  return el.getRange(2, 1, el.getLastRow() - 1, ENC_ELIMINADAS.length).getDisplayValues()
    .filter((r) => r[0] && r[2])
    .map((r) => ({ jugador: r[0], equipo: r[1], posicion: r[2], fecha: r[5] }));
}
