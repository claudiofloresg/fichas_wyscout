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

  credito: { texto: 'Inteligencia Deportiva Pumas', x: 932, y: 26 },   // esquina sup. derecha, sobre la línea azul
  foto: { x: 56, y: 60, w: 96, h: 120 },
  datos: { x: 166, y: 70, w: 186, columnaValor: 58, renglon: 13 },
  mapa: { x: 364, y: 60, w: 232, h: 168 },   // centrado en la página (x + w/2 = 480)
  estadisticas: { x: 616, y: 60, w: 316, yFin: 242 },
  // radares (imágenes, 1 a 4): se reparten a lo largo de la ficha
  radares: {
    titulo: 'RADARES DE RENDIMIENTO', yTitulo: 244, tamTitulo: 9,
    y: 258, yFin: 490,            // alto disponible para las imágenes
    x0: 40, x1: 920,              // ancho disponible
    sep: 6,                       // separación mínima entre radares
  },
  yPie: 515,            // pie de página (debajo de la línea azul): Fuente / Datos al (2 renglones)
  fuente: 'HUDL Wyscout',
};

const Informe = (() => {
  const { rgb, StandardFonts, PDFDocument, BlendMode } = PDFLib;
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
    const path = (d, o = {}) => page.drawSvgPath(d, { x: 0, y: P.h, color: o.color });
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

    // ---------- foto (sin recuadro; el blanco de la foto se funde con el fondo)
    const F = D.foto;
    const foto = await img(ctx, jug.foto);
    if (foto) g.imagen(foto, F.x, F.y, F.w, F.h, { abajo: true, blend: BlendMode.Multiply });
    else silueta(g, F.x, F.y, F.w, F.h);

    // ---------- nombre, equipo y datos generales (a un costado de la foto)
    const Dt = D.datos;
    const nombre = (jug.nombre || '').toUpperCase();
    let size = 17;
    let lineas = renglones(g, nombre, f.bold, size, Dt.w);
    while (size > 11 && Math.max(...lineas.map((s) => g.ancho(s, f.bold, size))) > Dt.w) size -= 0.5;
    let y = Dt.y;
    lineas.forEach((s) => { t(s, Dt.x, y, { font: f.bold, size, color: C.navy, maxW: Dt.w }); y += size * 1.08; });
    y += 3;
    t(jug.equipo || '', Dt.x, y, { font: f.bold, size: 8.5, color: C.gold, maxW: Dt.w });
    y += 17;
    (jug.datos || []).forEach(([lab, val]) => {
      t(lab, Dt.x, y, { size: 7, color: C.soft });
      t(val || '–', Dt.x + Dt.columnaValor, y, { font: f.bold, size: 8.3, color: C.ink, maxW: Dt.w - Dt.columnaValor });
      y += Dt.renglon;
    });

    // ---------- mapa de calor
    const M = D.mapa;
    t('MAPA DE CALOR', M.x + M.w / 2, M.y + 7, { font: f.bold, size: 7.5, color: C.navy, align: 'center' });
    const my = M.y + 14, mh = M.h - 14;
    const mapa = await img(ctx, jug.mapa);
    if (mapa) g.imagen(mapa, M.x, my, M.w, mh);
    else t('Sin mapa de calor', M.x + M.w / 2, my + mh / 2, { font: f.ital, size: 8.5, color: C.faint, align: 'center' });

    // ---------- estadísticas (sin recuadro): arriba número grande, abajo número chico, etiqueta
    const Es = D.estadisticas;
    t('ESTADÍSTICAS', Es.x + Es.w / 2, Es.y + 7, { font: f.bold, size: 7.5, color: C.navy, align: 'center' });
    const datos = jug.stats || [];
    if (datos.length) {
      const nc = datos.length <= 16 ? 4 : 5, cw = Es.w / nc;
      const nf = Math.ceil(datos.length / nc);
      const y0 = Es.y + 18;
      const rh = (Es.yFin - y0) / nf;
      const big = Math.min(19, rh * 0.4);
      datos.forEach(([lab, arriba, abajo], k) => {
        const xc = Es.x + cw * (k % nc) + cw / 2;
        let yy = y0 + Math.floor(k / nc) * rh + big * 0.8;
        t(arriba, xc, yy, { font: f.bold, size: big, color: C.gold, align: 'center', maxW: cw - 4, minSize: 9 });
        yy += 7.6;
        if (abajo != null) { t(abajo, xc, yy, { font: f.bold, size: 6.6, color: C.navy, align: 'center' }); yy += 7; }
        renglones(g, lab, f.reg, 5.9, cw - 4).forEach((s) => {
          t(s, xc, yy, { size: 5.9, color: C.soft, align: 'center', maxW: cw - 3, minSize: 4.6 });
          yy += 6.4;
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
    t(`Datos al ${meta.generado.split(' ')[0]}`, 38, D.yPie + 8, { size: 6.4, color: C.faint, maxW: 300 });
  }

  async function generar(jugadores, meta) {
    const ctx = await nuevoDoc();
    for (const j of jugadores) await pagina(ctx, j, meta);
    return ctx.doc.save();
  }

  return { generar };
})();
