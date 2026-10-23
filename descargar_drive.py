# -*- coding: utf-8 -*-
"""
descargar_drive.py — baja la carpeta data_fichas de Google Drive (para GitHub Actions)
====================================================================================
Lo usa el workflow .github/workflows/actualizar.yml. No hace falta correrlo a mano.

  1. Se conecta a Drive con la cuenta de servicio (llave JSON en el secreto GDRIVE_KEY).
  2. Descarga TODA la carpeta (con subcarpetas) a  datos_drive/
     - Google Sheets se exportan como .xlsx automáticamente.
     - Accesos directos (shortcuts) se siguen.
  3. Si BASE_FILE_ID está definido, baja también ese archivo (la base de datos de Wyscout).
     Si no, la base se busca dentro de data_fichas (sirve un acceso directo a "Data Wyscout 26-27").
  4. Escribe config_auto.py apuntando a datos_drive/... para que build.py lea de ahí
     (CARPETA_*, ARCHIVO_LISTA = hoja "lista_fichas", ARCHIVO_BASE = base de datos).

También sirve en tu compu: pon gdrive_key.json junto a este archivo y actualizar.bat lo corre solo.

Variables de entorno:
  GDRIVE_KEY_FILE   ruta al JSON de la cuenta de servicio (default: gdrive_key.json)
  GDRIVE_FOLDER_ID  ID de la carpeta data_fichas (default: el de abajo)
  BASE_FILE_ID      ID del archivo "Data Wyscout 26-27" (opcional)
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
DESTINO = "datos_drive"
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
            fields="nextPageToken, files(id, name, mimeType, shortcutDetails)",
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


def main():
    if not os.path.exists(KEY_FILE):
        print(f"[ERROR] No encuentro la llave {KEY_FILE} (secreto GDRIVE_KEY en GitHub).")
        sys.exit(1)
    cred = service_account.Credentials.from_service_account_file(
        KEY_FILE, scopes=["https://www.googleapis.com/auth/drive.readonly"])
    srv = build("drive", "v3", credentials=cred, cache_discovery=False)
    try:
        raiz = srv.files().get(fileId=FOLDER_ID, fields="name", supportsAllDrives=True).execute()
    except Exception as e:
        correo = json.load(open(KEY_FILE)).get("client_email", "la cuenta de servicio")
        print(f"[ERROR] No puedo abrir la carpeta {FOLDER_ID}. ¿Está compartida con {correo}?\n  {e}")
        sys.exit(1)
    print(f"Descargando '{raiz['name']}' de Drive -> {DESTINO}/")
    cuenta = {"archivos": 0, "errores": 0}
    shutil.rmtree(DESTINO, ignore_errors=True)       # siempre copia limpia (lo borrado en Drive se va)
    descargar(srv, FOLDER_ID, DESTINO, cuenta)
    print(f"Listo: {cuenta['archivos']} archivos ({cuenta['errores']} con error)")

    base = None
    if BASE_FILE_ID:
        try:
            base = bajar_archivo(srv, BASE_FILE_ID, DESTINO)
        except Exception as e:
            correo = json.load(open(KEY_FILE)).get("client_email", "la cuenta de servicio")
            print(f"[ERROR] No puedo bajar la base de datos {BASE_FILE_ID}. ¿Está compartida con {correo}?\n  {e}")
            sys.exit(1)
    base = base or buscar_archivo(DESTINO, NOMBRE_BASE)
    lista = buscar_archivo(DESTINO, NOMBRE_LISTA, solo_raiz=True)
    print(f"  Lista de fichas: {lista or 'no hay (se usan los Excel por posición)'}")
    print(f"  Base de datos:   {base or 'no se encontró'}")
    if lista and not base:
        print("[ERROR] Hay lista de fichas pero no encontré la base de datos (Data Wyscout 26-27).\n"
              "  Compártela con la cuenta de servicio y pon un acceso directo dentro de data_fichas.")
        sys.exit(1)

    lineas = ["# Generado por descargar_drive.py. No se sube al repo; se reescribe en cada corrida.\n"]
    for var, sub in SUBCARPETAS.items():
        p = os.path.join(DESTINO, sub)
        if not os.path.isdir(p):
            print(f"  [aviso] no existe la subcarpeta '{sub}' en Drive ({var})")
        lineas.append(f'{var} = r"{p}"\n')
    lineas.append(f'ARCHIVO_LISTA = {repr(lista)}\n')
    lineas.append(f'ARCHIVO_BASE = {repr(base)}\n')
    open("config_auto.py", "w", encoding="utf-8").writelines(lineas)


if __name__ == "__main__":
    main()
