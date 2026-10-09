# -*- coding: utf-8 -*-
"""
build.py — Excel Wyscout por posición + nombres + fotos + mapas + radares  ->  docs/ (la página)
===============================================================================================
Uso:   python build.py

Flujo
  1. Cada .xlsx de CARPETA_EXCEL es una POSICIÓN (delantero.xlsx, central.xlsx...).
     Cada fila del Excel es un jugador con ficha.
  2. El nombre que se imprime es el NOMBRE COMPLETO de CARPETA_NOMBRES
     (NOMBRE EXCEL | NOMBRE COMPLETO). Si no está, se usa el del Excel.
  3. Fotos, mapas y radares se buscan con el nombre tal cual viene en el Excel
     (también sirve el nombre completo):
        datos/fotos/A. Bertaccini.png
        datos/mapas/A. Bertaccini.png
        datos/radar/A. Bertaccini/promedio.png | jugador.png | <vs>.png

Genera
  docs/data/fichas.js        datos que usa la página
  docs/img/fotos|mapas|radares
  reporte_build.txt          a quién le falta algo
"""
import json
import math
import os
import re
import sys
import unicodedata
from datetime import date, datetime

import numpy as np
import pandas as pd
from PIL import Image, ImageDraw, ImageOps

import config as C

# Rutas propias de cada compu (trabajo / casa): config_local.py NO se sube a GitHub.
try:
    import config_local as _L
    for _k in dir(_L):
        if _k.isupper():
            setattr(C, _k, getattr(_L, _k))
    print("Usando rutas de config_local.py")
except ImportError:
    pass
from paises import PAISES

BASE = os.path.dirname(os.path.abspath(__file__))
DOCS = os.path.join(BASE, "docs")
OUT_DATA = os.path.join(DOCS, "data", "fichas.js")
OUT_IMG = {k: os.path.join(DOCS, "img", k) for k in ("fotos", "mapas", "radares")}
REPORTE = os.path.join(BASE, "reporte_build.txt")

cfg = lambda nombre, default=None: getattr(C, nombre, default)  # noqa: E731


# ============================================================================= utilidades
def ruta(p):
    return p if os.path.isabs(p) else os.path.join(BASE, p)


def slug(texto):
    t = unicodedata.normalize("NFKD", str(texto)).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "_", t.lower()).strip("_")


def es_vacio(v):
    return v is None or (isinstance(v, float) and math.isnan(v)) or str(v).strip() in {"", "nan", "NaT", "None"}


def to_number(x):
    if es_vacio(x):
        return np.nan
    if isinstance(x, (int, float, np.integer, np.floating)):
        return float(x)
    s = str(x).strip().replace("%", "").replace("\xa0", "").replace(" ", "")
    if s.lower() in {"nan", "none", "null", "-"}:
        return np.nan
    if "," in s and "." in s:
        s = s.replace(".", "").replace(",", ".") if s.rfind(",") > s.rfind(".") else s.replace(",", "")
    elif "," in s:
        s = s.replace(",", ".") if len(s.split(",")[-1]) in (1, 2) else s.replace(",", "")
    try:
        return float(s)
    except ValueError:
        return np.nan


def leer_carpeta(carpeta, ext=(".xlsx", ".xlsm", ".xls")):
    carpeta = ruta(carpeta)
    if not os.path.isdir(carpeta):
        return []
    return sorted(os.path.join(carpeta, f) for f in os.listdir(carpeta)
                  if f.lower().endswith(ext) and not f.startswith("~$"))


# ============================================================================= imágenes
def indexar_imagenes(carpeta, recursivo=True):
    idx = {}
    carpeta = ruta(carpeta)
    if not os.path.isdir(carpeta):
        print(f"  [aviso] no existe la carpeta {carpeta}")
        return idx
    for raiz, _, archivos in os.walk(carpeta):
        for a in sorted(archivos):
            stem, ext = os.path.splitext(a)
            if ext.lower() in C.EXTENSIONES_IMAGEN:
                idx.setdefault(slug(stem), os.path.join(raiz, a))
        if not recursivo:
            break
    return idx


def indexar_radares(carpeta):
    """{slug(nombre carpeta): {"promedio": ruta, "jugador": ruta, "vs": ruta}}"""
    out = {}
    carpeta = ruta(carpeta)
    if not os.path.isdir(carpeta):
        print(f"  [aviso] no existe la carpeta {carpeta}")
        return out
    k_prom, k_jug = slug(cfg("RADAR_PROMEDIO", "promedio")), slug(cfg("RADAR_JUGADOR", "jugador"))
    for d in sorted(os.listdir(carpeta)):
        p = os.path.join(carpeta, d)
        if not os.path.isdir(p):
            continue
        imgs = sorted(f for f in os.listdir(p) if os.path.splitext(f)[1].lower() in C.EXTENSIONES_IMAGEN)
        r = {}
        for f in imgs:
            s = slug(os.path.splitext(f)[0])
            if s == k_prom:
                r["promedio"] = os.path.join(p, f)
            elif s == k_jug:
                r["jugador"] = os.path.join(p, f)
        otros = [f for f in imgs if slug(os.path.splitext(f)[0]) not in (k_prom, k_jug)]
        r["vs"] = [os.path.join(p, f) for f in otros]
        out[slug(d)] = r
    return out


def buscar(idx, *claves):
    for k in claves:
        if k and slug(k) in idx:
            return idx[slug(k)]
    return None


_MTIME_CODIGO = max(os.path.getmtime(os.path.join(BASE, f)) for f in ("build.py", "config.py"))


def al_dia(src, dst):
    return os.path.exists(dst) and os.path.getmtime(dst) >= max(os.path.getmtime(src), _MTIME_CODIGO)


def _mascara_jugador(im):
    """Máscara de lo que NO es fondo (transparente o blanco)."""
    rgba = np.asarray(im.convert("RGBA")).astype(np.int16)
    alfa = rgba[..., 3]
    if alfa.min() < 250:
        return alfa > 25
    rgb = rgba[..., :3]
    return (rgb.min(axis=2) < 232) | ((rgb.max(axis=2) - rgb.min(axis=2)) > 18)


def procesar_foto(src, dst):
    """Recorta al jugador y lo escala igual para todas las fotos (mismo alto, pegado abajo)."""
    if al_dia(src, dst):
        return
    im = ImageOps.exif_transpose(Image.open(src)).convert("RGBA")
    W, H = C.FOTO_TAMANO
    lienzo = Image.new("RGB", (W, H), (255, 255, 255))
    mask = _mascara_jugador(im)
    filas, cols = np.where(mask)
    if len(filas) < 50:
        plano = Image.new("RGB", im.size, (255, 255, 255))
        plano.paste(im, mask=im.split()[-1])
        ImageOps.fit(plano, (W, H), Image.LANCZOS, centering=(0.5, 0.2)).save(dst, "JPEG", quality=88)
        return
    original = im.crop((cols.min(), filas.min(), cols.max() + 1, filas.max() + 1))
    m0 = _mascara_jugador(original)
    banda = np.where(m0[int(original.height * 0.9):].any(axis=0))[0]
    ancho_hombros = (banda.max() - banda.min() + 1) if len(banda) else original.width
    esc = (cfg("FOTO_ALTO_JUGADOR", 0.86) * H) / original.height
    esc = max(esc, (W * 1.02) / ancho_hombros)
    sujeto = original.resize((max(1, round(original.width * esc)), max(1, round(original.height * esc))), Image.LANCZOS)
    m2 = _mascara_jugador(sujeto)
    cabeza = np.where(m2[: max(1, sujeto.height // 3)])[1]
    cx = cabeza.mean() if len(cabeza) else sujeto.width / 2
    hombros = np.where(m2[int(sujeto.height * 0.9):].any(axis=0))[0]
    x = round(W / 2 - cx)
    if len(hombros):
        x = min(x, -int(hombros.min()))
        x = max(x, W - int(hombros.max()) - 1)
    y = H - sujeto.height if sujeto.height <= H * 0.96 else round(H * 0.04)
    lienzo.paste(sujeto, (x, y), sujeto)
    lienzo.save(dst, "JPEG", quality=88, optimize=True)


def procesar_mapa(src, dst):
    if al_dia(src, dst):
        return
    im = ImageOps.exif_transpose(Image.open(src)).convert("RGBA")
    im.thumbnail((C.MAPA_LADO_MAX, C.MAPA_LADO_MAX), Image.LANCZOS)
    fondo = Image.new("RGB", im.size, (255, 255, 255))
    fondo.paste(im, mask=im.split()[-1])
    fondo.save(dst, "JPEG", quality=88, optimize=True)


def _quitar_fondo_liso(im):
    """Radar guardado sin transparencia: vuelve transparente el fondo liso que toca las orillas
    (el círculo de en medio y los gajos no se tocan)."""
    rgb = im.convert("RGB")
    W, H = rgb.size
    marca = (255, 0, 254)
    for xy in ((0, 0), (W - 1, 0), (0, H - 1), (W - 1, H - 1)):
        if rgb.getpixel(xy) != marca:
            ImageDraw.floodfill(rgb, xy, marca, thresh=10)
    a = np.asarray(rgb)
    fondo = (a[..., 0] == 255) & (a[..., 1] == 0) & (a[..., 2] == 254)
    out = np.asarray(im.convert("RGBA")).copy()
    out[fondo, 3] = 0
    return Image.fromarray(out, "RGBA")


def procesar_radar(src, dst):
    if al_dia(src, dst):
        return
    im = ImageOps.exif_transpose(Image.open(src)).convert("RGBA")
    if np.asarray(im)[..., 3].min() >= 250:
        im = _quitar_fondo_liso(im)
    caja = im.getchannel("A").point(lambda v: 255 if v > 20 else 0).getbbox()
    if caja:
        pad = round(0.01 * max(im.size))
        im = im.crop((max(0, caja[0] - pad), max(0, caja[1] - pad),
                      min(im.width, caja[2] + pad), min(im.height, caja[3] + pad)))
    im.thumbnail((C.RADAR_LADO_MAX, C.RADAR_LADO_MAX), Image.LANCZOS)
    im.save(dst, "PNG", optimize=True)


# ============================================================================= nombres completos
def cargar_nombres():
    """{slug(nombre Excel): nombre completo} de CARPETA_NOMBRES (NOMBRE EXCEL | NOMBRE COMPLETO)."""
    out = {}
    for path in leer_carpeta(cfg("CARPETA_NOMBRES", "datos/nombres"), (".xlsx", ".xlsm", ".xls", ".csv")):
        hojas = {"csv": pd.read_csv(path, dtype=object)} if path.lower().endswith(".csv") \
            else pd.read_excel(path, sheet_name=None, dtype=object)
        for hoja, df in hojas.items():
            if df.shape[1] < 2:
                continue
            cols = [str(c) for c in df.columns]
            c_comp = next((c for c in cols if "complet" in slug(c)), cols[1])
            c_exc = next((c for c in cols if c != c_comp), cols[0])
            n0 = len(out)
            for _, r in df.iterrows():
                k, v = r[c_exc], r[c_comp]
                if not es_vacio(k) and not es_vacio(v):
                    out[slug(k)] = re.sub(r"\s+", " ", str(v)).strip()
            print(f"  Nombres: {os.path.basename(path)} / {hoja}: {len(out) - n0}")
    return out


# ============================================================================= datos extra
def cargar_extra():
    """Excel(es) de CARPETA_EXTRA: 1a columna = nombre tal cual el Excel de Wyscout,
    las demás = datos que se pegan a ese jugador (se usan en config.py como cualquier columna).
    Devuelve {columna: {slug(nombre): (nombre, valor)}}."""
    out = {}
    for path in leer_carpeta(cfg("CARPETA_EXTRA", "datos/extra"), (".xlsx", ".xlsm", ".xls", ".csv")):
        hojas = {"csv": pd.read_csv(path, dtype=object)} if path.lower().endswith(".csv") \
            else pd.read_excel(path, sheet_name=None, dtype=object)
        for hoja, df in hojas.items():
            if df.shape[1] < 2:
                continue
            df.columns = [re.sub(r"\s+", " ", str(c)).strip() for c in df.columns]
            clave = df.columns[0]
            n = 0
            for _, r in df.iterrows():
                if es_vacio(r[clave]):
                    continue
                n += 1
                for c in df.columns[1:]:
                    if not es_vacio(r[c]):
                        out.setdefault(c, {})[slug(r[clave])] = (str(r[clave]).strip(), r[c])
            print(f"  Datos extra: {os.path.basename(path)} / {hoja}: {n} jugadores, columnas: {', '.join(df.columns[1:])}")
    return out


def pegar_extra(df, extra):
    """Agrega las columnas extra al Excel de la posición (por nombre del jugador)."""
    if not extra:
        return df
    df = df.copy()
    k = df[C.COL_JUGADOR].map(slug)
    for col, vals in extra.items():
        nuevos = k.map({s: v for s, (_, v) in vals.items()})
        df[col] = nuevos.combine_first(df[col]) if col in df.columns else nuevos
    return df


# ============================================================================= formatos
def traducir_pais(p, rep):
    p = str(p).strip()
    extra = cfg("TRADUCCION_PAISES", {}) or {}
    for d in (extra, PAISES):
        if p in d:
            return d[p]
    por_slug = {slug(k): v for d in (PAISES, extra) for k, v in d.items()}
    if slug(p) in por_slug:
        return por_slug[slug(p)]
    rep["paises"].append(p)
    return p


def fmt_dato(v, formato, posicion, rep):
    if formato == "posicion":
        return posicion
    if es_vacio(v):
        return None
    n = to_number(v)
    if formato == "edad":
        return None if math.isnan(n) else f"{int(n)} años"
    if formato == "cm":
        return None if math.isnan(n) else f"{int(round(n))} cm"
    if formato == "kg":
        return None if math.isnan(n) else f"{int(round(n))} kg"
    if formato == "pie":
        return {"right": "Derecho", "left": "Izquierdo", "both": "Ambidiestro"}.get(str(v).strip().lower(), str(v))
    if formato == "pais":
        return cfg("SEPARADOR_PAISES", " – ").join(traducir_pais(p, rep) for p in str(v).split(",") if p.strip())
    if formato == "fecha":
        if isinstance(v, (pd.Timestamp, datetime, date)):
            return v.strftime("%d/%m/%Y")
        try:
            return pd.to_datetime(str(v), dayfirst=False).strftime("%d/%m/%Y")
        except (ValueError, TypeError):
            return str(v)
    if formato == "dinero":
        if math.isnan(n):
            return None
        return f"€{n / 1e6:.1f} M".replace(".0 M", " M") if n >= 1e6 else f"€{n / 1e3:.0f} K"
    return str(v).strip()


def fmt_num(v, formato):
    if v is None or (isinstance(v, float) and (math.isnan(v) or math.isinf(v))):
        return "–"
    if formato == "entero":
        return f"{int(round(v))}"
    if formato == "pct":
        return f"{int(round(v))}%"
    if formato == "dec1":
        return f"{v:.1f}"
    return f"{v:.2f}"


# ============================================================================= Excel por posición
def posicion_de(stem):
    s = slug(stem)
    partes = set(s.split("_"))
    for claves, pos in cfg("POSICIONES", []):
        for k in claves:
            k = slug(k)
            if k == s or k in partes or ("_" in k and k in s):
                return pos
    return None


def leer_excel(path):
    df = pd.read_excel(path, sheet_name=C.HOJA_EXCEL, header=C.FILA_ENCABEZADO)
    cols, vistos = [], set()
    for c in df.columns:
        c = re.sub(r"\s+", " ", str(c)).strip()
        c = re.sub(r"\.\d+$", "", c) if re.sub(r"\.\d+$", "", c) in vistos else c   # pandas: "X.1"
        if c in vistos:
            c = cfg("PREFIJO_REPETIDAS", "GK_") + c
        vistos.add(c)
        cols.append(c)
    df.columns = cols
    if C.COL_JUGADOR not in df.columns:
        print(f"  [aviso] {os.path.basename(path)}: no trae la columna '{C.COL_JUGADOR}'; se omite")
        return None
    df = df[df[C.COL_JUGADOR].notna() & (df[C.COL_JUGADOR].astype(str).str.strip() != "")].reset_index(drop=True)
    return df


def stats_de(df, i, posicion, faltan):
    """[[etiqueta, arriba, abajo], ...] ya con formato (texto)."""
    def valor(col):
        if col not in df.columns:
            faltan.add(col)
            return None
        v = to_number(df.at[i, col])
        return None if math.isnan(v) else v

    out = []
    for etiqueta, arriba, abajo in cfg("ESTADISTICAS", {}).get(posicion, []):
        a = fmt_num(valor(arriba[0]), arriba[1]) if arriba else "–"
        b = fmt_num(valor(abajo[0]), abajo[1]) if abajo else None
        out.append([etiqueta, a, b])
    return out


# ============================================================================= main
def main():
    excels = leer_carpeta(C.CARPETA_EXCEL)
    if not excels:
        print(f"[ERROR] No hay archivos Excel en {ruta(C.CARPETA_EXCEL)}")
        sys.exit(1)
    for d in list(OUT_IMG.values()) + [os.path.dirname(OUT_DATA)]:
        os.makedirs(d, exist_ok=True)

    idx_fotos = indexar_imagenes(C.CARPETA_FOTOS)
    idx_mapas = indexar_imagenes(C.CARPETA_MAPAS)
    idx_radares = indexar_radares(C.CARPETA_RADARES)
    nombres = cargar_nombres()
    extra = cargar_extra()
    print(f"Fotos: {len(idx_fotos)}   Mapas: {len(idx_mapas)}   Carpetas de radares: {len(idx_radares)}   "
          f"Nombres completos: {len(nombres)}")

    rep = {k: [] for k in ("sin_posicion", "sin_nombre", "sin_foto", "sin_mapa", "sin_radar", "radar_extra",
                           "paises", "columnas", "repetidos", "extra_sin_jugador")}
    usados = set()
    orden_pos = [p for _, p in cfg("POSICIONES", [])]
    posiciones = {}

    for path in excels:
        stem = os.path.splitext(os.path.basename(path))[0]
        posicion = posicion_de(stem)
        if posicion is None:
            rep["sin_posicion"].append(os.path.basename(path))
            print(f"  [aviso] {os.path.basename(path)}: no sé qué posición es (revisa POSICIONES en config.py); se omite")
            continue
        df = leer_excel(path)
        if df is None:
            continue
        df = pegar_extra(df, extra)
        if posicion not in cfg("ESTADISTICAS", {}):
            print(f"  [aviso] '{posicion}' no tiene catálogo en ESTADISTICAS; su cuadro sale vacío")
        col_eq = C.COL_EQUIPO if C.COL_EQUIPO in df.columns else df.columns[1]
        faltan = set()
        pos = posiciones.setdefault(posicion, {"id": slug(posicion), "label": posicion, "archivos": [], "jugadores": []})
        pos["archivos"].append(os.path.basename(path))
        print(f"\n== {posicion}  ({os.path.basename(path)}) — {len(df)} jugadores")

        for i in df.index:
            nom_x = re.sub(r"\s+", " ", str(df.at[i, C.COL_JUGADOR])).strip()
            equipo = None if es_vacio(df.at[i, col_eq]) else str(df.at[i, col_eq]).strip()
            completo = nombres.get(slug(nom_x))
            if not completo:
                rep["sin_nombre"].append(f"[{posicion}] {nom_x}")
            pid = slug(nom_x)
            jid = slug(f"{nom_x} {equipo or ''}")
            if any(j["id"] == jid for j in pos["jugadores"]):
                rep["repetidos"].append(f"[{posicion}] {nom_x} ({equipo})")
                continue
            claves = (nom_x, completo)

            foto = mapa = None
            src = buscar(idx_fotos, *claves)
            if src:
                foto = f"img/fotos/{pid}.jpg"
                if foto not in usados:
                    procesar_foto(src, os.path.join(DOCS, foto))
                usados.add(foto)
            else:
                rep["sin_foto"].append(nom_x)
            src = buscar(idx_mapas, *claves)
            if src:
                mapa = f"img/mapas/{pid}.jpg"
                if mapa not in usados:
                    procesar_mapa(src, os.path.join(DOCS, mapa))
                usados.add(mapa)
            else:
                rep["sin_mapa"].append(nom_x)

            radares = []
            rr = buscar(idx_radares, *claves) or {}
            # orden en la ficha: jugador, promedio (siempre 2o), vs...
            fuentes = ([("jugador", rr["jugador"])] if rr.get("jugador") else []) \
                + ([("promedio", rr["promedio"])] if rr.get("promedio") else []) \
                + [(f"vs{k + 1}", s) for k, s in enumerate(rr.get("vs", []))]
            if not rr:
                rep["sin_radar"].append(f"{nom_x}: no hay carpeta de radares")
            else:
                for tipo, nombre in (("jugador", "jugador.png"), ("promedio", "promedio.png")):
                    if not rr.get(tipo):
                        rep["sin_radar"].append(f"{nom_x}: falta {nombre}")
            maxr = cfg("MAX_RADARES", 4)
            if len(fuentes) > maxr:
                rep["radar_extra"].append(f"{nom_x}: {len(fuentes)} radares, se usan {maxr}; se ignoraron "
                                          + ", ".join(os.path.basename(s) for _, s in fuentes[maxr:]))
                fuentes = fuentes[:maxr]
            for tipo, src in fuentes:
                dst = f"img/radares/{pid}_{tipo}.png"
                if dst not in usados:
                    procesar_radar(src, os.path.join(DOCS, dst))
                usados.add(dst)
                radares.append(dst)

            datos = []
            for etiqueta, col, formato in cfg("DATOS_GENERALES", []):
                v = df.at[i, col] if col and col in df.columns else None
                if col and col not in df.columns:
                    faltan.add(col)
                datos.append([etiqueta, fmt_dato(v, formato, posicion, rep)])

            minutos = to_number(df.at[i, C.COL_MINUTOS]) if C.COL_MINUTOS in df.columns else np.nan
            pos["jugadores"].append({
                "id": jid,
                "nombre": completo or nom_x,
                "nombreExcel": nom_x,
                "equipo": equipo,
                "posicion": posicion,
                "posWyscout": None if C.COL_POSICION_WYSCOUT not in df.columns or es_vacio(df.at[i, C.COL_POSICION_WYSCOUT])
                else str(df.at[i, C.COL_POSICION_WYSCOUT]).strip(),
                "minutos": 0 if math.isnan(minutos) else int(minutos),
                "datos": datos,
                "stats": stats_de(df, i, posicion, faltan),
                "foto": foto,
                "mapa": mapa,
                "radares": radares,
            })
        for c in sorted(faltan):
            rep["columnas"].append(f"[{os.path.basename(path)}] {c}")
            print(f"  [aviso] columna que no viene en el Excel: {c}")

    todos = {slug(j["nombreExcel"]) for p in posiciones.values() for j in p["jugadores"]}
    for col, vals in extra.items():
        for k, (nombre, _) in vals.items():
            if k not in todos:
                rep["extra_sin_jugador"].append(nombre)
    lista = sorted(posiciones.values(), key=lambda p: (orden_pos.index(p["label"]) if p["label"] in orden_pos else 99, p["label"]))
    for p in lista:
        p["jugadores"].sort(key=lambda j: slug(j["nombre"]))

    # borrar imágenes que ya no se usan
    for sub, d in OUT_IMG.items():
        for f in os.listdir(d):
            if not f.startswith(".") and os.path.isfile(os.path.join(d, f)) and f"img/{sub}/{f}" not in usados:
                os.remove(os.path.join(d, f))

    payload = {
        "generado": datetime.now().strftime("%d/%m/%Y %H:%M"),
        "posiciones": lista,
    }
    with open(OUT_DATA, "w", encoding="utf-8") as f:
        f.write("window.FICHAS = ")
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")

    # Obliga al navegador a bajar la versión nueva de los .js (evita caché)
    idx = os.path.join(DOCS, "index.html")
    html = open(idx, encoding="utf-8").read()
    html = re.sub(r'src="((?:data/fichas|informe|app)\.js)(?:\?v=\d+)?"',
                  lambda m: f'src="{m.group(1)}?v={datetime.now():%Y%m%d%H%M%S}"', html)
    with open(idx, "w", encoding="utf-8") as f:
        f.write(html)

    titulos = {
        "sin_posicion": "Archivos que no se reconocen como posición (revisa POSICIONES en config.py)",
        "repetidos": "Jugadores repetidos en el mismo archivo (se tomó el primero)",
        "columnas": "Columnas que pide config.py y no vienen en el Excel",
        "paises": "Países sin traducir (agrégalos en TRADUCCION_PAISES de config.py)",
        "sin_nombre": "Sin nombre completo (se usa el del Excel)",
        "sin_foto": "Sin foto",
        "sin_mapa": "Sin mapa de calor",
        "sin_radar": "Radares faltantes",
        "radar_extra": "Carpetas con más radares del máximo (MAX_RADARES)",
        "extra_sin_jugador": "Nombres en los Excel de datos extra que no están en ningún Excel de posición",
    }
    with open(REPORTE, "w", encoding="utf-8") as f:
        f.write(f"Reporte de actualización — {payload['generado']}\n")
        for k, t in titulos.items():
            items = sorted(set(rep[k]))
            f.write(f"\n=== {t}: {len(items)}\n" + "".join(f"  - {x}\n" for x in items))

    n = sum(len(p["jugadores"]) for p in lista)
    print(f"\nListo -> {os.path.relpath(OUT_DATA, BASE)}  ({n} fichas en {len(lista)} posiciones, "
          f"{os.path.getsize(OUT_DATA) / 1024:.0f} KB)")
    for k in ("sin_posicion", "columnas", "paises", "sin_nombre", "sin_foto", "sin_mapa", "sin_radar"):
        if rep[k]:
            print(f"  {titulos[k].split(' (')[0]}: {len(set(rep[k]))}")
    print("  Detalle en reporte_build.txt")


if __name__ == "__main__":
    main()
