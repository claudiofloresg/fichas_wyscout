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
  const guardarLocal = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* sin storage */ } };
  const leerLocal = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };

  let pin = leer('pinFichas');

  // ------------------------------------------------------------------ API
  async function api(accion, datos = {}) {
    const r = await fetch(URL_API, { method: 'POST', body: JSON.stringify({ accion, pin, ...datos }) });
    if (!r.ok) throw new Error(`El servidor respondió ${r.status}`);
    const j = await r.json();
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
  const selC1 = $('nComp1'), selC2 = $('nComp2'), txtQuien = $('nQuien');
  const tbody = $('tblLista'), cuenta = $('nCuenta'), btnPub = $('btnPublicar'), estado = $('nEstado');
  let idsLiga = new Set(), filas = [];

  const opt = (v, t) => el('option', { value: v }, t ?? v);

  function llenarSelects() {
    selLiga.replaceChildren(opt('', '— elige —'), ...OP.ligas.filter((l) => l !== OP.ligaRef).map((l) => opt(l)),
      ...(OP.ligaRef ? [opt(OP.ligaRef)] : []));
    selPosN.replaceChildren(opt('', '— elige —'), ...OP.posiciones.map((p) => opt(p)));
    const pumas = OP.pumas.map(([n, p]) => opt(n, p ? `${n} (${p})` : n));
    selC1.replaceChildren(opt('', '— elige —'), ...pumas.map((o) => o.cloneNode(true)));
    selC2.replaceChildren(opt('', '— ninguno —'), ...pumas.map((o) => o.cloneNode(true)));
    txtQuien.value = leerLocal('quienFichas') || '';
  }

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
      [f.id, f.liga, f.posicion, [f.comp1, f.comp2].filter(Boolean).join(', ')].forEach((t) => tr.appendChild(el('td', {}, t)));
      const td = el('td', { class: 'acc' });
      const bE = el('button', { type: 'button', title: 'Editar' }, '✎');
      const bX = el('button', { type: 'button', title: 'Quitar de la lista' }, '✕');
      bE.addEventListener('click', () => editar(f));
      bX.addEventListener('click', () => quitar(f));
      td.append(bE, bX); tr.appendChild(td);
      tbody.appendChild(tr);
    });
    cuenta.textContent = `${filas.length} ficha${filas.length === 1 ? '' : 's'} en la lista`;
    if (!filas.length) { const tr = el('tr'); tr.appendChild(el('td', { colspan: 5, class: 'vacio' }, 'La lista está vacía.')); tbody.appendChild(tr); }
  }

  async function cargarLista() {
    cuenta.textContent = 'Cargando lista…';
    try { filas = (await api('lista')).filas || []; pintarFilas(); } catch (e) { cuenta.textContent = e.message; }
  }

  function editar(f) {
    selLiga.value = f.liga; llenarIds();
    txtId.value = f.id; selPosN.value = f.posicion; txtNom.value = f.nombre || '';
    selC1.value = f.comp1 || ''; selC2.value = f.comp2 || '';
    msg.textContent = 'Editando: al guardar se reemplaza ese renglón.';
    txtId.focus();
  }

  async function quitar(f) {
    if (!confirm(`¿Quitar a ${f.id} (${f.posicion}) de la lista?\nSu ficha desaparece de la página en la próxima publicación.`)) return;
    try { filas = (await api('quitar', { id: f.id, liga: f.liga, posicion: f.posicion })).filas; pintarFilas(); } catch (e) { alert(e.message); }
  }

  // ------------------------------------------------------------------ abrir
  btnNueva.addEventListener('click', async () => {
    if (!(await conPin())) return;
    try { await cargarOpciones(); } catch (e) { alert(e.message); return; }
    if (!selLiga.options.length) llenarSelects();
    dlg.showModal();
    cargarLista();
    revisarEstado(false);
  });
  $('btnCerrarNueva').addEventListener('click', () => dlg.close());
  selLiga.addEventListener('change', () => { txtId.value = ''; llenarIds(); });

  // ------------------------------------------------------------------ agregar
  frm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const d = {
      id: txtId.value.trim(), liga: selLiga.value, posicion: selPosN.value, nombre: txtNom.value.trim(),
      comp1: selC1.value, comp2: selC2.value, quien: txtQuien.value.trim(),
    };
    if (!d.liga || !d.id || !d.posicion || !d.nombre || !d.comp1) { msg.textContent = 'Faltan campos obligatorios (*).'; return; }
    if (d.comp2 && d.comp2 === d.comp1) { msg.textContent = '“Comparar con 2” no puede ser el mismo que el 1.'; return; }
    if (!idsLiga.has(d.id) && !confirm(`“${d.id}” no aparece en ${d.liga} de la base de datos que tiene la página.\n¿Agregarlo de todos modos?`)) return;
    guardarLocal('quienFichas', d.quien);
    msg.textContent = 'Guardando…';
    try {
      const r = await api('agregar', d);
      filas = r.filas; pintarFilas();
      msg.textContent = `${r.nuevo ? 'Agregado' : 'Actualizado'}: ${d.id}. Cuando termines, “Publicar fichas”.`;
      txtId.value = ''; txtNom.value = ''; selC2.value = '';
      txtId.focus();
    } catch (e) { msg.textContent = e.message; }
  });

  // ------------------------------------------------------------------ publicar + estado
  let timer = null, generadoAntes = (window.FICHAS || {}).generado, esperaPagina = 0;
  const textoEstado = { queued: 'En cola…', in_progress: 'Generando fichas y radares…', waiting: 'En espera…', requested: 'En cola…', pending: 'En cola…' };

  async function revisarEstado(seguir = true) {
    try {
      const r = await api('estado');
      if (!r.run) { estado.textContent = ''; return; }
      const fecha = new Date(r.run.creado).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
      if (r.run.status !== 'completed') {
        estado.className = 'estado corre';
        estado.textContent = `${textoEstado[r.run.status] || r.run.status} (iniciada ${fecha})`;
        btnPub.disabled = true;
        programar(15000);
        return;
      }
      btnPub.disabled = false;
      if (r.run.conclusion !== 'success') {
        estado.className = 'estado mal';
        estado.innerHTML = '';
        estado.append(`La publicación del ${fecha} falló. `, Object.assign(el('a', { href: r.run.url, target: '_blank', rel: 'noopener' }, 'Ver detalle')));
        return;
      }
      if (!seguir) { estado.className = 'estado'; estado.textContent = `Última publicación: ${fecha}`; return; }
      // terminó bien: esperar a que GitHub Pages sirva la versión nueva
      const txt = await (await fetch(`data/fichas.js?ts=${Date.now()}`, { cache: 'no-store' })).text();
      const g = (txt.match(/"generado":"([^"]*)"/) || [])[1];
      if (g && g !== generadoAntes) {
        estado.className = 'estado ok';
        estado.innerHTML = '';
        const b = el('button', { type: 'button', class: 'primary' }, 'Recargar página');
        b.addEventListener('click', () => location.reload());
        estado.append(`Listo, ya está publicada (${g}). `, b);
        return;
      }
      esperaPagina += 1;
      estado.className = 'estado corre';
      estado.textContent = esperaPagina > 16
        ? 'Terminó, pero la página no cambió (quizá no había cambios en los datos). Revisa el reporte en GitHub si falta algo.'
        : 'Terminó. Esperando a que la página se actualice (≈1 min)…';
      if (esperaPagina <= 16) programar(15000);
    } catch (e) { estado.className = 'estado mal'; estado.textContent = e.message; }
  }
  function programar(ms) { clearTimeout(timer); timer = setTimeout(() => revisarEstado(true), ms); }

  btnPub.addEventListener('click', async () => {
    if (!(await conPin())) return;
    if (!confirm(`Se publicarán las ${filas.length} fichas de la lista.\nTarda de 2 a 5 minutos. ¿Continuar?`)) return;
    btnPub.disabled = true;
    estado.className = 'estado corre'; estado.textContent = 'Enviando…';
    try {
      await api('publicar');
      generadoAntes = (window.FICHAS || {}).generado; esperaPagina = 0;
      estado.textContent = 'En cola…';
      programar(12000);
    } catch (e) { estado.className = 'estado mal'; estado.textContent = e.message; btnPub.disabled = false; }
  });
})();
