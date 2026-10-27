/* nueva.js — "＋ Nueva ficha": agrega jugadores a la hoja lista_fichas y publica (vía Apps Script).
   La URL del Apps Script y si se pide PIN al entrar están en config_web.js. */
(() => {
  const CFG = window.CONFIG_WEB || {};
  const URL_API = (CFG.APPS_SCRIPT_URL || '').trim();
  if (!URL_API) return;                               // sin Apps Script configurado: no hay botón

  const $ = (id) => document.getElementById(id);
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const el = (tag, attrs = {}, txt) => {
    const e = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v));
    if (txt != null) e.textContent = txt;
    return e;
  };
  const guardar = (k, v) => { try { v == null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch (e) { /* sin storage */ } };
  const leer = (k) => { try { return sessionStorage.getItem(k); } catch (e) { return null; } };

  let pin = leer('pinFichas');

  // ------------------------------------------------------------------ API
  async function api(accion, datos = {}, intentos = 3) {
    let r;
    for (let k = 1; ; k++) {
      try {
        r = await fetch(URL_API, { method: 'POST', body: JSON.stringify({ accion, pin, ...datos }) });
        if (r.ok) break;
        if (k >= intentos) throw new Error(`El servidor respondió ${r.status}`);
      } catch (e) {                      // "Failed to fetch": Google tardó o se cortó la conexión -> reintenta
        if (k >= intentos) throw new Error('No hubo respuesta del servidor (revisa tu internet e intenta de nuevo).');
      }
      await new Promise((ok) => setTimeout(ok, 1500 * k));
    }
    let j;
    try { j = await r.json(); } catch (e) { throw new Error('Respuesta inválida del servidor. Intenta de nuevo.'); }
    if (j.pin === false) { pin = null; guardar('pinFichas', null); }
    if (!j.ok) throw new Error(j.error || 'Error desconocido');
    return j;
  }

  // ------------------------------------------------------------------ PIN
  const dlgPin = $('dlgPin'), txtPin = $('txtPin'), msgPin = $('msgPin');
  function pedirPin(bloqueante = false) {
    return new Promise((resolve) => {
      txtPin.value = ''; msgPin.textContent = '';
      $('btnPinCancelar').style.display = bloqueante ? 'none' : '';
      dlgPin.showModal();
      setTimeout(() => txtPin.focus(), 50);
      const enviar = async (ev) => {
        ev.preventDefault();
        const v = txtPin.value.trim();
        if (!v) return;
        msgPin.textContent = 'Verificando…';
        pin = v;
        try {
          await api('verificar');
          guardar('pinFichas', pin);
          dlgPin.close(); limpiar(); resolve(true);
        } catch (e) { msgPin.textContent = e.message; txtPin.select(); }
      };
      const cancelar = (ev) => { if (bloqueante) { ev.preventDefault(); return; } limpiar(); dlgPin.close(); resolve(false); };
      const limpiar = () => {
        $('frmPin').removeEventListener('submit', enviar);
        $('btnPinCancelar').removeEventListener('click', cancelar);
        dlgPin.removeEventListener('cancel', cancelar);
      };
      $('frmPin').addEventListener('submit', enviar);
      $('btnPinCancelar').addEventListener('click', cancelar);
      dlgPin.addEventListener('cancel', cancelar);
    });
  }
  async function conPin() { return pin ? true : pedirPin(); }

  if (CFG.PIN_AL_ENTRAR && !pin) {
    document.body.classList.add('bloqueada');
    pedirPin(true).then(() => document.body.classList.remove('bloqueada'));
  }

  // ------------------------------------------------------------------ botón en el encabezado
  const btnNueva = el('button', { id: 'btnNueva', type: 'button', class: 'hdr' }, '＋ Nueva ficha');
  const meta = $('meta');
  meta.parentNode.insertBefore(btnNueva, meta);

  // ------------------------------------------------------------------ opciones (ligas, IDs, Pumas)
  let OP = null;
  function cargarOpciones() {
    if (window.OPCIONES) { OP = window.OPCIONES; return Promise.resolve(OP); }
    return new Promise((resolve, reject) => {
      const s = el('script', { src: `data/opciones.js?v=${Date.now()}` });
      s.onload = () => { OP = window.OPCIONES; OP ? resolve(OP) : reject(new Error('opciones vacías')); };
      s.onerror = () => reject(new Error('No hay data/opciones.js. Falta publicar una vez con la base de datos.'));
      document.head.appendChild(s);
    });
  }

  const dlg = $('dlgNueva'), frm = $('frmNueva'), msg = $('msgNueva');
  const selLiga = $('nLiga'), txtId = $('nId'), dl = $('nIds'), selPosN = $('nPos'), txtNom = $('nNombre');
  const txtC1 = $('nComp1'), txtC2 = $('nComp2'), selLC1 = $('nLigaC1'), selLC2 = $('nLigaC2');
  const idsComp = { 1: new Set(), 2: new Set() };
  const tbody = $('tblLista'), cuenta = $('nCuenta'), btnPub = $('btnPublicar'), estado = $('nEstado');
  let idsLiga = new Set(), filas = [], pendiente = false, editando = null;
  const btnAgregar = frm.querySelector('button[type=submit]');
  const btnCancelarEd = el('button', { type: 'button', style: 'display:none' }, 'Cancelar edición');
  btnAgregar.parentNode.insertBefore(btnCancelarEd, btnAgregar);
  // problemas de cada renglón en la última publicación (ID que no está en la liga, etc.)
  const AVISOS = (window.FICHAS || {}).avisosLista || {};
  const clave = (id, liga, pos) => [id, liga, pos].map((t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x00-\x7f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()).join('|');

  const opt = (v, t) => el('option', { value: v }, t ?? v);

  function llenarSelects() {
    selLiga.replaceChildren(opt('', '— elige —'), ...OP.ligas.filter((l) => l !== OP.ligaRef).map((l) => opt(l)),
      ...(OP.ligaRef ? [opt(OP.ligaRef)] : []));
    selPosN.replaceChildren(opt('', '— elige —'), ...OP.posiciones.map((p) => opt(p)));
    [selLC1, selLC2].forEach((sel) => {
      sel.replaceChildren(...(OP.ligaRef ? [opt(OP.ligaRef)] : []), ...OP.ligas.filter((l) => l !== OP.ligaRef).map((l) => opt(l)));
      sel.value = OP.ligaRef || OP.ligas[0];
    });
    llenarComp(1); llenarComp(2);
  }

  // "Comparar con": cualquier jugador de la liga elegida. En la liga de referencia salen primero los de Pumas.
  function llenarComp(i) {
    const liga = (i === 1 ? selLC1 : selLC2).value;
    const js = OP.jugadores[liga] || [];
    const veces = {};
    js.forEach(([n]) => { veces[n] = (veces[n] || 0) + 1; });
    const valor = ([n, e]) => (veces[n] > 1 ? `${n} (${e})` : n);
    let lista = js;
    if (liga === OP.ligaRef && OP.pumas.length) {
      const esPumas = new Set(OP.pumas.map(([n]) => n));
      lista = [...js.filter(([n]) => esPumas.has(n)), ...js.filter(([n]) => !esPumas.has(n))];
    }
    const pos = Object.fromEntries(OP.pumas.map(([n, p]) => [n, p]));
    idsComp[i] = new Set(lista.map(valor));
    $(i === 1 ? 'nIdsC1' : 'nIdsC2').replaceChildren(...lista.map((j) => opt(valor(j),
      liga === OP.ligaRef && pos[j[0]] !== undefined ? `${j[1]} · ${pos[j[0]] || ''}` : j[1])));
  }
  selLC1.addEventListener('change', () => { txtC1.value = ''; llenarComp(1); });
  selLC2.addEventListener('change', () => { txtC2.value = ''; llenarComp(2); });
  const textoComp = (c, l) => (c ? c + (l && l !== OP.ligaRef ? ` (${l})` : '') : '');

  function llenarIds() {
    const js = (OP.jugadores[selLiga.value] || []);
    const veces = {};
    js.forEach(([n]) => { veces[n] = (veces[n] || 0) + 1; });
    idsLiga = new Set();
    dl.replaceChildren(...js.map(([n, e]) => {
      const v = veces[n] > 1 ? `${n} (${e})` : n;       // homónimos en la misma liga: se agrega el equipo
      idsLiga.add(v);
      return opt(v, e);
    }));
    txtId.placeholder = js.length ? `Escribe para buscar (${js.length} jugadores)` : 'Primero elige la liga';
  }

  // ------------------------------------------------------------------ lista actual
  function pintarFilas() {
    tbody.replaceChildren();
    filas.forEach((f) => {
      const tr = el('tr');
      const av = AVISOS[clave(f.id, f.liga, f.posicion)];
      if (av) { tr.className = 'conaviso'; tr.title = av.join('\n'); }
      if (editando && clave(editando.id, editando.liga, editando.posicion) === clave(f.id, f.liga, f.posicion)) tr.classList.add('editando');
      [(av ? '⚠ ' : '') + f.id, f.liga, f.posicion, [textoComp(f.comp1, f.ligac1), textoComp(f.comp2, f.ligac2)].filter(Boolean).join(', ')].forEach((t) => tr.appendChild(el('td', {}, t)));
      const td = el('td', { class: 'acc' });
      const bE = el('button', { type: 'button', title: 'Editar' }, '✎');
      const bX = el('button', { type: 'button', title: 'Quitar de la lista' }, '✕');
      bE.addEventListener('click', () => editar(f));
      bX.addEventListener('click', () => quitar(f));
      td.append(bE, bX); tr.appendChild(td);
      tbody.appendChild(tr);
      if (av) {                                       // explicación debajo del renglón
        const t2 = el('tr', { class: 'aviso' });
        t2.appendChild(el('td', { colspan: 5 }, `En la última publicación: ${av.join(' · ')}. Corrígelo con ✎ y vuelve a publicar.`));
        tbody.appendChild(t2);
      }
    });
    cuenta.textContent = `${filas.length} ficha${filas.length === 1 ? '' : 's'} en la lista`
      + (filas.length ? (pendiente ? ' · hay cambios sin publicar' : ' · todo publicado') : '');
    botonPublicar();
    if (!filas.length) { const tr = el('tr'); tr.appendChild(el('td', { colspan: 5, class: 'vacio' }, 'La lista está vacía.')); tbody.appendChild(tr); }
  }

  async function cargarLista() {
    cuenta.textContent = 'Cargando lista…';
    try { const r = await api('lista'); filas = r.filas || []; pendiente = !!r.pendiente; pintarFilas(); } catch (e) { cuenta.textContent = e.message; }
  }

  function editar(f) {
    editando = { id: f.id, liga: f.liga, posicion: f.posicion };
    selLiga.value = f.liga; llenarIds();
    txtId.value = f.id; selPosN.value = f.posicion; txtNom.value = f.nombre || '';
    selLC1.value = f.ligac1 || OP.ligaRef; llenarComp(1); txtC1.value = f.comp1 || '';
    selLC2.value = f.ligac2 || OP.ligaRef; llenarComp(2); txtC2.value = f.comp2 || '';
    msg.textContent = `Editando ${f.id}: corrige lo que sea (ID, liga, posición, nombre…) y da “Guardar cambios”.`;
    btnAgregar.textContent = '✔ Guardar cambios';
    btnCancelarEd.style.display = '';
    pintarFilas();
    txtId.focus();
  }

  function salirEdicion() {
    editando = null;
    btnAgregar.textContent = '＋ Agregar a la lista';
    btnCancelarEd.style.display = 'none';
    txtId.value = ''; txtNom.value = ''; txtC2.value = '';
    if (OP && selLC2.value !== OP.ligaRef) { selLC2.value = OP.ligaRef; llenarComp(2); }
    pintarFilas();
  }
  btnCancelarEd.addEventListener('click', () => { salirEdicion(); msg.textContent = ''; });

  async function quitar(f) {
    if (!confirm(`¿Quitar a ${f.id} (${f.posicion}) de la lista?\nSu ficha desaparece de la página en la próxima publicación.`)) return;
    try { filas = (await api('quitar', { id: f.id, liga: f.liga, posicion: f.posicion })).filas; pendiente = true; pintarFilas(); } catch (e) { alert(e.message); }
  }

  // ------------------------------------------------------------------ abrir
  btnNueva.addEventListener('click', async () => {
    if (btnNueva.classList.contains('ok')) { location.reload(); return; }   // "Ver fichas nuevas"
    if (!(await conPin())) return;
    try { await cargarOpciones(); } catch (e) { alert(e.message); return; }
    if (!selLiga.options.length) llenarSelects();
    dlg.showModal();
    cargarLista();
    if (!corriendo) revisarEstado(false);
  });
  $('btnCerrarNueva').addEventListener('click', () => dlg.close());
  selLiga.addEventListener('change', () => { txtId.value = ''; llenarIds(); });

  // ------------------------------------------------------------------ agregar
  frm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const d = {
      id: txtId.value.trim(), liga: selLiga.value, posicion: selPosN.value, nombre: txtNom.value.trim(),
      comp1: txtC1.value.trim(), comp2: txtC2.value.trim(), ligac1: selLC1.value, ligac2: selLC2.value,
    };
    if (editando) d.original = editando;               // se reemplaza ese renglón aunque cambie el ID
    if (!d.liga || !d.id || !d.posicion || !d.nombre || !d.comp1) { msg.textContent = 'Faltan campos obligatorios (*).'; return; }
    if (d.comp2 && d.comp2 === d.comp1 && d.ligac2 === d.ligac1) { msg.textContent = '“Comparar con 2” no puede ser el mismo que el 1.'; return; }
    for (const [i, c, l] of [[1, d.comp1, d.ligac1], [2, d.comp2, d.ligac2]]) {
      if (c && !idsComp[i].has(c) && !confirm(`“${c}” (comparar con ${i}) no aparece en ${l} de la base de datos.\n¿Guardarlo de todos modos?`)) return;
    }
    if (!idsLiga.has(d.id) && !confirm(`“${d.id}” no aparece en ${d.liga} de la base de datos que tiene la página.\n¿Agregarlo de todos modos?`)) return;
    msg.textContent = 'Guardando…';
    try {
      const r = await api('agregar', d);
      filas = r.filas; pendiente = true;
      const eraEdicion = !!editando;
      salirEdicion();
      msg.textContent = `${eraEdicion || !r.nuevo ? 'Corregido' : 'Agregado'}: ${d.id}. Cuando termines, “Publicar fichas”.`;
      txtId.focus();
    } catch (e) { msg.textContent = e.message; }
  });

  // ------------------------------------------------------------------ publicar + estado
  // El estado se ve dentro de la ventana y en el botón del encabezado, así se puede cerrar la ventana
  // y seguir usando la página mientras GitHub genera las fichas.
  let timer = null, corriendo = false, esperaPagina = 0;
  let generadoAntes = leer('generadoAntes') || (window.FICHAS || {}).generado;
  const textoEstado = { queued: 'En cola…', in_progress: 'Generando fichas y radares…', waiting: 'En espera…', requested: 'En cola…', pending: 'En cola…' };

  function botonPublicar() {
    btnPub.disabled = corriendo || !filas.length;
    btnPub.textContent = pendiente || !filas.length ? '⬆ Publicar fichas' : '⬆ Publicar de nuevo';
    btnPub.title = !filas.length ? 'La lista está vacía' : '';
  }

  function encabezado(clase, texto) {
    btnNueva.className = 'hdr' + (clase ? ' ' + clase : '');
    btnNueva.textContent = texto || '＋ Nueva ficha';
  }

  function ponerEstado(clase, partes) {
    estado.className = 'estado' + (clase ? ' ' + clase : '');
    estado.replaceChildren(...partes);
  }

  async function revisarEstado(seguir = true) {
    try {
      const r = await api('estado');
      if (!r.run) { ponerEstado('', []); return; }
      const fecha = new Date(r.run.creado).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
      if (r.run.status !== 'completed') {
        corriendo = true; botonPublicar();
        guardar('publicando', '1');
        ponerEstado('corre', [`${textoEstado[r.run.status] || r.run.status} (iniciada ${fecha})`]);
        encabezado('corre', '⏳ Publicando…');
        programar(15000);
        return;
      }
      corriendo = false; botonPublicar();
      if (r.run.conclusion !== 'success') {
        guardar('publicando', null);
        ponerEstado('mal', [`La publicación del ${fecha} falló. `, el('a', { href: r.run.url, target: '_blank', rel: 'noopener' }, 'Ver detalle')]);
        encabezado('mal', '⚠ Falló la publicación');
        setTimeout(() => encabezado(), 20000);
        return;
      }
      if (!seguir) { ponerEstado('', [`Última publicación: ${fecha}`]); return; }
      // terminó bien: esperar a que GitHub Pages sirva la versión nueva
      const txt = await (await fetch(`data/fichas.js?ts=${Date.now()}`, { cache: 'no-store' })).text();
      const g = (txt.match(/"generado":"([^"]*)"/) || [])[1];
      if (g && g !== generadoAntes) {
        guardar('publicando', null); guardar('generadoAntes', null);
        if (g === (window.FICHAS || {}).generado) {          // esta pestaña ya tiene la versión nueva
          ponerEstado('ok', [`Listo, ya está publicada (${g}).`]);
          encabezado();
          return;
        }
        const b = el('button', { type: 'button', class: 'primary' }, 'Ver fichas nuevas');
        b.addEventListener('click', () => location.reload());
        ponerEstado('ok', [`Listo, ya está publicada (${g}). `, b]);
        encabezado('ok', '✓ Ver fichas nuevas');
        return;
      }
      esperaPagina += 1;
      if (esperaPagina > 16) {
        guardar('publicando', null);
        ponerEstado('', ['Terminó, pero la página no cambió (no había cambios en los datos).']);
        encabezado();
        return;
      }
      ponerEstado('corre', ['Terminó. Esperando a que la página se actualice (≈1 min)…']);
      encabezado('corre', '⏳ Casi listo…');
      programar(15000);
    } catch (e) {
      // un error al consultar NO detiene la publicación (corre en GitHub): se sigue revisando
      if (corriendo || leer('publicando')) {
        ponerEstado('corre', ['Sin respuesta del servidor; reintentando… (la publicación sigue corriendo)']);
        programar(20000);
      } else {
        ponerEstado('mal', [e.message]);
      }
    }
  }
  function programar(ms) { clearTimeout(timer); timer = setTimeout(() => revisarEstado(true), ms); }

  btnPub.addEventListener('click', async () => {
    if (!(await conPin())) return;
    if (!filas.length) return;
    const msgConf = pendiente
      ? `Se publicarán las ${filas.length} fichas de la lista.\nTarda de 2 a 5 minutos y puedes seguir usando la página. ¿Continuar?`
      : 'No hay cambios en la lista desde la última publicación.\nSolo sirve si subiste fotos, mapas o radares nuevos a Drive. ¿Publicar de todos modos?';
    if (!confirm(msgConf)) return;
    corriendo = true; botonPublicar();
    ponerEstado('corre', ['Enviando…']);
    try {
      try {
        await api('publicar', {}, 1);           // sin reintentos: podría mandarse dos veces
      } catch (e) {
        if (!/respuesta del servidor/.test(e.message)) throw e;
        // se cortó la conexión: quizá sí se mandó. Se revisa en GitHub antes de dar error.
        await new Promise((ok) => setTimeout(ok, 4000));
        const r = await api('estado');
        if (!r.run || r.run.status === 'completed') throw e;
      }
      pendiente = false; pintarFilas();
      generadoAntes = (window.FICHAS || {}).generado; esperaPagina = 0;
      guardar('publicando', '1'); guardar('generadoAntes', generadoAntes);
      ponerEstado('corre', ['En cola… (puedes cerrar esta ventana)']);
      encabezado('corre', '⏳ Publicando…');
      programar(12000);
    } catch (e) { corriendo = false; botonPublicar(); ponerEstado('mal', [e.message]); }
  });

  // Si se recargó la página o se volvió a ella mientras publicaba, se sigue mostrando el avance
  if (pin && leer('publicando')) revisarEstado(true);
})();
