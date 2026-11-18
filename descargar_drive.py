# -*- coding: utf-8 -*-
"""
descargar_drive.py — baja de Google Drive las carpetas data_fichas de Varonil y Femenil (para GitHub Actions)
==========================================================================================================
Lo usa el workflow .github/workflows/actualizar.yml. No hace falta correrlo a mano.

En Drive:   Scouting 26-27/Varonil/  Data Wyscout 26-27.xlsx  +  data_fichas/ (lista_fichas, fotos, mapas…)
            Scouting 26-27/Femenil/  Data Wyscout 26-27.xlsx  +  data_fichas/ (lista_fichas, fotos, mapas)

  1. Se conecta a Drive con la cuenta de servicio (llave JSON en el secreto GDRIVE_KEY).
  2. Por cada rama descarga TODA su carpeta data_fichas (con subcarpetas):
       Varonil -> datos_drive/        Femenil -> datos_drive_femenil/
     - Google Sheets se exportan como .xlsx automáticamente (con todas sus pestañas).
     - Accesos directos (shortcuts) se siguen.
  3. La base de datos se busca en la carpeta de la rama (la que contiene data_fichas):
     el archivo "Data Wyscout <TEMPORADA>" más reciente. Si la cuenta de servicio no ve esa carpeta,
     sirve un acceso directo a la base dentro de data_fichas. (Ya NO se busca en todo Drive: las dos
     ramas tienen un archivo con el mismo nombre.)
  4. Escribe config_auto.py: las variables de Varonil (CARPETA_*, ARCHIVO_LISTA, ARCHIVO_BASE) y
     RAMA_FEMENIL = {las mismas, de Femenil} para  python build.py --femenil.
     Si Femenil falla (p. ej. no está compartida), Varonil sigue igual.

También sirve en tu compu: pon gdrive_key.json junto a este archivo y actualizar.bat lo corre solo.

Variables de entorno:
  GDRIVE_KEY_FILE   ruta al JSON de la cuenta de servicio (default: gdrive_key.json)
  GDRIVE_FOLDER_ID  ID de la carpeta data_fichas de Varonil (default: el de abajo)
  BASE_FILE_ID      ID del archivo "Data Wyscout 26-27" de Varonil (opcional)
  FEMENIL_LISTA_ID  ID de la hoja lista_fichas de Femenil (su carpeta es la data_fichas de Femenil)
  TEMPORADA         temporada de la base (default 26-27)
"""
import io
import json
import os
import re
import shutil
import sys

from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload

FOLDER_ID = os.environ.get("GDRIVE_FOLDER_ID") or "1Ylam2ktoNaY9_kERdjeRoGNDKN_0fdpn"
KEY_FILE = os.environ.get("GDRIVE_KEY_FILE") or "gdrive_key.json"
BASE_FILE_ID = os.environ.get("BASE_FILE_ID") or ""
FEMENIL_LISTA_ID = os.environ.get("FEMENIL_LISTA_ID") or "1PqO-IILu8th4w9lDFOJd-2fB_g7YxGbK3TOZKKB1xzE"
TEMPORADA = os.environ.get("TEMPORADA") or "26-27"
DESTINO = "datos_drive"                    # Varonil (igual que siempre)
DESTINO_FEMENIL = "datos_drive_femenil"
NOMBRE_LISTA = "lista_fichas"        # hoja de Google que llena la página
NOMBRE_BASE = "data_wyscout"         # se busca un archivo cuyo nombre contenga esto (sin acentos/espacios)

# Subcarpeta de data_fichas  ->  variable de config.py
# (si renombras una carpeta en Drive, cámbiala aquí)
SUBCARPETAS = {
    "CARPETA_EXCEL": "excel",
    "CARPETA_FOTOS": "fotos",
    "CARPETA_MAPAS": "mapas",
    "CARPETA_RADARES": "radar",
    "CARPETA_NOMBRES": "nombres_y_video",
    "CARPETA_EXTRA": "stats_manuales",
}

FOLDER = "application/vnd.google-apps.folder"
SHORTCUT = "application/vnd.google-apps.shortcut"
SHEET = "application/vnd.google-apps.spreadsheet"
XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
# extensión que se agrega si el archivo en Drive no la trae en el nombre (p. ej. "central" en vez de "central.xlsx")
EXTENSIONES = {
    XLSX: ".xlsx", "application/vnd.ms-excel": ".xls", "application/vnd.ms-excel.sheet.macroenabled.12": ".xlsm",
    "text/csv": ".csv", "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp",
}


def _slug(t):
    import unicodedata
    t = unicodedata.normalize("NFKD", str(t)).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "_", t.lower()).strip("_")


def buscar_archivo(raiz, contiene, solo_raiz=False):
    for d, subdirs, archivos in os.walk(raiz):
        for a in sorted(archivos):
            if a.lower().endswith((".xlsx", ".xlsm", ".xls")) and contiene in _slug(os.path.splitext(a)[0]):
                return os.path.join(d, a)
        if solo_raiz:
            break
    return None


def bajar_archivo(srv, fid, carpeta):
    """Baja un archivo suelto por ID (la base de datos). Google Sheet -> .xlsx."""
    os.makedirs(carpeta, exist_ok=True)
    f = srv.files().get(fileId=fid, fields="name, mimeType", supportsAllDrives=True).execute()
    destino = os.path.join(carpeta, nombre_seguro(f["name"]))
    if f["mimeType"] == SHEET:
        destino += "" if destino.lower().endswith(".xlsx") else ".xlsx"
        bajar(srv.files().export_media(fileId=fid, mimeType=XLSX), destino)
    else:
        if not os.path.splitext(destino)[1]:
            destino += EXTENSIONES.get(f["mimeType"], ".xlsx")
        bajar(srv.files().get_media(fileId=fid, supportsAllDrives=True), destino)
    return destino


def nombre_seguro(n):
    return re.sub(r'[\\/:*?"<>|]', "_", n).strip() or "sin_nombre"


def listar(srv, folder_id):
    items, token = [], None
    while True:
        r = srv.files().list(
            q=f"'{folder_id}' in parents and trashed = false",
            fields="nextPageToken, files(id, name, mimeType, modifiedTime, shortcutDetails)",
            pageSize=1000, pageToken=token,
            supportsAllDrives=True, includeItemsFromAllDrives=True,
        ).execute()
        items += r.get("files", [])
        token = r.get("nextPageToken")
        if not token:
            return items


def bajar(req, ruta):
    buf = io.FileIO(ruta, "wb")
    dl = MediaIoBaseDownload(buf, req, chunksize=8 * 1024 * 1024)
    hecho = False
    while not hecho:
        _, hecho = dl.next_chunk()
    buf.close()


def descargar(srv, folder_id, ruta, cuenta, nivel=0):
    os.makedirs(ruta, exist_ok=True)
    for f in listar(srv, folder_id):
        fid, mime, nombre = f["id"], f["mimeType"], nombre_seguro(f["name"])
        if mime == SHORTCUT:                        # acceso directo: se sigue al destino
            det = f.get("shortcutDetails") or {}
            fid, mime = det.get("targetId", fid), det.get("targetMimeType", mime)
        destino = os.path.join(ruta, nombre)
        try:
            if mime == FOLDER:
                descargar(srv, fid, destino, cuenta, nivel + 1)
            elif mime == SHEET:                     # Google Sheet -> .xlsx
                if not destino.lower().endswith(".xlsx"):
                    destino += ".xlsx"
                bajar(srv.files().export_media(fileId=fid, mimeType=XLSX), destino)
                cuenta["archivos"] += 1
            elif mime.startswith("application/vnd.google-apps."):
                print(f"  [aviso] se omite '{f['name']}' ({mime.split('.')[-1]}): no es un archivo descargable")
            else:
                ext = EXTENSIONES.get(mime)
                if ext and not os.path.splitext(destino)[1]:
                    destino += ext
                bajar(srv.files().get_media(fileId=fid, supportsAllDrives=True), destino)
                cuenta["archivos"] += 1
        except Exception as e:                      # un archivo malo no tumba todo
            print(f"  [aviso] no se pudo bajar '{f['name']}': {e}")
            cuenta["errores"] += 1


def padre(srv, fid):
    """ID de la carpeta que contiene a fid (None si no se puede ver)."""
    try:
        p = srv.files().get(fileId=fid, fields="parents", supportsAllDrives=True).execute().get("parents") or []
        return p[0] if p else None
    except Exception:                               # noqa: BLE001
        return None


def base_en_carpeta(srv, carpeta_id):
    """En la carpeta de la rama, el "Data Wyscout <TEMPORADA>" más reciente (archivo o acceso directo)."""
    try:
        items = listar(srv, carpeta_id)
    except Exception as e:                          # noqa: BLE001
        print(f"  [aviso] no puedo ver la carpeta de la rama ({e})")
        return None
    cand = []
    for f in items:
        mime, fid = f["mimeType"], f["id"]
        if mime == SHORTCUT:
            det = f.get("shortcutDetails") or {}
            mime, fid = det.get("targetMimeType", mime), det.get("targetId", fid)
        n = _slug(f["name"])
        if mime in (XLSX, SHEET, "application/vnd.ms-excel") and NOMBRE_BASE in n and _slug(TEMPORADA) in n:
            cand.append(dict(f, id=fid, mimeType=mime))
    cand.sort(key=lambda f: f.get("modifiedTime", ""), reverse=True)
    for f in cand:
        print(f"    visto: {f['name']}  (modificado {f.get('modifiedTime', '?')[:16].replace('T', ' ')} UTC)")
    return cand[0] if cand else None


def bajar_rama(srv, nombre, folder_id, destino, base_id=""):
    """Baja la data_fichas de una rama a destino/ y su base de datos. Devuelve las variables de config."""
    raiz = srv.files().get(fileId=folder_id, fields="name", supportsAllDrives=True).execute()
    print(f"\n== {nombre}: descargando '{raiz['name']}' de Drive -> {destino}/")
    cuenta = {"archivos": 0, "errores": 0}
    shutil.rmtree(destino, ignore_errors=True)       # siempre copia limpia (lo borrado en Drive se va)
    descargar(srv, folder_id, destino, cuenta)
    print(f"  Listo: {cuenta['archivos']} archivos ({cuenta['errores']} con error)")

    base = None
    if base_id:
        base = bajar_archivo(srv, base_id, destino)
    if not base:
        carpeta = padre(srv, folder_id)
        f = base_en_carpeta(srv, carpeta) if carpeta else None
        if f:
            try:
                base = bajar_archivo(srv, f["id"], os.path.join(destino, "_base"))
                print(f"  Base de datos: {f['name']} (modificada {f.get('modifiedTime', '?')[:16].replace('T', ' ')} UTC)")
            except Exception as e:                  # noqa: BLE001
                print(f"  [aviso] no pude bajar '{f['name']}': {e}")
    if not base:                                    # acceso directo dentro de data_fichas
        base = buscar_archivo(destino, NOMBRE_BASE)
        if base:
            print(f"  Base de datos (acceso directo en data_fichas): {os.path.basename(base)}")
    lista = buscar_archivo(destino, NOMBRE_LISTA, solo_raiz=True)
    print(f"  Lista de fichas: {lista or 'no hay'}")
    print(f"  Base de datos:   {base or 'no se encontró'}")
    if lista and not base:
        correo = json.load(open(KEY_FILE)).get("client_email", "la cuenta de servicio")
        raise RuntimeError(f"Hay lista de fichas pero no encontré 'Data Wyscout {TEMPORADA}' en la carpeta de {nombre}. "
                           f"Comparte la carpeta 'Scouting 26-27' con {correo} (Lector).")
    variables = {}
    for var, sub in SUBCARPETAS.items():
        variables[var] = os.path.join(destino, sub)      # aunque no exista: así no se cuela la ruta de otra rama
    variables["ARCHIVO_LISTA"] = lista
    variables["ARCHIVO_BASE"] = base
    return variables


def main():
    if not os.path.exists(KEY_FILE):
        print(f"[ERROR] No encuentro la llave {KEY_FILE} (secreto GDRIVE_KEY en GitHub).")
        sys.exit(1)
    cred = service_account.Credentials.from_service_account_file(
        KEY_FILE, scopes=["https://www.googleapis.com/auth/drive.readonly"])
    srv = build("drive", "v3", credentials=cred, cache_discovery=False)
    correo = json.load(open(KEY_FILE)).get("client_email", "la cuenta de servicio")

    # ---- Varonil (obligatoria)
    try:
        varonil = bajar_rama(srv, "Varonil", FOLDER_ID, DESTINO, BASE_FILE_ID)
    except Exception as e:                          # noqa: BLE001
        print(f"[ERROR] Varonil: {e}\n  ¿La carpeta {FOLDER_ID} está compartida con {correo}?")
        sys.exit(1)
    for var in ("CARPETA_FOTOS", "CARPETA_MAPAS"):     # las demás (excel, radar, …) ya son opcionales
        if not os.path.isdir(varonil[var]):
            print(f"  [aviso] Varonil no tiene la subcarpeta '{SUBCARPETAS[var]}' en Drive ({var})")

    # ---- Femenil (si falla, Varonil sigue)
    femenil = None
    carpeta_fem = padre(srv, FEMENIL_LISTA_ID) if FEMENIL_LISTA_ID else None
    if not carpeta_fem:
        print(f"\n[AVISO] Femenil: no puedo ver la hoja lista_fichas de Femenil ({FEMENIL_LISTA_ID}).\n"
              f"  Comparte la carpeta 'Scouting 26-27' con {correo} (Lector). Se sigue sin Femenil.")
    else:
        try:
            femenil = bajar_rama(srv, "Femenil", carpeta_fem, DESTINO_FEMENIL)
        except Exception as e:                      # noqa: BLE001
            print(f"\n[AVISO] Femenil: {e}\n  Se sigue sin Femenil.")
            femenil = None

    lineas = ["# Generado por descargar_drive.py. No se sube al repo; se reescribe en cada corrida.\n"]
    for var, valor in varonil.items():
        lineas.append(f"{var} = {valor!r}\n")
    lineas.append(f"RAMA_FEMENIL = {femenil!r}\n")
    open("config_auto.py", "w", encoding="utf-8").writelines(lineas)
    print("\nconfig_auto.py listo (Varonil" + (" y Femenil)" if femenil else ", sin Femenil)"))


if __name__ == "__main__":
    main()
