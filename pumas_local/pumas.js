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
  const generar = (js, conPortada) => Informe.generar(js, D, conPortada,
    txtTitulo.value.trim() || 'Primer Equipo Varonil', txtSub.value.trim() || null);

  async function ver(j) {
    actual = j; pintar();
    $('titulo').textContent = j.nombrePortada || j.nombre;
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

  // ---- PNG: cada página del PDF con pdf.js; varias -> ZIP
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
  async function pdfAPngs(bytes) {
    const lib = await cargarPdfjs();
    const tarea = lib.getDocument({ data: bytes.slice(), standardFontDataUrl: new URL('vendor/pdfjs/standard_fonts/', location.href).href });
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
    if (!js.length || ocupado) return;
    ocupado = true; botones();
    const conPortada = chkPortada.checked;
    const fecha = new Date().toISOString().slice(0, 10);
    try {
      status.textContent = `Generando ${js.length} ficha${js.length === 1 ? '' : 's'}…`;
      const bytes = await generar(js, conPortada);
      if (selFormato.value === 'pdf') {
        bajar(new Blob([bytes], { type: 'application/pdf' }),
          js.length === 1 && !conPortada ? `Ficha_${nombreArchivo(js[0].nombre)}.pdf` : `Fichas_Pumas_${fecha}.pdf`);
      } else {
        const pngs = await pdfAPngs(bytes);
        const nombres = [];
        if (conPortada) nombres.push('00_Portada.png');
        js.forEach((j, k) => nombres.push(`${String(k + 1).padStart(2, '0')}_Ficha_${nombreArchivo(j.nombre)}.png`));
        if (pngs.length === 1) bajar(pngs[0], nombres[0].replace(/^\d+_/, ''));
        else {
          const JSZip = await cargarScript('vendor/jszip.min.js', 'JSZip');
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
