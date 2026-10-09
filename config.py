# -*- coding: utf-8 -*-
"""
config.py — TODO lo que se edita a mano vive aquí.
=====================================================

1) RUTAS de tu computadora (Excel por posición, fotos, mapas, radares, nombres).
2) Qué archivo es qué posición.
3) DATOS GENERALES que salen junto a la foto.
4) CATÁLOGO DE ESTADÍSTICAS por posición (cuadro superior derecho de la ficha).

Después de editar, corre  actualizar.bat  (Windows) o  ./actualizar.sh  (Mac/Linux).
"""

# =============================================================================
# 1) RUTAS
# =============================================================================
# Puedes usar rutas absolutas de tu compu, p. ej.:
#   CARPETA_EXCEL = r"C:\Users\claudio\Drive\Scouting 26-27\Fichas"
CARPETA_EXCEL = r"C:\Users\Servicio Social\fichas_wyscout\datos\excel"        # un .xlsx por posición: delantero.xlsx, central.xlsx...
CARPETA_FOTOS = r"C:\Users\Servicio Social\fichas_wyscout\datos\fotos"        # A. Bertaccini.png      (nombre tal cual viene en el Excel)
CARPETA_MAPAS = r"C:\Users\Servicio Social\fichas_wyscout\datos\mapas"        # A. Bertaccini.png
CARPETA_RADARES = r"C:\Users\Servicio Social\fichas_wyscout\datos\radar"      # A. Bertaccini/promedio.png, jugador.png, <vs>.png
CARPETA_NOMBRES = r"C:\Users\Servicio Social\fichas_wyscout\datos\nombres"    # nombres.xlsx:  NOMBRE EXCEL | NOMBRE COMPLETO
CARPETA_EXTRA = r"C:\Users\Servicio Social\fichas_wyscout\datos\stats_manuales"

# Hoja y fila del encabezado del Excel de Wyscout (fila 1 => 0)
HOJA_EXCEL = 0
FILA_ENCABEZADO = 0

# =============================================================================
# 2) POSICIONES  (archivo -> posición)
# =============================================================================
# Se compara el nombre del archivo (sin .xlsx, sin acentos ni mayúsculas).
# "delantero.xlsx", "Delanteros.xlsx", "Delantero J1-J10.xlsx" -> Delantero
# El orden de esta lista es el orden en que salen en la página.
POSICIONES = [
    # (texto en el nombre del archivo,          posición en la ficha)
    (["portero", "porteros", "arquero"],             "Portero"),
    (["central", "centrales", "defensa_central"],    "Defensa Central"),
    (["lateral", "laterales"],                       "Lateral"),
    (["mediocampista", "medio", "medios", "volante"], "Mediocampista"),
    (["extremo", "extremos"],                        "Extremo"),
    (["delantero", "delanteros"],                    "Delantero"),
]

# =============================================================================
# 3) COLUMNAS DEL EXCEL (Wyscout)
# =============================================================================
COL_JUGADOR = "Player"
COL_EQUIPO = "Team"                  # equipo ACTUAL (2a columna). Si no existe se usa la 2a columna.
COL_MINUTOS = "Minutes played"
COL_PARTIDOS = "Matches played"
COL_POSICION_WYSCOUT = "Position"    # CF, RAMF... (solo informativo)

# Columnas repetidas en el Excel: la 2a vez que aparece una columna se renombra con
# este prefijo (Wyscout trae "Aerial duels per 90" dos veces: jugador y portero).
PREFIJO_REPETIDAS = "GK_"

# =============================================================================
# 4) DATOS GENERALES (junto a la foto)
# =============================================================================
# (etiqueta, columna del Excel, formato)
#   formato: "texto", "edad", "cm", "kg", "pie", "pais", "fecha", "posicion", "dinero"
#   "posicion" = la posición del archivo (Delantero, Extremo...), no lleva columna.
DATOS_GENERALES = [
    ("Posición", None, "posicion"),
    ("Edad", "Age", "edad"),
    ("Nacionalidad", "Passport country", "pais"),
    ("Altura", "Height", "cm"),
    ("Peso", "Weight", "kg"),
    ("Pie", "Foot", "pie"),
    # ("Contrato", "Contract expires", "fecha"),
    # ("Valor", "Market value", "dinero"),
]
# Separador entre países cuando tiene dos pasaportes: "Bélgica – Italia"
SEPARADOR_PAISES = " – "

# Países que no estén en paises.py (o para cambiar cómo se escribe alguno).
# Llave = como viene en Wyscout (inglés). Si falta alguno, sale en reporte_build.txt.
TRADUCCION_PAISES = {
    # "United States": "Estados Unidos",
}

# =============================================================================
# 5) ESTADÍSTICAS (cuadro superior derecho)  — UN CATÁLOGO POR POSICIÓN
# =============================================================================
# Cada stat:  (Etiqueta, ARRIBA, ABAJO)
#   ARRIBA = número grande;  ABAJO = número chico (None = no lleva)
#   ARRIBA/ABAJO = (columna del Excel, formato)
#     formato: "entero"  -> 2670
#              "pct"     -> 54%
#              "dec"     -> 0.34   (2 decimales)
#              "dec1"    -> 0.3    (1 decimal)
#     columna especial  "total:<columna per 90>"  -> total calculado = per 90 × minutos / 90
#       (Wyscout no trae el total de casi nada; se reconstruye con los minutos).
#
# Regla general:
#   - conteos:     arriba el TOTAL,       abajo el POR 90
#   - "ganadas":   arriba el % de éxito,  abajo los intentos POR 90 (no los ganados)
#
# Las de abajo son los atajos (_xxx) para no repetir; el catálogo por posición está
# al final. Para quitar/poner/reordenar una stat solo mueve la línea.
_E, _P, _D = "entero", "pct", "dec"

def _total(col90, etiqueta):           # solo el per 90 que viene en el Excel, arriba
    return (etiqueta, (col90, _D), None)

def _ganadas(col_pct, col90, etiqueta):  # % arriba, intentos por 90 abajo
    return (etiqueta, (col_pct, _P), (col90, _D))

MINUTOS = ("Minutos Jugados", ("Minutes played", _E), ("Matches played", _E))
GOLES = ("Goles", ("Goals", _E), None)
XG = ("xG", ("xG", _D), ("xG per 90", _D))
XA = ("xA", ("xA", _D), ("xA per 90", _D))
RECUP_RIVAL = ("Balones Recuperados Cancha Rival", ("Recuperaciones campo rival %", _P), ("Recuperaciones campo rival per 90", _D))
ASISTENCIAS = ("Asistencias", ("Assists", _E), ("Assists per 90", _D))
GOLES_CABEZA = ("Goles de Cabeza", ("Head goals", _E), ("Head goals per 90", _D))
REGATES = _ganadas("Successful dribbles, %", "Dribbles per 90", "Regates")
DUELOS_OF = _ganadas("Offensive duels won, %", "Offensive duels per 90", "Duelos Ofensivos")
DUELOS_DEF = _ganadas("Defensive duels won, %", "Defensive duels per 90", "Duelos Defensivos")
DUELOS_AER = _ganadas("Aerial duels won, %", "Aerial duels per 90", "Duelos Aéreos Ganados")
DUELOS = _ganadas("Duels won, %", "Duels per 90", "Duelos Ganados")
CENTROS = _ganadas("Accurate crosses, %", "Crosses per 90", "Centros Precisos")
PASES = _ganadas("Accurate passes, %", "Passes per 90", "Pases Precisos")
PASES_ADELANTE = _ganadas("Accurate forward passes, %", "Forward passes per 90", "Pases Adelante Precisos")
PASES_ATRAS = _ganadas("Accurate back passes, %", "Back passes per 90", "Pases Atrás Precisos")
PASES_LARGOS = _ganadas("Accurate long passes, %", "Long passes per 90", "Pases Largos Precisos")
PASES_CORTOS = _ganadas("Accurate short / medium passes, %", "Short / medium passes per 90", "Pases Corto/Medio Precisos")
PASES_PROG = _ganadas("Accurate progressive passes, %", "Progressive passes per 90", "Pases Progresivos Precisos")
PASES_AREA = _ganadas("Accurate passes to penalty area, %", "Passes to penalty area per 90", "Pases al Área Precisos")
PASES_ULT_TERCIO = _ganadas("Accurate passes to final third, %", "Passes to final third per 90", "Pases Últ. Tercio")
PASES_ESPACIO = _ganadas("Accurate through passes, %", "Through passes per 90", "Pases al Espacio Precisos")
TIROS = _ganadas("Shots on target, %", "Shots per 90", "Tiros a Portería")
CARRERAS_PROG = _total("Progressive runs per 90", "Carreras Progresivas")
PASES_LARGOS_REC = _total("Received long passes per 90", "Pases Largos Recibidos")
PASES_RECIBIDOS = _total("Received passes per 90", "Pases Recibidos")
FALTAS_RECIBIDAS = _total("Fouls suffered per 90", "Faltas Recibidas")
FALTAS_GENERADAS = _total("Fouls per 90", "Faltas Generadas")
ACC_OFENSIVAS = _total("Successful attacking actions per 90", "Acciones Ofensivas Exitosas")
ACC_DEFENSIVAS = _total("Successful defensive actions per 90", "Acciones Defensivas Exitosas")
ASIST_TIRO = _total("Shot assists per 90", "Asistencias a Tiro")
CENTROS_20M = _total("Deep completed crosses per 90", "Centros Últ. 20 m")
INTERCEPCIONES = _total("Interceptions per 90", "Intercepciones")
ENTRADAS = _total("Sliding tackles per 90", "Entradas")
TIROS_BLOQ = _total("Shots blocked per 90", "Tiros Interceptados")
# --- porteros ---
GOLES_RECIBIDOS = ("Goles Recibidos", ("Conceded goals", _E), ("Conceded goals per 90", _D))
XG_CONTRA = ("xG en Contra", ("xG against", _D), ("xG against per 90", _D))
GOLES_EVITADOS = ("Goles Evitados", ("Prevented goals", _D), ("Prevented goals per 90", _D))
TIROS_RECIBIDOS = ("Tiros Recibidos", ("Shots against", _E), ("Shots against per 90", _D))
ATAJADAS = ("Atajadas", ("Save rate, %", _P), None)
PORTERIAS_CERO = ("Porterías en Cero", ("Clean sheets", _E), None)
SALIDAS = _total("Exits per 90", "Salidas")
DUELOS_AER_GK = _total("GK_Aerial duels per 90", "Duelos Aéreos")
PASES_ATRAS_REC = _total("Back passes received as GK per 90", "Pases Atrás Recibidos")

# Catálogo por posición (tomado de radar_wyscout.ipynb: mismas métricas que el radar).
# 16 stats = cuadro de 4 x 4.  Hasta 20 caben (5 columnas).
ESTADISTICAS = {
    "Portero": [
        MINUTOS, GOLES_RECIBIDOS, XG_CONTRA, GOLES_EVITADOS,
        TIROS_RECIBIDOS, ATAJADAS, PORTERIAS_CERO, SALIDAS,
        DUELOS_AER_GK, PASES_ATRAS_REC, PASES, PASES_LARGOS,
        PASES_CORTOS, PASES_RECIBIDOS,
    ],
    "Defensa Central": [
        MINUTOS, INTERCEPCIONES, DUELOS_DEF, DUELOS_AER,
        TIROS_BLOQ, DUELOS_OF, PASES_LARGOS, PASES_PROG,
        PASES_ULT_TERCIO, CARRERAS_PROG, ENTRADAS, FALTAS_GENERADAS,
    ],
    "Lateral": [
        MINUTOS, CENTROS, CARRERAS_PROG, DUELOS_OF,
        ACC_OFENSIVAS, PASES_LARGOS_REC, XA, PASES_PROG,
        PASES_ULT_TERCIO, ASIST_TIRO, CENTROS_20M, ACC_DEFENSIVAS,
    ],
    "Mediocampista": [
        MINUTOS, DUELOS_OF, CARRERAS_PROG, FALTAS_RECIBIDAS,
        PASES_AREA, PASES_RECIBIDOS, PASES_LARGOS, XA,
        ASISTENCIAS, PASES_PROG, PASES_ESPACIO, ACC_DEFENSIVAS,
    ],
    "Extremo": [
        MINUTOS, XG, REGATES, CARRERAS_PROG,
        ASISTENCIAS, PASES_LARGOS_REC, XA, CENTROS,
        PASES_ADELANTE, PASES_ATRAS, DUELOS_OF, ACC_DEFENSIVAS,
    ],
    "Delantero": [
        MINUTOS, GOLES, XG, ASISTENCIAS,
        TIROS, DUELOS_AER, DUELOS_OF, PASES_ULT_TERCIO,
        REGATES, DUELOS_DEF, FALTAS_RECIBIDAS, RECUP_RIVAL,
    ],
}

# =============================================================================
# 6) IMÁGENES
# =============================================================================
EXTENSIONES_IMAGEN = {".jpg", ".jpeg", ".png", ".webp"}
FOTO_TAMANO = (480, 600)        # px, 4:5
FOTO_ALTO_JUGADOR = 0.86        # fracción del alto que ocupa el jugador (todas las fotos iguales)
MAPA_LADO_MAX = 900             # px
RADAR_LADO_MAX = 1100           # px (los radares se guardan en PNG con fondo transparente)

# Radares: dentro de  datos/radar/<nombre tal cual el Excel>/
#   promedio.png  -> jugador vs liga
#   jugador.png   -> radar individual
#   cualquier otra imagen (p. ej. "A. Bertaccini_R. Morales.png") -> radar vs otro jugador
# Orden en la ficha: jugador, vs (orden alfabético), promedio.  Máximo MAX_RADARES:
# se reparten a lo largo de la ficha en partes iguales.
RADAR_PROMEDIO = "promedio"
RADAR_JUGADOR = "jugador"
MAX_RADARES = 4
