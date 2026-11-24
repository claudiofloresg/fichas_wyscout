/**
 * eliminar.gs — botón "🗑 Eliminar ficha" de la página (Varonil y Femenil).
 * Va en el mismo proyecto de Apps Script que Code.gs; usa sus funciones
 * seccion_(), libro_(), hoja_(), clave_(), limpio_(), publicar_() y json_().
 *
 * Qué hace (en la sección que manda la página: rama = 'varonil' | 'femenil'):
 *  1. Si la ficha está en la lista (primera pestaña), borra su renglón.
 *  2. La anota en la pestaña "Eliminadas" (se crea sola). Así también se quitan las fichas que vienen
 *     de los Excel por posición. Para que una de Excel vuelva a salir: borra su renglón de "Eliminadas".
 *  3. Publica (dispara el workflow de GitHub).
 * Solo toca la temporada que manda la página (d.temporada; vacía = TEMPORADA_ACTUAL de Code.gs).
 * Y doGet(?accion=eliminadas&rama=…) le da a la página la lista de eliminadas (solo jugador, equipo, posición y fecha;
 * sin PIN) para que las oculte AL MOMENTO a todos, sin esperar a GitHub. Eliminar tampoco pide PIN.
 */
const HOJA_ELIMINADAS = 'Eliminadas';
const ENC_ELIMINADAS = ['Jugador', 'Equipo', 'Posición', 'Liga', 'Nombre completo', 'Fecha', 'Temporada'];

function eliminarFicha_(d) {
  const sec = seccion_(d.rama);
  const jugador = limpio_(d.jugador), posicion = limpio_(d.posicion);
  if (!jugador || !posicion) throw new Error('Faltan datos de la ficha.');
  const equipo = limpio_(d.equipo), liga = limpio_(d.liga), nombre = limpio_(d.nombre);
  const fila = d.fila || {};
  const temp = temporada_(limpio_(d.temporada, 10));
  let quitadas = 0;
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    // 1) renglón de la lista (tal cual está en la hoja; si no viene, por nombre + liga + posición)
    const sh = hoja_(sec);
    const claves = new Set();
    if (fila.id) claves.add(claveT_(fila.id, fila.liga, fila.posicion, temp));
    if (liga) {
      claves.add(claveT_(jugador, liga, posicion, temp));
      if (equipo) claves.add(claveT_(jugador + ' (' + equipo + ')', liga, posicion, temp));
    }
    const n = sh.getLastRow() - 1;
    const datos = n > 0 ? sh.getRange(2, 1, n, ENCABEZADOS.length).getDisplayValues() : [];
    for (let i = datos.length - 1; i >= 0; i--) {
      if (claves.has(claveT_(datos[i][0], datos[i][1], datos[i][2], datos[i][9]))) { sh.deleteRow(i + 2); quitadas++; }
    }

    // 2) pestaña "Eliminadas" (siempre al final: la lista debe seguir siendo la primera pestaña)
    const ss = libro_(sec);
    let el = ss.getSheetByName(HOJA_ELIMINADAS);
    if (!el) {
      el = ss.insertSheet(HOJA_ELIMINADAS, ss.getNumSheets());
      el.getRange(1, 1, 1, ENC_ELIMINADAS.length).setValues([ENC_ELIMINADAS]).setFontWeight('bold');
      el.setFrozenRows(1);
    } else if (!el.getRange(1, ENC_ELIMINADAS.length).getValue()) {
      el.getRange(1, ENC_ELIMINADAS.length).setValue('Temporada').setFontWeight('bold');   // pestaña de antes
    }
    const fecha = Utilities.formatDate(new Date(), 'America/Mexico_City', 'dd/MM/yyyy HH:mm');
    const r = el.getRange(el.getLastRow() + 1, 1, 1, ENC_ELIMINADAS.length);
    r.clearDataValidations();
    r.setNumberFormat('@').setValues([[jugador, equipo, posicion, liga, nombre, fecha, temp]]);
  } finally {
    lock.releaseLock();
  }

  // 3) publicar (si GitHub falla, la ficha ya quedó eliminada y sale en la siguiente publicación)
  publicarSilencioso_();
  return { ok: true, quitadas: quitadas };
}

// ============================================================ lectura pública (sin PIN): solo lo eliminado
function doGet(e) {
  const accion = e && e.parameter ? e.parameter.accion : '';
  if (accion === 'eliminadas') return json_({ ok: true, eliminadas: leerEliminadas_(e.parameter.rama) });
  return json_({ ok: true, mensaje: 'Apps Script de lista_fichas funcionando.' });
}

function leerEliminadas_(sec) {
  const el = libro_(sec).getSheetByName(HOJA_ELIMINADAS);
  if (!el || el.getLastRow() < 2) return [];
  return el.getRange(2, 1, el.getLastRow() - 1, ENC_ELIMINADAS.length).getDisplayValues()
    .filter((r) => r[0] && r[2])
    .map((r) => ({ jugador: r[0], equipo: r[1], posicion: r[2], fecha: r[5], temporada: temporada_(r[6]) }));
}
