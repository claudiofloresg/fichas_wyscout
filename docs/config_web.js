/* config_web.js — conexión de la página con la hoja lista_fichas (Apps Script).
   APPS_SCRIPT_URL: la URL que da Apps Script al implementar como "Aplicación web" (termina en /exec).
   Si está vacía, el botón "＋ Nueva ficha" no aparece.
   PIN_AL_ENTRAR: true = la página pide el PIN antes de mostrar cualquier cosa.
                  false = solo lo pide para agregar a la lista o publicar. */
window.CONFIG_WEB = {
  APPS_SCRIPT_URL: '',
  PIN_AL_ENTRAR: false,
};
