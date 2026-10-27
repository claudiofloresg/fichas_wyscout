# -*- coding: utf-8 -*-
"""
radares.py — genera los radares de cada ficha automáticamente (mismo cálculo y estilo que radar_wyscout.ipynb)
===========================================================================================================
Lo usa build.py cuando existe la lista de fichas. No hace falta correrlo a mano.

Por cada ficha (fila de la lista) genera:
  jugador   -> radar individual: percentil del jugador vs su posición en SU liga
  promedio  -> jugador vs distribución de la liga de referencia (Liga MX)
  vs1, vs2  -> comparativo vs jugador(es) de Pumas (z-score), "Comparar con 1/2"

Los radares se guardan en docs/img/radares/ y solo se recalculan si cambió algo
(los datos de esas ligas, la fila de la lista o este archivo).

Cambios respecto al notebook (para que nunca truene):
  - Si el jugador no pasa el filtro de minutos o juega en otra posición, igual se le
    calcula su radar contra la muestra filtrada (el notebook marcaba "no se encontró").
  - Si hay dos jugadores con el mismo nombre en la liga, se toma el de más minutos.
"""
import hashlib
import json
import os
import re
import unicodedata

import numpy as np
import pandas as pd

# Las librerías de dibujo se cargan solo si se van a dibujar radares (leer la base no las necesita).
plt = PyPizza = fig_text = FONT_NORMAL = FONT_BOLD = FONT_ITALIC = None


def disponible():
    """None si se pueden dibujar radares; si no, el error (falta mplsoccer, etc.)."""
    global plt, PyPizza, fig_text, FONT_NORMAL, FONT_BOLD, FONT_ITALIC
    if PyPizza is not None:
        return None
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as _plt
        from matplotlib import font_manager
        from mplsoccer import PyPizza as _PyPizza
        from highlight_text import fig_text as _fig_text
    except ImportError as e:
        return str(e)
    plt, PyPizza, fig_text = _plt, _PyPizza, _fig_text
    FONT_NORMAL = font_manager.FontProperties(family="sans-serif", size=12)
    FONT_BOLD = font_manager.FontProperties(family="sans-serif", weight="bold", size=15)
    FONT_ITALIC = font_manager.FontProperties(family="sans-serif", style="italic", size=10)
    return None


VERSION = "radares-2"          # súbelo si cambias cálculos o estilo: fuerza a regenerar todos

CREDITO = 'Elaborado por Inteligencia Deportiva "Pumas"'
# Factor de nivel de liga (solo radares contra Liga MX). La clave se busca dentro del nombre de la hoja
# (sin acentos ni mayúsculas): "u21" vale para "Liga MX U21" y "Liga MX U21 - 2526". Las demás ligas = 1.
FACTOR_LIGA = {"u21": 0.8, "expansion": 0.8}
# Métricas que NO se ajustan: porcentajes y las de portero donde menos es mejor
SIN_AJUSTE = ("%", "against", "conceded", "prevented", "clean sheets")

MIN_MINUTOS_TOTALES = 1000
MIN_MINUTOS_PROMEDIO = 50
DPI = 200

# Posición de la ficha -> posición del catálogo de radares (las que no estén aquí se usan igual)
POSICION_RADAR = {
    "Contención": "Mediocampista",
    "Contencion": "Mediocampista",
    "Volante": "Mediocampista",
    "Mediocampista": "Mediocampista",
    "Central": "Defensa Central",
}


# ============================================================================= catálogo (copiado del notebook)
MAPEO_POSICIONES = {'AMF': 'Mediocampista',
 'RAMF': 'Mediocampista',
 'LAMF': 'Mediocampista',
 'CMF': 'Mediocampista',
 'LCMF': 'Mediocampista',
 'RCMF': 'Mediocampista',
 'DMF': 'Mediocampista',
 'RDMF': 'Mediocampista',
 'LDMF': 'Mediocampista',
 'CF': 'Delantero',
 'LW': 'Extremo',
 'RW': 'Extremo',
 'LWF': 'Extremo',
 'RWF': 'Extremo',
 'CB': 'Defensa Central',
 'LCB': 'Defensa Central',
 'RCB': 'Defensa Central',
 'LB': 'Lateral',
 'RB': 'Lateral',
 'LWB': 'Lateral',
 'RWB': 'Lateral',
 'GK': 'Portero'}

NOMBRES_DISPLAY = {'Goals per 90': 'Goles',
 'xG per 90': 'xG',
 'Non-penalty goals per 90': 'Goles sin\nPenal',
 'Head goals per 90': 'Goles de\nCabeza',
 'Goal conversion, %': 'Conversión\nde Gol',
 'Shots per 90': 'Tiros',
 'Assists per 90': 'Asistencias',
 'xA per 90': 'xA',
 'Successful attacking actions per 90': 'Acciones Ataque\nExitosas',
 'Dribbles per 90': 'Regates',
 'Progressive runs per 90': 'Carreras\nProgresivas',
 'Accelerations per 90': 'Aceleraciones',
 'Touches in box per 90': 'Toques en\nÁrea',
 'Offensive duels per 90': 'Duelos\nOfensivos',
 'Received passes per 90': 'Pases\nRecibidos',
 'Received long passes per 90': 'Pases Largos\nRecibidos',
 'Fouls suffered per 90': 'Faltas\nRecibidas',
 'Crosses per 90': 'Centros',
 'Crosses from left flank per 90': 'Centros Banda\nIzquierda',
 'Crosses from right flank per 90': 'Centros Banda\nDerecha',
 'Deep completed crosses per 90': 'Centros\nÚlt. 20m',
 'Key passes per 90': 'Pases\nClave',
 'Passes per 90': 'Pases',
 'Forward passes per 90': 'Pases\nAdelante',
 'Back passes per 90': 'Pases\nAtrás',
 'Short / medium passes per 90': 'Pases Corto/\nMedio',
 'Long passes per 90': 'Pases\nLargos',
 'Smart passes per 90': 'Pases\nInteligentes',
 'Through passes per 90': 'Pases al\nEspacio',
 'Passes to final third per 90': 'Pases\nÚlt. Tercio',
 'Passes to penalty area per 90': 'Pases al\nÁrea',
 'Progressive passes per 90': 'Pases\nProgresivos',
 'Duels per 90': 'Duelos',
 'Defensive duels per 90': 'Duelos\nDefensivos',
 'Successful defensive actions per 90': 'Acciones Defensa\nExitosas',
 'Aerial duels per 90': 'Duelos Aéreos',
 'Sliding tackles per 90': 'Entradas\nIntentadas',
 'Shots blocked per 90': 'Tiros\nBloqueados',
 'Interceptions per 90': 'Intercepciones\n(bruto)',
 'PAdj Sliding tackles': 'Entradas',
 'PAdj Interceptions': 'Intercepciones',
 'Conceded goals per 90': 'Goles\nRecibidos',
 'Shots against per 90': 'Tiros\nRecibidos',
 'Clean sheets': 'Porterías\nen Cero',
 'xG against per 90': 'xG en\nContra',
 'Prevented goals per 90': 'Goles\nEvitados',
 'Back passes received as GK per 90': 'Pases Atrás\nRecibidos',
 'Exits per 90': 'Salidas',
 'GK_Aerial duels per 90': 'Duelos Aéreos\n(Portero)',
 'Shot assists per 90': 'Asistencias\na Tiro'}

METRICAS_POR_POSICION = {'Portero': ['Conceded goals per 90',
             'xG against per 90',
             'Prevented goals per 90',
             'Shots against per 90',
             'Clean sheets',
             'Exits per 90',
             'GK_Aerial duels per 90',
             'Back passes received as GK per 90',
             'Passes per 90',
             'Long passes per 90',
             'Short / medium passes per 90',
             'Received passes per 90'],
 'Defensa Central': ['PAdj Sliding tackles',
                     'Head goals per 90',
                     'Duels per 90',
                     'Received passes per 90',
                     'Fouls suffered per 90',
                     'Passes to final third per 90',
                     'Long passes per 90',
                     'Passes per 90',
                     'Forward passes per 90',
                     'Progressive passes per 90',
                     'Successful defensive actions per 90',
                     'Defensive duels per 90',
                     'Aerial duels per 90',
                     'PAdj Interceptions',
                     'Shots blocked per 90'],
 'Lateral': ['Crosses per 90',
             'Progressive runs per 90',
             'Offensive duels per 90',
             'Successful attacking actions per 90',
             'Received long passes per 90',
             'xA per 90',
             'Progressive passes per 90',
             'Passes to final third per 90',
             'Shot assists per 90',
             'Deep completed crosses per 90',
             'Successful defensive actions per 90',
             'Defensive duels per 90',
             'Aerial duels per 90',
             'PAdj Interceptions',
             'PAdj Sliding tackles'],
 'Mediocampista': ['Offensive duels per 90',
                   'Progressive runs per 90',
                   'Fouls suffered per 90',
                   'Passes to penalty area per 90',
                   'Received passes per 90',
                   'Long passes per 90',
                   'xA per 90',
                   'Assists per 90',
                   'Progressive passes per 90',
                   'Through passes per 90',
                   'Successful defensive actions per 90',
                   'Defensive duels per 90',
                   'Aerial duels per 90',
                   'PAdj Interceptions',
                   'PAdj Sliding tackles'],
 'Extremo': ['xG per 90',
             'Dribbles per 90',
             'Progressive runs per 90',
             'Assists per 90',
             'Received long passes per 90',
             'xA per 90',
             'Crosses per 90',
             'Forward passes per 90',
             'Back passes per 90',
             'Offensive duels per 90',
             'Successful defensive actions per 90',
             'Defensive duels per 90',
             'Aerial duels per 90',
             'PAdj Interceptions',
             'PAdj Sliding tackles'],
 'Delantero': ['Goals per 90',
               'xG per 90',
               'Dribbles per 90',
               'Offensive duels per 90',
               'Received long passes per 90',
               'xA per 90',
               'Assists per 90',
               'Passes to penalty area per 90',
               'Progressive runs per 90',
               'Progressive passes per 90',
               'Successful defensive actions per 90',
               'Defensive duels per 90',
               'Aerial duels per 90',
               'PAdj Interceptions',
               'PAdj Sliding tackles']}



def configurar(cfg):
    """Permite sobreescribir constantes desde config.py (RADAR_MIN_MINUTOS, RADAR_CREDITO, ...)."""
    global MIN_MINUTOS_TOTALES, MIN_MINUTOS_PROMEDIO, CREDITO, DPI, FACTOR_LIGA
    FACTOR_LIGA = dict(cfg("FACTOR_LIGA", FACTOR_LIGA) or {})
    MIN_MINUTOS_TOTALES = cfg("RADAR_MIN_MINUTOS", MIN_MINUTOS_TOTALES)
    MIN_MINUTOS_PROMEDIO = cfg("RADAR_MIN_MINUTOS_PARTIDO", MIN_MINUTOS_PROMEDIO)
    CREDITO = cfg("RADAR_CREDITO", CREDITO)
    DPI = cfg("RADAR_DPI", DPI)
    POSICION_RADAR.update(cfg("POSICION_RADAR", {}) or {})
    NOMBRES_DISPLAY.update(cfg("RADAR_NOMBRES_DISPLAY", {}) or {})
    for pos, mets in (cfg("RADAR_METRICAS", {}) or {}).items():
        METRICAS_POR_POSICION[pos] = list(mets)


def _slug(t):
    t = unicodedata.normalize("NFKD", str(t)).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "_", t.lower()).strip("_")


def posicion_radar(posicion_ficha):
    p = POSICION_RADAR.get(posicion_ficha, posicion_ficha)
    for k in METRICAS_POR_POSICION:                     # tolera mayúsculas / acentos
        if _slug(k) == _slug(p):
            return k
    return None


# ============================================================================= base de datos
COLUMNAS_TEXTO = {"Player", "Team", "Team within selected timeframe", "Position", "Birth country",
                  "Passport country", "Foot", "On loan", "Contract expires", "Birthday"}


def limpiar_hoja(df):
    """Igual que cargar_liga() del notebook: limpia encabezados y convierte decimales con coma.
    La 2a columna repetida (Aerial duels per 90 del portero) se llama GK_<columna>."""
    cols, vistos = [], set()
    for c in df.columns:
        c = re.sub(r"\s+", " ", str(c)).strip()
        base = re.sub(r"\.\d+$", "", c)
        cols.append("GK_" + base if base in vistos else base)
        vistos.add(base)
    df = df.copy()
    df.columns = cols
    for col in df.columns:
        if col in COLUMNAS_TEXTO or df[col].dtype != object:
            continue
        conv = pd.to_numeric(df[col].astype(str).str.replace(",", ".", regex=False).str.strip(), errors="coerce")
        if conv.notna().sum() >= df[col].notna().sum() * 0.8:
            df[col] = conv
    if "Player" in df.columns:
        df = df[df["Player"].notna() & (df["Player"].astype(str).str.strip() != "")]
        df["Player"] = df["Player"].astype(str).str.strip()
    return df.reset_index(drop=True)


def preparar_posiciones(df):
    df = df.copy()
    df["Posiciones_divididas"] = df["Position"].astype(str).str.split(",")
    df = df.explode("Posiciones_divididas")
    df["Posiciones_divididas"] = df["Posiciones_divididas"].str.strip()
    df["Posiciones_mapeadas"] = df["Posiciones_divididas"].map(lambda x: MAPEO_POSICIONES.get(x, x))
    return df.drop_duplicates(subset=["Player", "Posiciones_mapeadas"])


def filtro_minutos(df):
    m = pd.to_numeric(df["Minutes played"], errors="coerce").fillna(0)
    p = pd.to_numeric(df["Matches played"], errors="coerce").replace(0, np.nan)
    return df[(m >= MIN_MINUTOS_TOTALES) & ((m / p) >= MIN_MINUTOS_PROMEDIO)]


class Base:
    """Data Wyscout 26-27.xlsx: una hoja por liga."""

    def __init__(self, ruta):
        crudo = pd.read_excel(ruta, sheet_name=None)
        self.hojas = {}
        for nombre, df in crudo.items():
            df = limpiar_hoja(df)
            if "Player" in df.columns:
                self.hojas[str(nombre).strip()] = df
        self._por_slug = {_slug(k): k for k in self.hojas}
        self._hash = {}

    def liga(self, nombre):
        """Nombre real de la hoja (tolera mayúsculas / acentos / espacios)."""
        return self._por_slug.get(_slug(nombre))

    def jugador(self, liga, jugador, equipo_contiene=None):
        """Fila del jugador en esa liga (si hay varios, el de más minutos)."""
        df = self.hojas[liga]
        m = df[df["Player"].map(_slug) == _slug(jugador)]
        if equipo_contiene:
            m2 = m[m["Team"].astype(str).map(_slug).str.contains(_slug(equipo_contiene), regex=False)]
            m = m2 if len(m2) else m
        if m.empty:
            return None
        return m.loc[pd.to_numeric(m["Minutes played"], errors="coerce").fillna(0).idxmax()]

    def poblacion(self, liga, pos_radar):
        """Muestra de comparación: jugadores de esa posición con los minutos mínimos."""
        df = preparar_posiciones(self.hojas[liga])
        df = filtro_minutos(df)
        return df[df["Posiciones_mapeadas"] == pos_radar]

    def huella(self, liga):
        if liga not in self._hash:
            self._hash[liga] = str(int(pd.util.hash_pandas_object(self.hojas[liga], index=False).sum()))
        return self._hash[liga]


def _con_jugador(pob, fila):
    """La muestra + el jugador (si no estaba por minutos/posición), sin duplicarlo."""
    if fila is None:
        return pob
    esta = ((pob["Player"] == fila["Player"]) & (pob["Team"] == fila["Team"])).any()
    return pob if esta else pd.concat([pob, fila.to_frame().T], ignore_index=True)


def _valor(fila, m):
    v = pd.to_numeric(pd.Series([fila.get(m)]), errors="coerce").iloc[0]
    return np.nan if pd.isna(v) else float(v)


def factor_liga(liga):
    s = _slug(liga)
    for k, v in FACTOR_LIGA.items():
        if _slug(k) and _slug(k) in s:
            return float(v)
    return 1.0


def _ajustable(m):
    return not any(x in m.lower() for x in SIN_AJUSTE)


def _ajustar(df, metricas, f):
    """Copia de df con las métricas ajustables multiplicadas por el factor de la liga."""
    if f == 1:
        return df
    df = df.copy()
    for m in metricas:
        if m in df.columns and _ajustable(m):
            df[m] = pd.to_numeric(df[m], errors="coerce") * f
    return df


def _nota_ajuste(*ligas):
    partes = [f"{l} ×{factor_liga(l):g}" for l in dict.fromkeys(ligas) if factor_liga(l) != 1]
    return ("Ajuste por nivel de liga (métricas por 90): " + ", ".join(partes)) if partes else None


# ============================================================================= dibujo (idéntico al notebook)
def _colores_por_tercios(n):
    base = ["#1A78CF", "#FF9300", "#D70232"]
    tercio = int(np.ceil(n / 3))
    colores = []
    for color in base:
        colores += [color] * tercio
    return colores[:n]


def _pizza_comparativa(nombres, v1, v2, titulo, subtitulo, nota=None):
    baker = PyPizza(
        params=nombres, background_color="#EBEBE9", straight_line_color="#222222", straight_line_lw=1,
        last_circle_lw=1, last_circle_color="#222222", other_circle_ls="-.", other_circle_lw=1,
    )
    fig, ax = baker.make_pizza(
        v1, compare_values=v2, figsize=(9, 9),
        kwargs_slices=dict(facecolor="#1A78CF", edgecolor="#222222", zorder=2, linewidth=1),
        kwargs_compare=dict(facecolor="#FF9300", edgecolor="#222222", zorder=2, linewidth=1),
        kwargs_params=dict(color="#000000", fontsize=11, fontproperties=FONT_NORMAL, va="center"),
        kwargs_values=dict(color="#000000", fontsize=9, fontproperties=FONT_NORMAL, zorder=3,
                           bbox=dict(edgecolor="#000000", facecolor="cornflowerblue", boxstyle="round,pad=0.2", lw=1)),
        kwargs_compare_values=dict(color="#000000", fontsize=9, fontproperties=FONT_NORMAL, zorder=3,
                                   bbox=dict(edgecolor="#000000", facecolor="#FF9300", boxstyle="round,pad=0.2", lw=1)),
    )
    fig_text(0.515, 0.99, titulo, size=17, fig=fig, highlight_textprops=[{"color": "#1A78CF"}, {"color": "#EE8900"}],
             ha="center", fontproperties=FONT_BOLD, color="#000000")
    fig.text(0.515, 0.945, subtitulo, size=14, ha="center", fontproperties=FONT_BOLD, color="#000000")
    pie_y = 0.02
    if nota:
        fig.text(0.99, pie_y, nota, size=8, fontproperties=FONT_ITALIC, color="#000000", ha="right", va="bottom")
        pie_y += 0.015 * (nota.count("\n") + 1)
    fig.text(0.99, pie_y, CREDITO, size=9, fontproperties=FONT_ITALIC, color="#000000", ha="right", va="bottom")
    return fig


def _guardar(fig, ruta):
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    fig.savefig(ruta, dpi=DPI, bbox_inches="tight", transparent=True)
    plt.close(fig)


def radar_individual(base, fila, liga, pos_radar, ruta):
    metricas = METRICAS_POR_POSICION[pos_radar]
    nombres = [NOMBRES_DISPLAY.get(m, m) for m in metricas]
    pob = _con_jugador(base.poblacion(liga, pos_radar), fila)
    valores = []
    for m in metricas:
        serie = pd.to_numeric(pob[m], errors="coerce") if m in pob.columns else pd.Series(dtype=float)
        rank = serie.rank(pct=True) * 100
        sel = rank[(pob["Player"] == fila["Player"]).values & (pob["Team"] == fila["Team"]).values]
        v = sel.iloc[0] if len(sel) else np.nan
        valores.append(0 if pd.isna(v) else int(round(v)))
    colores = _colores_por_tercios(len(metricas))
    baker = PyPizza(params=nombres, background_color="#EBEBE9", straight_line_color="#EBEBE9", straight_line_lw=1,
                    last_circle_lw=0, other_circle_lw=0, inner_circle_size=20)
    fig, ax = baker.make_pizza(
        valores, figsize=(8, 8.5), color_blank_space="same", slice_colors=colores,
        value_colors=["#000000"] * len(metricas), value_bck_colors=colores, blank_alpha=0.4,
        kwargs_slices=dict(edgecolor="#F2F2F2", zorder=2, linewidth=1),
        kwargs_params=dict(color="#000000", fontsize=11, va="center", zorder=2.5),
        kwargs_values=dict(color="#000000", fontsize=11, fontweight="bold", zorder=3,
                           bbox=dict(edgecolor="#000000", facecolor="cornflowerblue", boxstyle="round,pad=0.2", lw=1)),
    )
    fig.text(0.515, 0.975, f"{fila['Player']} - {fila['Team']}", size=16, ha="center", color="#000000")
    fig.text(0.515, 0.953, f"{liga} | Percentil por Posición ({pos_radar})", size=13, ha="center", color="#000000")
    fig.text(0.34, 0.925, "Ofensiva      Posesión      Defensiva", size=14, color="#000000")
    fig.patches.extend([
        plt.Rectangle((0.31, 0.9225), 0.025, 0.021, fill=True, color="#1a78cf", transform=fig.transFigure, figure=fig),
        plt.Rectangle((0.462, 0.9225), 0.025, 0.021, fill=True, color="#ff9300", transform=fig.transFigure, figure=fig),
        plt.Rectangle((0.615, 0.9225), 0.025, 0.021, fill=True, color="#d70232", transform=fig.transFigure, figure=fig),
    ])
    fig.text(0.99, 0.02, f"NOTA: Percentiles calculados por posición\n{CREDITO}", size=9, ha="right", color="#000000")
    _guardar(fig, ruta)


def radar_vs_referencia(base, fila, liga, liga_ref, pos_radar, ruta):
    metricas = METRICAS_POR_POSICION[pos_radar]
    nombres = [NOMBRES_DISPLAY.get(m, m) for m in metricas]
    ref = _ajustar(base.poblacion(liga_ref, pos_radar), metricas, factor_liga(liga_ref))
    fila = _ajustar(fila.to_frame().T, metricas, factor_liga(liga)).iloc[0]
    valores = []
    for m in metricas:
        dist = pd.to_numeric(ref[m], errors="coerce").dropna() if m in ref.columns else pd.Series(dtype=float)
        v = _valor(fila, m)
        p = 50 if len(dist) == 0 or np.isnan(v) else (dist < v).mean() * 100
        valores.append(int(round(p, 0)))
    nota = f"Muestra de referencia: >{MIN_MINUTOS_TOTALES} min totales y >{MIN_MINUTOS_PROMEDIO} min/partido"
    if _nota_ajuste(liga, liga_ref):
        nota = _nota_ajuste(liga, liga_ref) + "\n" + nota
    fig = _pizza_comparativa(nombres, valores, [50] * len(metricas),
                             f"<{fila['Player']}> vs <Promedio {liga_ref}>",
                             f"{liga} vs Distribución {liga_ref} | {pos_radar}", nota=nota)
    _guardar(fig, ruta)


def radar_comparativo(base, fila1, liga1, fila2, liga2, pos_radar, ruta):
    metricas = METRICAS_POR_POSICION[pos_radar]
    nombres = [NOMBRES_DISPLAY.get(m, m) for m in metricas]
    # cada liga con su factor (la muestra completa y el jugador, para que el promedio también se ajuste)
    f1, f2 = factor_liga(liga1), factor_liga(liga2)
    glob = pd.concat([_ajustar(_con_jugador(base.poblacion(liga1, pos_radar), fila1), metricas, f1),
                      _ajustar(_con_jugador(base.poblacion(liga2, pos_radar), fila2), metricas, f2)], ignore_index=True)
    fila1 = _ajustar(fila1.to_frame().T, metricas, f1).iloc[0]
    fila2 = _ajustar(fila2.to_frame().T, metricas, f2).iloc[0]
    cols = [m for m in metricas if m in glob.columns]
    num = glob[cols].apply(pd.to_numeric, errors="coerce")
    media, std = num.mean(), num.std().replace(0, 1)

    def escala(fila):
        out = []
        for m in metricas:
            v = _valor(fila, m)
            z = 0 if (m not in cols or np.isnan(v) or pd.isna(media.get(m))) else (v - media[m]) / std[m]
            out.append(int(round(float(np.clip(50 + z * 15, 0, 100)))))
        return out

    fig = _pizza_comparativa(nombres, escala(fila1), escala(fila2),
                             f"<{fila1['Player']}> vs <{fila2['Player']}>",
                             f"{liga1} vs {liga2} | {pos_radar}", nota=_nota_ajuste(liga1, liga2))
    _guardar(fig, ruta)


# ============================================================================= orquestación con caché
def generar(base, ficha, carpeta, prefijo, cache, procesar=None):
    """ficha: dict con id, liga, posicion, comparar (lista de IDs Pumas), liga_ref, equipo_pumas.
    Devuelve ([(tipo, ruta)], [avisos]). `procesar(ruta)` se aplica a cada PNG nuevo (recorte, tamaño)."""
    avisos = []
    pos_radar = posicion_radar(ficha["posicion"])
    if not pos_radar:
        return [], [f"la posición '{ficha['posicion']}' no tiene catálogo de radar (POSICION_RADAR)"]
    liga, liga_ref = base.liga(ficha["liga"]), base.liga(ficha["liga_ref"])
    if not liga:
        return [], [f"no existe la hoja '{ficha['liga']}' en la base de datos"]
    if not liga_ref:
        return [], [f"no existe la hoja de referencia '{ficha['liga_ref']}' en la base de datos"]
    fila = base.jugador(liga, ficha["id"], ficha.get("equipo"))
    if fila is None:
        return [], [f"'{ficha['id']}' no está en la hoja '{liga}'"]
    rivales = []
    for cid in ficha["comparar"]:
        f2 = base.jugador(liga_ref, cid, ficha.get("equipo_pumas"))
        if f2 is None:
            avisos.append(f"'{cid}' (comparar con) no está en '{liga_ref}'")
        else:
            rivales.append(f2)

    error = disponible()
    if error:
        return [], [f"no se pueden dibujar radares: {error}"]
    clave = hashlib.sha1(json.dumps([
        ficha.get("clave_extra"), VERSION, FACTOR_LIGA, list(SIN_AJUSTE), CREDITO, MIN_MINUTOS_TOTALES, MIN_MINUTOS_PROMEDIO, DPI, METRICAS_POR_POSICION[pos_radar],
        ficha["id"], liga, liga_ref, pos_radar, [str(r["Player"]) for r in rivales],
        base.huella(liga), base.huella(liga_ref),
    ], default=str).encode()).hexdigest()

    salidas = [("jugador", lambda r: radar_individual(base, fila, liga, pos_radar, r)),
               ("promedio", lambda r: radar_vs_referencia(base, fila, liga, liga_ref, pos_radar, r))]
    for k, f2 in enumerate(rivales, 1):
        salidas.append((f"vs{k}", lambda r, f2=f2: radar_comparativo(base, fila, liga, f2, liga_ref, pos_radar, r)))

    rutas = [(t, os.path.join(carpeta, f"{prefijo}_{t}.png")) for t, _ in salidas]
    if cache.get(prefijo) == clave and all(os.path.exists(r) for _, r in rutas):
        return rutas, avisos                                 # nada cambió: se reutilizan
    for (tipo, fn), (_, ruta) in zip(salidas, rutas):
        fn(ruta)
        if procesar:
            procesar(ruta)
    cache[prefijo] = clave
    return rutas, avisos
