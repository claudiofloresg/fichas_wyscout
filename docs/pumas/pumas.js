/* pumas.js — fichas de jugadores de Pumas, SOLO local (fichas_pumas.bat).
   Eliges con las casillas a quién sacar, en PNG o PDF, con una portada general opcional. */
(() => {
  const D = window.FICHAS;
  const $ = (id) => document.getElementById(id);
  const lista = $('lista'), count = $('count'), status = $('status'), frame = $('preview'), empty = $('empty');
  const selPos = $('selPos'), txt = $('txtBuscar'), selFormato = $('selFormato'), chkPortada = $('chkPortada');
  const txtTitulo = $('txtTitulo'), txtSub = $('txtSub'), btnDescargar = $('btnDescargar');

  const grupo = D && (D.posiciones || []).find((p) => p.pumas);
  if (!grupo || !grupo.jugadores.length) { empty.textContent = 'No hay jugadores. Corre fichas_pumas.bat.'; return; }
  const J = grupo.jugadores;
  $('meta').innerHTML = `Datos de<br><b>${D.generado}</b>`;
  txtTitulo.value = grupo.portada || 'Primer Equipo Varonil';
  txtSub.value = grupo.portadaSub || '';

  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const nombreArchivo = (s) => norm(s).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  const opt = (v, t) => { const o = document.createElement('option'); o.value = v; o.textContent = t; return o; };

  // ---- preferencias de esta compu
  const leer = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const guardar = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* sin storage */ } };
  if (leer('pumasFormato')) selFormato.value = leer('pumasFormato');
  selFormato.addEventListener('change', () => { guardar('pumasFormato', selFormato.value); botones(); });

  // ---- foto / mapa / nombre temporales por jugador (solo en esta pestaña; no se guardan en ningún lado)
  const temp = {};                                   // id -> {foto, mapa, nombre, fotoNombre, mapaNombre}
  const conTemp = (j) => {
    const t = temp[j.id];
    return t ? { ...j, foto: t.foto || j.foto, mapa: t.mapa || j.mapa, nombre: t.nombre || j.nombre } : j;
  };
  const tieneTemp = (j) => { const t = temp[j.id]; return !!(t && (t.foto || t.mapa || t.nombre)); };

  // ---- lista con casillas
  const marcados = new Set();
  let actual = null, urlPrev = null, ocupado = false;
  const posiciones = [...new Set(J.map((j) => j.posicion))];
  selPos.append(opt('', `Todas (${J.length})`), ...posiciones.map((p) => opt(p, `${p} (${J.filter((j) => j.posicion === p).length})`)));

  const filtrados = () => {
    const q = norm(txt.value.trim());
    return J.filter((j) => (!selPos.value || j.posicion === selPos.value) &&
      (!q || norm(j.nombre).includes(q) || norm(j.nombrePortada).includes(q) || norm(j.nombreExcel).includes(q)));
  };

  function pintar() {
    const js = filtrados();
    lista.replaceChildren();
    let pos = null;
    js.forEach((j) => {
      if (!selPos.value && j.posicion !== pos) {
        pos = j.posicion;
        const g = document.createElement('li'); g.className = 'grupo'; g.textContent = pos; lista.appendChild(g);
      }
      const li = document.createElement('li');
      if (actual === j) li.classList.add('sel');
      const cb = document.createElement('input');
      cb.type = 'checkbox'; cb.checked = marcados.has(j.id);
      cb.addEventListener('click', (ev) => { ev.stopPropagation(); cb.checked ? marcados.add(j.id) : marcados.delete(j.id); botones(); });
      const t = document.createElement('span'); t.className = 'txt';
      const n = document.createElement('span'); n.className = 'n'; n.textContent = j.nombrePortada || j.nombre;
      const e = document.createElement('span'); e.className = 'e'; e.textContent = [j.posicion, j.equipo].filter(Boolean).join(' · ');
      if (tieneTemp(j)) { const m = document.createElement('span'); m.className = 'tmp'; m.textContent = ' · temporal'; e.appendChild(m); }
      t.append(n, e);
      li.append(cb, t);
      li.addEventListener('click', () => ver(j));
      li.addEventListener('pointerenter', () => Informe.precargar(j), { once: true });
      lista.appendChild(li);
    });
    botones();
  }

  function botones() {
    const n = marcados.size;
    count.textContent = `${n} de ${J.length} marcados`;
    btnDescargar.disabled = !n || ocupado;
    btnDescargar.textContent = `⬇ Descargar ${n || ''} en ${selFormato.value.toUpperCase()}`.replace('  ', ' ');
  }

  $('btnTodos').addEventListener('click', () => { filtrados().forEach((j) => marcados.add(j.id)); pintar(); });
  $('btnNinguno').addEventListener('click', () => { filtrados().forEach((j) => marcados.delete(j.id)); pintar(); });
  selPos.addEventListener('change', pintar);
  txt.addEventListener('input', pintar);

  // ---- PDF (mismo diseño que la página) con portada general
  const generar = (js, conPortada) => Informe.generar(js.map(conTemp), D, conPortada,
    txtTitulo.value.trim() || 'Primer Equipo Varonil', txtSub.value.trim() || null);

  async function ver(j) {
    actual = j; pintar(); pintarExtras();
    $('titulo').textContent = j.nombrePortada || j.nombre;
    await vistaPrevia(j);
  }

  async function vistaPrevia(j) {
    status.textContent = 'Generando vista previa…';
    try {
      const bytes = await generar([j], false);
      if (actual !== j) return;
      if (urlPrev) URL.revokeObjectURL(urlPrev);
      urlPrev = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      frame.src = urlPrev + '#toolbar=0&navpanes=0&view=Fit';
      empty.style.display = 'none';
      status.textContent = '';
    } catch (e) { console.error(e); status.textContent = 'Error: ' + e.message; }
  }

  // ---- foto / mapa / nombre temporales (igual que la página, pero en vez del video se cambia el nombre)
  const extras = $('extras'), txtNombre = $('txtNombre');
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
    txtNombre.value = t.nombre || '';
    txtNombre.placeholder = actual ? actual.nombre : '';
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
      pintar();
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
      pintar(); pintarExtras(); vistaPrevia(actual);
    });
  });
  // soltar una imagen fuera de las cajas no abre la imagen en la pestaña
  ['dragover', 'drop'].forEach((ev) => window.addEventListener(ev, (e) => e.preventDefault()));

  let tNombre = null;
  txtNombre.addEventListener('input', () => {
    if (!actual) return;
    const j = actual, v = txtNombre.value.trim();
    const t = (temp[j.id] = temp[j.id] || {});
    if (v) t.nombre = v; else delete t.nombre;
    clearTimeout(tNombre);
    tNombre = setTimeout(() => { pintar(); if (actual === j) vistaPrevia(j); }, 600);
  });

  // ---- PNG: cada página del PDF con pdf.js; varias -> ZIP
  let pdfjs = null;
  async function cargarPdfjs() {
    if (!pdfjs) {
      pdfjs = await import(new URL('../vendor/pdfjs/pdf.min.mjs', location.href).href);
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.mjs', location.href).href;
    }
    return pdfjs;
  }
  function cargarScript(src, global) {
    if (window[global]) return Promise.resolve(window[global]);
    return new Promise((ok, mal) => {
      const s = document.createElement('script');
      s.src = src; s.onload = () => ok(window[global]); s.onerror = () => mal(new Error('no se pudo cargar ' + src));
      document.head.appendChild(s);
    });
  }
  async function pdfAPngs(bytes) {
    const lib = await cargarPdfjs();
    const tarea = lib.getDocument({ data: bytes.slice(), standardFontDataUrl: new URL('../vendor/pdfjs/standard_fonts/', location.href).href });
    const doc = await tarea.promise;
    const out = [];
    for (let n = 1; n <= doc.numPages; n++) {
      status.textContent = `Convirtiendo a PNG… ${n} de ${doc.numPages}`;
      const pagina = await doc.getPage(n);
      const vp = pagina.getViewport({ scale: 2.5 });                 // 1980 x 1530 px
      const cv = document.createElement('canvas');
      cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
      const cx = cv.getContext('2d');
      cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height);
      await pagina.render({ canvasContext: cx, canvas: cv, viewport: vp }).promise;
      out.push(await new Promise((ok) => cv.toBlob(ok, 'image/png')));
      pagina.cleanup();
    }
    await tarea.destroy();
    return out;
  }
  function bajar(blob, nombre) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = nombre;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  btnDescargar.addEventListener('click', async () => {
    const js = J.filter((j) => marcados.has(j.id));             // en el orden de la lista (por posición)
    const nom = (j) => conTemp(j).nombre;                       // con el nombre temporal, si lo cambiaron
    if (!js.length || ocupado) return;
    ocupado = true; botones();
    const conPortada = chkPortada.checked;
    const fecha = new Date().toISOString().slice(0, 10);
    try {
      status.textContent = `Generando ${js.length} ficha${js.length === 1 ? '' : 's'}…`;
      const bytes = await generar(js, conPortada);
      if (selFormato.value === 'pdf') {
        bajar(new Blob([bytes], { type: 'application/pdf' }),
          js.length === 1 && !conPortada ? `Ficha_${nombreArchivo(nom(js[0]))}.pdf` : `Fichas_Pumas_${fecha}.pdf`);
      } else {
        const pngs = await pdfAPngs(bytes);
        const nombres = [];
        if (conPortada) nombres.push('00_Portada.png');
        js.forEach((j, k) => nombres.push(`${String(k + 1).padStart(2, '0')}_Ficha_${nombreArchivo(nom(j))}.png`));
        if (pngs.length === 1) bajar(pngs[0], nombres[0].replace(/^\d+_/, ''));
        else {
          const JSZip = await cargarScript('../vendor/jszip.min.js', 'JSZip');
          const zip = new JSZip();
          pngs.forEach((b, k) => zip.file(nombres[k] || `pagina_${k + 1}.png`, b));
          bajar(await zip.generateAsync({ type: 'blob' }), `Fichas_Pumas_${fecha}_PNG.zip`);
        }
      }
      status.textContent = `Listo: ${js.length} ficha${js.length === 1 ? '' : 's'}.`;
    } catch (e) { console.error(e); status.textContent = 'Error: ' + e.message; }
    ocupado = false; botones();
  });

  pintar();
})();
