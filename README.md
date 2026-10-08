# Fichas Scouting (Wyscout) — Inteligencia Deportiva Pumas

Misma página que la de Fuerzas Básicas, pero solo con la **ficha gráfica** (PDF horizontal):
foto + datos generales, mapa de calor, estadísticas y de 1 a 4 radares (imágenes).

Flujo en la página: **eliges posición → lista de jugadores → PDF de uno o PDF de todos**.

```
fichas_wyscout/
├── config.py      <- RUTAS, posiciones, datos generales y CATÁLOGO DE ESTADÍSTICAS por posición
├── paises.py      <- traducción de países (Wyscout en inglés -> español)
├── build.py       <- lee Excel + nombres + fotos + mapas + radares y genera docs/
├── actualizar.bat / actualizar.sh   <- build + publicar en GitHub
├── ver_local.bat  <- ver la página en tu compu (http://localhost:8000)
└── docs/          <- la página (GitHub Pages)  ·  informe.js = diseño de la ficha
```

## Carpetas de datos (`datos/`, no se suben a GitHub)

| Carpeta | Qué va | Ejemplo |
|---|---|---|
| `datos/excel/` | Un Excel de Wyscout **por posición** | `delantero.xlsx`, `central.xlsx`, `lateral.xlsx`, `mediocampista.xlsx`, `extremo.xlsx`, `portero.xlsx` |
| `datos/nombres/` | `NOMBRE EXCEL` \| `NOMBRE COMPLETO` | `A. Bertaccini` \| `Nombre Completo` |
| `datos/fotos/` | Foto con el nombre tal cual el Excel | `A. Bertaccini.png` |
| `datos/mapas/` | Mapa de calor con el nombre tal cual el Excel | `A. Bertaccini.png` |
| `datos/radar/<nombre>/` | Los 3 radares del jugador | `promedio.png` (vs liga), `jugador.png` (individual), cualquier otro nombre = radar vs (p. ej. `A. Bertaccini_R. Morales.png`). Máximo 4 en total |

- Mayúsculas, acentos y espacios no importan. Fotos/mapas/radares también se encuentran con el nombre completo.
- Si no hay nombre completo, se imprime el del Excel.
- El equipo es la columna **Team** (equipo actual).
- La nacionalidad sale de **Passport country**, traducida con `paises.py` (no requiere Excel ni librería).
  Si aparece un país sin traducir, sale en `reporte_build.txt`: agrégalo en `TRADUCCION_PAISES` de `config.py`.
- Orden: jugador, vs (alfabético), promedio. Se reparten a lo largo de la ficha (3 o 4 en partes iguales) (`MAX_RADARES` en `config.py`).
- Los radares guardados con `transparent=True` se usan tal cual; si traen fondo gris liso se le quita solo.

## Estadísticas (cuadro superior derecho)

`ESTADISTICAS` en `config.py`, una lista por posición. Cada stat:

```python
("Etiqueta", (columna_arriba, formato), (columna_abajo, formato))   # abajo = None si no lleva
```

- formatos: `"entero"`, `"pct"`, `"dec"` (2 decimales), `"dec1"`
- `"total:<columna per 90>"` = total calculado (per 90 × minutos / 90)
- Atajos ya armados: `_total(...)` (total arriba / por 90 abajo) y `_ganadas(...)` (% arriba / intentos por 90 abajo)

Hasta 16 stats = 4 columnas; más de 16 = 5 columnas.

## Actualizar

1. Deja los Excel / fotos / mapas / radares en sus carpetas.
2. Doble clic a **`actualizar.bat`**.
3. Revisa **`reporte_build.txt`** (sin nombre completo, sin foto, sin mapa, radares faltantes, países sin traducir, columnas que no vienen).

Primera vez (GitHub Pages): igual que en FB — `pip install -r requirements.txt`, `git init`, `git remote add origin ...`,
`actualizar.bat`, y en GitHub **Settings → Pages → main / docs**.
