/* =============================================================================
   informe.js — Ficha gráfica (PDF horizontal 16:9) con pdf-lib
   Todo el diseño (colores, medidas, textos) está en DISENO_INFORME.
   Unidades: puntos. Página = 960 x 540 pt.
   Coordenadas: x desde la izquierda, y desde ARRIBA.
   ========================================================================== */
const DISENO_INFORME = {
  pagina: { w: 960, h: 540 },
  fondo: 'assets/fondo_informe.jpg',
  colores: {
    navy: '#0C2A4E', gold: '#B08A4E', ink: '#0C2A4E', soft: '#5A6470', faint: '#8B93A0', avatar: '#BFC4CA',
  },

  credito: { texto: 'Inteligencia Deportiva Pumas', x: 932, y: 24.5 },   // esquina sup. derecha, centrado arriba de la línea azul
  foto: { x: 52, w: 96, h: 120 },                 // se centra en vertical con el bloque de nombre + datos
  // tamNombre = nombre del jugador; tamEtiqueta / tamValor = 'Posición' / 'Delantero'
  datos: { x: 166, y: 74, w: 196, columnaValor: 74, renglon: 15.5, tamEquipo: 12, tamNombre: 20, tamEtiqueta: 8.2, tamValor: 9.6 },
  mapa: { x: 384, y: 60, w: 192, h: 138 },   // centrado en la página (x + w/2 = 480)
  // botón de video (debajo del mapa): solo sale si el jugador tiene link en nombres.xlsx (columna VIDEO)
  video: { texto: 'VER VIDEO', y: 214 },   // colores de la ficha: contorno e ícono dorados, texto azul marino
  // tamEtiqueta / tamAbajo = tamaño del texto de la etiqueta y del número chico
  // sin título; y = arriba de la tabla. espacio = distancia número grande -> chico -> etiqueta;
  // interlineado = entre renglones de la etiqueta
  // la tabla se centra en vertical entre y y yFin
  estadisticas: { x: 616, y: 46, w: 316, yFin: 236, tamEtiqueta: 7, tamAbajo: 7, espacio: 10, interlineado: 8.4 },
  // radares (imágenes, 1 a 4): se reparten a lo largo de la ficha
  radares: {
    titulo: 'RADARES DE RENDIMIENTO', yTitulo: 244, tamTitulo: 9,
    y: 258, yFin: 490,            // alto disponible para las imágenes
    x0: 40, x1: 920,              // ancho disponible
    sep: 6,                       // separación mínima entre radares
  },
  // portada (primera hoja de cada jugador)
  portada: {
    logo: 'assets/logo.png', logoAlto: 118,               // el logo se centra sobre la línea de arriba
    tamNombre: 40, espaciado: 0.32,                       // el nombre se centra en el recuadro; espaciado entre letras
    texto: 'Inteligencia Deportiva', tamTexto: 10,        // se centra sobre la línea de abajo
    marco: { x: 150, y: 170, w: 660, h: 270, separacion: 16 },  // separacion = aire entre líneas y logo/texto
  },
  yPie: 519,            // pie de página (debajo de la línea azul)
  fuente: 'HUDL Wyscout',
};

const Informe = (() => {
  const { rgb, StandardFonts, PDFDocument, BlendMode, PDFName, PDFString } = PDFLib;
  const D = DISENO_INFORME;
  const P = D.pagina;

  const hex = (h) => {
    const n = parseInt(h.slice(1), 16);
    return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
  };
  const C = Object.fromEntries(Object.entries(D.colores).map(([k, v]) => [k, hex(v)]));

  // ------------------------------------------------------------------ recursos
  const cacheBytes = new Map();
  async function bytes(url) {
    if (!url) return null;
    if (!cacheBytes.has(url)) {
      cacheBytes.set(url, fetch(url).then(r => (r.ok ? r.arrayBuffer() : null)).catch(() => null));
    }
    return cacheBytes.get(url);
  }

  async function embed(doc, b) {
    if (!b) return null;
    try { return await doc.embedPng(b); } catch (e) { /* no es png */ }
    try { return await doc.embedJpg(b); } catch (e) { return null; }
  }

  async function nuevoDoc() {
    const doc = await PDFDocument.create();
    doc.setTitle('Ficha de jugador — Pumas UNAM');
    doc.setAuthor('Inteligencia Deportiva Pumas');
    doc.setCreator('Fichas Wyscout — Inteligencia Deportiva Pumas');
    const f = {
      reg: await doc.embedFont(StandardFonts.Helvetica),
      bold: await doc.embedFont(StandardFonts.HelveticaBold),
      ital: await doc.embedFont(StandardFonts.HelveticaOblique),
    };
    const fondo = await embed(doc, await bytes(D.fondo));
    return { doc, f, fondo, imgs: new Map() };
  }

  async function img(ctx, url) {
    if (!url) return null;
    if (!ctx.imgs.has(url)) ctx.imgs.set(url, await embed(ctx.doc, await bytes(url)));
    return ctx.imgs.get(url);
  }

  // ------------------------------------------------------------------ texto seguro (WinAnsi)
  const okChar = new Map();
  function limpio(font, s) {
    s = String(s ?? '');
    let out = '';
    for (const ch of s) {
      if (!okChar.has(ch)) {
        try { font.widthOfTextAtSize(ch, 10); okChar.set(ch, ch); }
        catch (e) {
          const base = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
          let ok = '';
          try { font.widthOfTextAtSize(base, 10); ok = base; } catch (e2) { ok = ''; }
          okChar.set(ch, ok);
        }
      }
      out += okChar.get(ch);
    }
    return out;
  }

  // ------------------------------------------------------------------ primitivas (y desde arriba)
  function mk(page, ctx) {
    const Y = (y) => P.h - y;
    const ancho = (s, font, size) => font.widthOfTextAtSize(limpio(font, s), size);
    const t = (s, x, y, o = {}) => {
      const font = o.font || ctx.f.reg;
      let size = o.size || 9;
      s = limpio(font, s);
      if (o.maxW) {
        while (size > (o.minSize || 6) && font.widthOfTextAtSize(s, size) > o.maxW) size -= 0.25;
        if (font.widthOfTextAtSize(s, size) > o.maxW) {
          while (s.length > 1 && font.widthOfTextAtSize(s + '…', size) > o.maxW) s = s.slice(0, -1);
          s += '…';
        }
      }
      const w = font.widthOfTextAtSize(s, size);
      const xx = o.align === 'right' ? x - w : o.align === 'center' ? x - w / 2 : x;
      page.drawText(s, { x: xx, y: Y(y), size, font, color: o.color || C.ink, opacity: o.opacity });
      return w;
    };
    const path = (d, o = {}) => page.drawSvgPath(d, { x: 0, y: P.h, color: o.color, borderColor: o.border, borderWidth: o.border ? (o.bw || 1) : 0 });
    const circ = (cx, cy, rr, o = {}) => page.drawCircle({ x: cx, y: Y(cy), size: rr, color: o.color });
    // imagen centrada dentro de una caja (sin deformar)
    const imagen = (im, x, y, w, h, o = {}) => {
      const s = Math.min(w / im.width, h / im.height);
      const iw = im.width * s, ih = im.height * s;
      const ix = x + (w - iw) / 2;
      const iy = o.abajo ? y + h - ih : o.arriba ? y : y + (h - ih) / 2;
      page.drawImage(im, { x: ix, y: Y(iy + ih), width: iw, height: ih, blendMode: o.blend });
      return { x: ix, y: iy, w: iw, h: ih };
    };
    return { t, path, circ, ancho, imagen };
  }

  const f2 = (n) => Math.round(n * 100) / 100;
  // parte un texto en renglones que quepan en maxW (máximo 2; el resto se encoge)
  function renglones(g, s, font, size, maxW) {
    if (g.ancho(s, font, size) <= maxW || !s.includes(' ')) return [s];
    const p = s.split(' ');
    let mejor = [s], peor = 1e9;
    for (let k = 1; k < p.length; k++) {
      const a = p.slice(0, k).join(' '), b = p.slice(k).join(' ');
      const w = Math.max(g.ancho(a, font, size), g.ancho(b, font, size));
      if (w < peor) { peor = w; mejor = [a, b]; }
    }
    return mejor;
  }

  // ------------------------------------------------------------------ silueta gris (sin foto)
  function silueta(g, x, y, w, h) {
    const col = C.avatar;
    const s = Math.min(w, h * 0.8);
    const x0 = x + (w - s) / 2, base = y + h;
    g.circ(x0 + s / 2, base - s * 0.86, s * 0.21, { color: col });
    g.path(`M${f2(x0 + s * 0.08)},${f2(base)} V${f2(base - s * 0.2)} ` +
      `C${f2(x0 + s * 0.08)},${f2(base - s * 0.5)} ${f2(x0 + s * 0.28)},${f2(base - s * 0.58)} ${f2(x0 + s * 0.5)},${f2(base - s * 0.58)} ` +
      `C${f2(x0 + s * 0.72)},${f2(base - s * 0.58)} ${f2(x0 + s * 0.92)},${f2(base - s * 0.5)} ${f2(x0 + s * 0.92)},${f2(base - s * 0.2)} ` +
      `V${f2(base)} Z`, { color: col });
  }

  // ------------------------------------------------------------------ página
  async function pagina(ctx, jug, meta) {
    const page = ctx.doc.addPage([P.w, P.h]);
    const g = mk(page, ctx);
    const { t } = g;
    const { f } = ctx;
    if (ctx.fondo) page.drawImage(ctx.fondo, { x: 0, y: 0, width: P.w, height: P.h });

    // ---------- crédito (arriba a la derecha)
    t(D.credito.texto, D.credito.x, D.credito.y, { font: f.bold, size: 7.5, color: C.navy, align: 'right' });

    // ---------- nombre, equipo y datos generales (a un costado de la foto)
    const Dt = D.datos;
    const nombre = (jug.nombre || '').toUpperCase();
    let size = Dt.tamNombre;
    let lineas = renglones(g, nombre, f.bold, size, Dt.w);
    while (size > 11 && Math.max(...lineas.map((s) => g.ancho(s, f.bold, size))) > Dt.w) size -= 0.5;
    let y = Dt.y;
    const yArriba = Dt.y - size * 0.75;
    lineas.forEach((s) => { t(s, Dt.x, y, { font: f.bold, size, color: C.navy, maxW: Dt.w }); y += size * 1.08; });
    y += Dt.tamEquipo * 0.45;
    t(jug.equipo || '', Dt.x, y, { font: f.bold, size: Dt.tamEquipo, color: C.gold, maxW: Dt.w });
    y += Dt.tamEquipo + 8;
    (jug.datos || []).forEach(([lab, val]) => {
      t(lab, Dt.x, y, { size: Dt.tamEtiqueta, color: C.soft });
      t(val || '–', Dt.x + Dt.columnaValor, y, { font: f.bold, size: Dt.tamValor, color: C.ink, maxW: Dt.w - Dt.columnaValor });
      y += Dt.renglon;
    });
    const yAbajo = y - Dt.renglon + 2;

    // ---------- foto (sin recuadro), centrada en vertical con el bloque de nombre + datos
    const F = D.foto;
    const fy = (yArriba + yAbajo) / 2 - F.h / 2;
    const foto = await img(ctx, jug.foto);
    if (foto) g.imagen(foto, F.x, fy, F.w, F.h, { abajo: true, blend: BlendMode.Multiply });
    else silueta(g, F.x, fy, F.w, F.h);

    // ---------- mapa de calor
    const M = D.mapa;
    t('MAPA DE CALOR', M.x + M.w / 2, M.y + 7, { font: f.bold, size: 7.5, color: C.navy, align: 'center' });
    const my = M.y + 14, mh = M.h - 14;
    const mapa = await img(ctx, jug.mapa);
    if (mapa) g.imagen(mapa, M.x, my, M.w, mh);
    else t('Sin mapa de calor', M.x + M.w / 2, my + mh / 2, { font: f.ital, size: 8.5, color: C.faint, align: 'center' });

    // ---------- botón de video (link clicable en el PDF)
    if (jug.video) {
      const V = D.video, cxv = M.x + M.w / 2;
      const ts = 8, tw = g.ancho(V.texto, f.bold, ts);
      const ic = 13, gap = 6, bw = ic + gap + tw + 16, bh = 19;
      const bx = cxv - bw / 2, by = V.y - bh / 2;
      g.path(`M${f2(bx + 4)},${f2(by)} H${f2(bx + bw - 4)} Q${f2(bx + bw)},${f2(by)} ${f2(bx + bw)},${f2(by + 4)} V${f2(by + bh - 4)} Q${f2(bx + bw)},${f2(by + bh)} ${f2(bx + bw - 4)},${f2(by + bh)} H${f2(bx + 4)} Q${f2(bx)},${f2(by + bh)} ${f2(bx)},${f2(by + bh - 4)} V${f2(by + 4)} Q${f2(bx)},${f2(by)} ${f2(bx + 4)},${f2(by)} Z`, { border: C.gold, bw: 1.1 });
      // ícono "play": círculo dorado con triángulo blanco
      const icx = bx + 8 + ic / 2, icy = V.y;
      g.circ(icx, icy, ic / 2, { color: C.gold });
      g.path(`M${f2(icx - 2.2)},${f2(icy - 3.4)} L${f2(icx + 3.6)},${f2(icy)} L${f2(icx - 2.2)},${f2(icy + 3.4)} Z`, { color: rgb(1, 1, 1) });
      t(V.texto, icx + ic / 2 + gap, V.y + ts * 0.36, { font: f.bold, size: ts, color: C.navy });
      // zona clicable
      const annot = ctx.doc.context.obj({
        Type: 'Annot', Subtype: 'Link', Rect: [bx, P.h - (by + bh), bx + bw, P.h - by], Border: [0, 0, 0],
        A: { Type: 'Action', S: 'URI', URI: PDFString.of(jug.video) },
      });
      page.node.addAnnot(ctx.doc.context.register(annot));
    }

    // ---------- estadísticas (sin recuadro): arriba número grande, abajo número chico, etiqueta
    const Es = D.estadisticas;
    const datos = jug.stats || [];
    if (datos.length) {
      const nc = datos.length <= 16 ? 4 : 5, cw = Es.w / nc;
      const nf = Math.ceil(datos.length / nc);
      const y0 = Es.y;
      const rh = (Es.yFin - y0) / nf;
      const big = Math.min(19, rh * 0.4);
      datos.forEach(([lab, arriba, abajo], k) => {
        const xc = Es.x + cw * (k % nc) + cw / 2;
        // alto del bloque (número grande + chico + 2 renglones de etiqueta), centrado en su renglón
        const altoBloque = big * 0.72 + 2 * Es.espacio + Es.interlineado + 2;
        let yy = y0 + Math.floor(k / nc) * rh + (rh - altoBloque) / 2 + big * 0.72;
        t(arriba, xc, yy, { font: f.bold, size: big, color: C.gold, align: 'center', maxW: cw - 4, minSize: 9 });
        yy += Es.espacio;
        // el renglón del número chico se reserva siempre: así todas las etiquetas quedan alineadas
        if (abajo != null) t(abajo, xc, yy, { font: f.bold, size: Es.tamAbajo, color: C.navy, align: 'center' });
        yy += Es.espacio;
        renglones(g, lab, f.reg, Es.tamEtiqueta, cw - 4).forEach((s) => {
          t(s, xc, yy, { size: Es.tamEtiqueta, color: C.soft, align: 'center', maxW: cw - 3, minSize: 5 });
          yy += Es.interlineado;
        });
      });
    } else {
      t(`Sin catálogo de estadísticas para "${jug.posicion}".`, Es.x + Es.w / 2, Es.y + 60,
        { font: f.ital, size: 8.5, color: C.faint, align: 'center' });
    }

    // ---------- radares (imágenes): título único, 1 a 4 centrados
    const R = D.radares;
    t(R.titulo, P.w / 2, R.yTitulo, { font: f.bold, size: R.tamTitulo, color: C.navy, align: 'center' });
    const ims = [];
    for (const u of (jug.radares || [])) { const im = await img(ctx, u); if (im) ims.push(im); }
    if (ims.length) {
      // el ancho de la ficha se reparte en partes iguales; cada radar va al centro de su parte
      const n = ims.length, h = R.yFin - R.y;
      const slot = (R.x1 - R.x0) / n;
      ims.forEach((im, k) => g.imagen(im, R.x0 + k * slot + R.sep / 2, R.y, slot - R.sep, h));
    } else {
      t('Sin radares', P.w / 2, (R.y + R.yFin) / 2, { font: f.ital, size: 8.5, color: C.faint, align: 'center' });
    }

    // ---------- pie de página (debajo de la línea azul)
    t(`Fuente: ${D.fuente}`, 38, D.yPie, { size: 6.4, color: C.faint, maxW: 300 });
  }

  // ------------------------------------------------------------------ portada
  async function portada(ctx, jug) {
    const page = ctx.doc.addPage([P.w, P.h]);
    const g = mk(page, ctx);
    const { f } = ctx;
    const Po = D.portada;
    const Y = (y) => P.h - y;
    if (ctx.fondo) page.drawImage(ctx.fondo, { x: 0, y: 0, width: P.w, height: P.h });

    // marco dorado tipo "corchetes": arriba con hueco para el logo, abajo abierto al centro
    const Mc = Po.marco, oro = C.gold, th = 1.1;
    const ln = (x1, y1, x2, y2) => page.drawLine({ start: { x: x1, y: Y(y1) }, end: { x: x2, y: Y(y2) }, thickness: th, color: oro });
    const cx = P.w / 2, x0 = Mc.x, x1 = Mc.x + Mc.w, y0 = Mc.y, y1 = Mc.y + Mc.h;

    // logo centrado sobre la línea de arriba (la línea se corta a los lados del logo)
    const logo = await img(ctx, Po.logo);
    const lh = Po.logoAlto, lw = logo ? logo.width * lh / logo.height : 0;
    if (logo) page.drawImage(logo, { x: cx - lw / 2, y: Y(y0 + lh / 2), width: lw, height: lh });
    const huecoArriba = logo ? lw / 2 + Mc.separacion : 0;
    ln(x0, y0, cx - huecoArriba, y0); ln(cx + huecoArriba, y0, x1, y0);     // arriba
    ln(x0, y0, x0, y1); ln(x1, y0, x1, y1);                                 // lados

    // texto centrado sobre la línea de abajo (la línea se corta a los lados del texto)
    const tw = f.bold.widthOfTextAtSize(limpio(f.bold, Po.texto), Po.tamTexto);
    g.t(Po.texto, cx, y1 + Po.tamTexto * 0.36, { font: f.bold, size: Po.tamTexto, color: C.navy, align: 'center' });
    ln(x0, y1, cx - tw / 2 - Mc.separacion, y1); ln(cx + tw / 2 + Mc.separacion, y1, x1, y1);   // abajo

    // nombre con letras espaciadas (se achica si no cabe)
    const nombre = limpio(f.bold, jug.nombre || '');
    let size = Po.tamNombre;
    const anchoNombre = (s) => [...nombre].reduce((a, ch) => a + f.bold.widthOfTextAtSize(ch, s), 0)
      + Po.espaciado * s * (nombre.length - 1);
    while (size > 16 && anchoNombre(size) > Mc.w - 40) size -= 1;
    let x = cx - anchoNombre(size) / 2;
    const yNombre = (y0 + y1) / 2 + size * 0.36;            // centro vertical del recuadro
    for (const ch of nombre) {
      page.drawText(ch, { x, y: Y(yNombre), size, font: f.bold, color: C.navy });
      x += f.bold.widthOfTextAtSize(ch, size) + Po.espaciado * size;
    }
  }

  async function generar(jugadores, meta, conPortada = true) {
    const ctx = await nuevoDoc();
    for (const j of jugadores) {
      if (conPortada) await portada(ctx, j);
      await pagina(ctx, j, meta);
    }
    return ctx.doc.save();
  }

  return { generar };
})();