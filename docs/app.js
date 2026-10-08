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
  const generar = (js) => Informe.generar(js, D);

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
    btnPdf.disabled = false;
    const u = new URL(location.href);
    u.searchParams.set('p', pos.id); u.searchParams.set('j', j.id);
    history.replaceState(null, '', u);
    status.textContent = 'Generando vista previa…';
    try {
      const bytes = await generar([j]);
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

  selPos.addEventListener('change', () => { actual = null; cargarPos(); });
  txt.addEventListener('input', pintarLista);

  // enlace directo: ?p=<posición>&j=<jugador>
  const qs = new URLSearchParams(location.search);
  if (qs.get('p') && D.posiciones.some((p) => p.id === qs.get('p'))) selPos.value = qs.get('p');
  cargarPos();
  const pre = qs.get('j') && pos.jugadores.find((j) => j.id === qs.get('j'));
  if (pre) seleccionar(pre);
})();
