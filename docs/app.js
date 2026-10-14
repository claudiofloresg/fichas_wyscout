/* app.js — posición, lista de jugadores, vista previa y descargas */
(() => {
  const D = window.FICHAS;
  const $ = (id) => document.getElementById(id);
  const selPos = $('selPos'), txt = $('txtBuscar');
  const lista = $('lista'), count = $('count'), status = $('status');
  const btnPdf = $('btnPdf'), btnEquipo = $('btnEquipo'), frame = $('preview'), empty = $('empty');

  if (!D || !D.posiciones || !D.posiciones.length) {
    empty.textContent = 'No hay datos cargados. Corre actualizar.bat para generarlos.';
    return;
  }
  $('meta').innerHTML = `Datos actualizados<br><b>${D.generado}</b>`;

  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const nombreArchivo = (s) => norm(s).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  const opt = (v, t) => { const o = document.createElement('option'); o.value = v; o.textContent = t; return o; };
  const chkPortada = $('chkPortada');
  // archivos temporales por jugador (solo en esta pestaña; no se guardan en ningún lado)
  const temp = {};                                   // id -> {foto, mapa, video, fotoNombre, mapaNombre}
  const conTemp = (j) => {
    const t = temp[j.id];
    return t ? { ...j, foto: t.foto || j.foto, mapa: t.mapa || j.mapa, video: t.video || j.video } : j;
  };
  const generar = (js, prev) => Informe.generar(js.map(conTemp), D, prev ? false : chkPortada.checked);
  try { const v = localStorage.getItem('portada'); if (v !== null) chkPortada.checked = v === '1'; } catch (e) { /* sin storage */ }
  chkPortada.addEventListener('change', () => { try { localStorage.setItem('portada', chkPortada.checked ? '1' : '0'); } catch (e) { /* sin storage */ } });

  let pos = null, actual = null, urlPrev = null, ocupado = false;

  D.posiciones.forEach((p) => selPos.appendChild(opt(p.id, `${p.label} (${p.jugadores.length})`)));

  function cargarPos() {
    pos = D.posiciones.find((p) => p.id === selPos.value) || D.posiciones[0];
    pintarLista();
  }

  function filtrados() {
    const q = norm(txt.value.trim());
    return pos.jugadores.filter((j) => !q || norm(j.nombre).includes(q) || norm(j.nombreExcel).includes(q) || norm(j.equipo).includes(q));
  }

  function pintarLista() {
    const js = filtrados();
    lista.innerHTML = '';
    const frag = document.createDocumentFragment();
    js.forEach((j) => {
      const li = document.createElement('li');
      li.dataset.id = j.id;
      if (actual && actual.id === j.id) li.classList.add('sel');
      li.innerHTML = `<span class="n"></span><span class="m"></span><span class="e"></span>`;
      li.querySelector('.n').textContent = j.nombre;
      li.querySelector('.m').textContent = `${j.minutos.toLocaleString('es-MX')} min`;
      li.querySelector('.e').textContent = [j.equipo, j.posWyscout].filter(Boolean).join(' · ');
      li.addEventListener('click', () => seleccionar(j));
      frag.appendChild(li);
    });
    lista.appendChild(frag);
    count.textContent = `${js.length} jugador${js.length === 1 ? '' : 'es'}`;
    if (!js.length) { const v = document.createElement('li'); v.className = 'grupo'; v.textContent = 'Sin resultados'; lista.appendChild(v); }
    btnEquipo.disabled = !js.length;
    btnEquipo.title = `Un PDF con los ${js.length} jugadores de la lista`;
  }

  async function seleccionar(j) {
    actual = j;
    document.querySelectorAll('#lista li').forEach((li) => li.classList.toggle('sel', li.dataset.id === j.id));
    $('titulo').textContent = j.nombre;
    $('subtitulo').textContent = [j.equipo, j.posicion, `${j.minutos.toLocaleString('es-MX')} min`].filter(Boolean).join(' · ');
    btnPdf.disabled = false; $('btnVer').disabled = false;
    const u = new URL(location.href);
    u.searchParams.set('p', pos.id); u.searchParams.set('j', j.id);
    history.replaceState(null, '', u);
    pintarExtras();
    await vistaPrevia(j);
  }

  async function vistaPrevia(j) {
    status.textContent = 'Generando vista previa…';
    try {
      const bytes = await generar([j], true);
      if (actual !== j) return;
      if (urlPrev) URL.revokeObjectURL(urlPrev);
      urlPrev = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      frame.src = urlPrev + '#toolbar=0&navpanes=0&view=Fit';
      empty.style.display = 'none';
      status.textContent = '';
    } catch (e) {
      console.error(e);
      status.textContent = 'Error al generar la ficha: ' + e.message;
    }
  }

  // ---------------------------------------------------------------- foto / mapa / video temporales
  const extras = $('extras'), txtVideo = $('txtVideo');
  const drops = [...document.querySelectorAll('.drop[data-tipo="foto"], .drop[data-tipo="mapa"]')];

  // cualquier imagen (png, jpg, webp…) -> JPEG con fondo blanco (lo que el PDF acepta), máx. 1400 px
  function aJpeg(file) {
    return new Promise((ok, mal) => {
      const url = URL.createObjectURL(file);
      const im = new Image();
      im.onload = () => {
        const k = Math.min(1, 1400 / Math.max(im.naturalWidth, im.naturalHeight));
        const cv = document.createElement('canvas');
        cv.width = Math.round(im.naturalWidth * k); cv.height = Math.round(im.naturalHeight * k);
        const cx = cv.getContext('2d');
        cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height);
        cx.drawImage(im, 0, 0, cv.width, cv.height);
        URL.revokeObjectURL(url);
        cv.toBlob((b) => (b ? ok(URL.createObjectURL(b)) : mal(new Error('no se pudo leer la imagen'))), 'image/jpeg', 0.9);
      };
      im.onerror = () => { URL.revokeObjectURL(url); mal(new Error('ese archivo no es una imagen que el navegador pueda abrir')); };
      im.src = url;
    });
  }

  function pintarExtras() {
    extras.classList.toggle('off', !actual);
    const t = (actual && temp[actual.id]) || {};
    drops.forEach((d) => {
      const tipo = d.dataset.tipo, url = t[tipo];
      const tienePerm = actual && actual[tipo];
      d.classList.toggle('lleno', !!url);
      d.querySelector('.mini').style.backgroundImage = url ? `url("${url}")` : (tienePerm ? `url("${actual[tipo]}")` : '');
      d.querySelector('.dd').textContent = url ? `${t[tipo + 'Nombre']} (temporal)`
        : (tienePerm ? 'Ya tiene (Drive). Arrastra para reemplazar' : 'Arrastra o haz clic');
    });
    txtVideo.value = t.video || '';
    txtVideo.placeholder = actual && actual.video ? 'Ya tiene video (Drive). Pega otro para reemplazar' : 'Pega el link del video';
  }

  async function ponerArchivo(tipo, file) {
    if (!actual || !file) return;
    if (!file.type.startsWith('image/')) { status.textContent = 'Solo imágenes (png, jpg, webp…).'; return; }
    const j = actual;
    try {
      const url = await aJpeg(file);
      const t = (temp[j.id] = temp[j.id] || {});
      if (t[tipo]) URL.revokeObjectURL(t[tipo]);
      t[tipo] = url; t[tipo + 'Nombre'] = file.name;
      if (actual === j) { pintarExtras(); vistaPrevia(j); }
    } catch (e) { status.textContent = 'Error: ' + e.message; }
  }

  drops.forEach((d) => {
    const tipo = d.dataset.tipo, inp = d.querySelector('input[type=file]');
    inp.addEventListener('change', () => { ponerArchivo(tipo, inp.files[0]); inp.value = ''; });
    ['dragenter', 'dragover'].forEach((ev) => d.addEventListener(ev, (e) => { e.preventDefault(); d.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((ev) => d.addEventListener(ev, (e) => { e.preventDefault(); d.classList.remove('over'); }));
    d.addEventListener('drop', (e) => ponerArchivo(tipo, e.dataTransfer.files[0]));
    d.querySelector('.x').addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      const t = actual && temp[actual.id];
      if (!t || !t[tipo]) return;
      URL.revokeObjectURL(t[tipo]); delete t[tipo]; delete t[tipo + 'Nombre'];
      pintarExtras(); vistaPrevia(actual);
    });
  });
  // soltar una imagen fuera de las cajas no abre la imagen en la pestaña
  ['dragover', 'drop'].forEach((ev) => window.addEventListener(ev, (e) => e.preventDefault()));

  let tVideo = null;
  txtVideo.addEventListener('input', () => {
    if (!actual) return;
    const j = actual, v = txtVideo.value.trim();
    const t = (temp[j.id] = temp[j.id] || {});
    if (v) t.video = /^https?:\/\//i.test(v) ? v : 'https://' + v; else delete t.video;
    clearTimeout(tVideo);
    tVideo = setTimeout(() => { if (actual === j) vistaPrevia(j); }, 600);
  });

  // vista previa del PDF completo (con portada si está marcada) en otra pestaña
  $('btnVer').addEventListener('click', async () => {
    if (!actual) return;
    const w = window.open('', '_blank');               // se abre al momento del clic para que no la bloquee el navegador
    try {
      const bytes = await generar([actual]);
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      if (w) w.location.href = url; else location.href = url;
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) { if (w) w.close(); status.textContent = 'Error: ' + e.message; }
  });

  function descargar(bytes, nombre) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    a.download = nombre;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  btnPdf.addEventListener('click', async () => {
    if (!actual || ocupado) return;
    ocupado = true; btnPdf.disabled = true;
    try {
      descargar(await generar([actual]), `Ficha_${nombreArchivo(actual.nombre)}.pdf`);
    } catch (e) { status.textContent = 'Error: ' + e.message; }
    ocupado = false; btnPdf.disabled = false;
  });

  btnEquipo.addEventListener('click', async () => {
    const js = filtrados();
    if (!js.length || ocupado) return;
    ocupado = true; btnEquipo.disabled = true;
    status.textContent = `Generando ${js.length} fichas…`;
    try {
      descargar(await generar(js), `Fichas_${nombreArchivo(pos.label)}.pdf`);
      status.textContent = `Listo: ${js.length} fichas.`;
    } catch (e) { status.textContent = 'Error: ' + e.message; }
    ocupado = false; btnEquipo.disabled = false;
  });

  selPos.addEventListener('change', () => { actual = null; cargarPos(); pintarExtras(); });
  txt.addEventListener('input', pintarLista);

  // enlace directo: ?p=<posición>&j=<jugador>
  const qs = new URLSearchParams(location.search);
  if (qs.get('p') && D.posiciones.some((p) => p.id === qs.get('p'))) selPos.value = qs.get('p');
  cargarPos();
  const pre = qs.get('j') && pos.jugadores.find((j) => j.id === qs.get('j'));
  if (pre) seleccionar(pre);
})();
