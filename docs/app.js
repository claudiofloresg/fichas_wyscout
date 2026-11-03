/* app.js — posición, lista de jugadores, vista previa y descargas */
(() => {
  const D = window.FICHAS;
  const $ = (id) => document.getElementById(id);
  const selPos = $('selPos'), txt = $('txtBuscar');
  const lista = $('lista'), count = $('count'), status = $('status');
  const btnPdf = $('btnPdf'), btnEquipo = $('btnEquipo'), frame = $('preview'), empty = $('empty');

  if (!D || !D.posiciones || !D.posiciones.length) {
    empty.textContent = D && D.modo === 'lista'
      ? 'Todavía no hay fichas publicadas. Agrégalas con “＋ Nueva ficha” y luego “Publicar fichas”.'
      : 'No hay datos cargados. Corre actualizar.bat para generarlos.';
    if (D && D.generado) $('meta').innerHTML = `Datos actualizados<br><b>${D.generado}</b>`;
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
  // Pumas: una portada general ("Primer Equipo Varonil") en vez de una por jugador
  const generar = (js, prev) => Informe.generar(js.map(conTemp), D, prev ? false : chkPortada.checked,
    pos && pos.pumas ? (pos.portada || 'Primer Equipo Varonil') : null, pos && pos.pumas ? pos.portadaSub : null);
  try { const v = localStorage.getItem('portada'); if (v !== null) chkPortada.checked = v === '1'; } catch (e) { /* sin storage */ }
  chkPortada.addEventListener('change', () => { try { localStorage.setItem('portada', chkPortada.checked ? '1' : '0'); } catch (e) { /* sin storage */ } });

  let pos = null, actual = null, urlPrev = null, ocupado = false;

  // ---------------------------------------------------------------- formato de descarga: PDF o PNG
  const selFormato = $('selFormato');
  try { const f = localStorage.getItem('formato'); if (f === 'png' || f === 'pdf') selFormato.value = f; } catch (e) { /* sin storage */ }
  const esPng = () => !!(pos && pos.pumas) && selFormato.value === 'png';   // PNG solo en el apartado Pumas
  function textosBotones() {
    btnPdf.textContent = esPng() ? '⬇ Descargar PNG' : '⬇ Descargar PDF';
    btnEquipo.textContent = esPng() ? '⬇ Todos en PNG (ZIP)' : '⬇ Descargar todos';
  }
  selFormato.addEventListener('change', () => {
    try { localStorage.setItem('formato', selFormato.value); } catch (e) { /* sin storage */ }
    textosBotones();
  });
  textosBotones();

  // PNG: se dibuja cada página del PDF (el mismo de siempre) con pdf.js. Se carga solo la primera vez que se usa.
  let pdfjs = null;
  async function cargarPdfjs() {
    if (!pdfjs) {
      pdfjs = await import(new URL('vendor/pdfjs/pdf.min.mjs', location.href).href);
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('vendor/pdfjs/pdf.worker.min.mjs', location.href).href;
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
  async function pdfAPngs(bytes, avance) {
    const lib = await cargarPdfjs();
    const tarea = lib.getDocument({
      data: bytes.slice(),
      standardFontDataUrl: new URL('vendor/pdfjs/standard_fonts/', location.href).href,
    });
    const doc = await tarea.promise;
    const out = [];
    for (let n = 1; n <= doc.numPages; n++) {
      if (avance) avance(n, doc.numPages);
      const pagina = await doc.getPage(n);
      const vp = pagina.getViewport({ scale: 2.5 });                 // carta horizontal -> 1980 x 1530 px
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
  // nombres de las páginas en el orden en que salen del PDF (portada, ficha, portada, ficha…)
  function nombresPaginas(js, conPortada, numerar) {
    const out = [];
    if (conPortada && pos && pos.pumas) { out.push((numerar ? '00_' : '') + 'Portada.png'); conPortada = false; }
    js.forEach((j, k) => {
      const base = (numerar ? String(k + 1).padStart(2, '0') + '_' : '') + 'Ficha_' + nombreArchivo(j.nombre);
      if (conPortada) out.push(base + '_portada.png');
      out.push(base + '.png');
    });
    return out;
  }
  async function descargarPng(js, nombreZip) {
    const bytes = await generar(js);
    const pngs = await pdfAPngs(bytes, (n, t) => { if (t > 1) status.textContent = `Convirtiendo a PNG… ${n} de ${t}`; });
    const nombres = nombresPaginas(js, chkPortada.checked, js.length > 1);
    if (pngs.length === 1) { bajarBlob(pngs[0], nombres[0]); return; }
    const JSZip = await cargarScript('vendor/jszip.min.js', 'JSZip');
    const zip = new JSZip();
    pngs.forEach((b, k) => zip.file(nombres[k] || `pagina_${k + 1}.png`, b));
    bajarBlob(await zip.generateAsync({ type: 'blob' }), nombreZip);
  }

  D.posiciones.forEach((p) => selPos.appendChild(opt(p.id, `${p.label} (${p.jugadores.length})`)));

  function cargarPos() {
    pos = D.posiciones.find((p) => p.id === selPos.value) || D.posiciones[0];
    // Formato PNG y "Descargar todos" solo en el apartado Pumas
    $('lblFormato').hidden = !pos.pumas;
    btnEquipo.hidden = !pos.pumas;
    textosBotones();
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
      li.innerHTML = `<span class="n"></span><span class="e"></span>`;
      li.querySelector('.n').textContent = j.nombrePortada || j.nombre;   // nombre corto (el de la portada)
      li.querySelector('.e').textContent = j.equipo || '';
      li.addEventListener('click', () => seleccionar(j));
      li.addEventListener('pointerenter', () => Informe.precargar(j), { once: true });
      li.addEventListener('touchstart', () => Informe.precargar(j), { once: true, passive: true });
      frag.appendChild(li);
    });
    lista.appendChild(frag);
    count.textContent = `${js.length} jugador${js.length === 1 ? '' : 'es'}`;
    if (!js.length) { const v = document.createElement('li'); v.className = 'grupo'; v.textContent = 'Sin resultados'; lista.appendChild(v); }
    btnEquipo.disabled = !js.length;
    btnEquipo.title = `Los ${js.length} jugadores con una sola portada`;
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

  function bajarBlob(blob, nombre) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nombre;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  const descargar = (bytes, nombre) => bajarBlob(new Blob([bytes], { type: 'application/pdf' }), nombre);

  btnPdf.addEventListener('click', async () => {
    if (!actual || ocupado) return;
    ocupado = true; btnPdf.disabled = true;
    try {
      if (esPng()) {
        status.textContent = 'Generando PNG…';
        await descargarPng([actual], `Ficha_${nombreArchivo(actual.nombre)}.zip`);
        status.textContent = '';
      } else descargar(await generar([actual]), `Ficha_${nombreArchivo(actual.nombre)}.pdf`);
    } catch (e) { console.error(e); status.textContent = 'Error: ' + e.message; }
    ocupado = false; btnPdf.disabled = false;
  });

  btnEquipo.addEventListener('click', async () => {
    const js = filtrados();
    if (!js.length || ocupado) return;
    ocupado = true; btnEquipo.disabled = true;
    status.textContent = `Generando ${js.length} fichas…`;
    try {
      if (esPng()) await descargarPng(js, `Fichas_${nombreArchivo(pos.label)}_PNG.zip`);
      else descargar(await generar(js), `Fichas_${nombreArchivo(pos.label)}.pdf`);
      status.textContent = `Listo: ${js.length} fichas.`;
    } catch (e) { console.error(e); status.textContent = 'Error: ' + e.message; }
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
  // la primera ficha tarda (se baja el fondo y se "calienta" el generador): se hace en segundo plano al abrir
  else setTimeout(() => {
    const j0 = (pos && pos.jugadores[0]) || null;
    Informe.precargar(j0);
    if (j0) generar([j0], true).catch(() => {});
  }, 400);
})();
