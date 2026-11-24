#!/bin/bash
# Mac: lo mismo que actualizar.bat (doble clic).
# Guarda tus cambios, baja lo último de GitHub, baja Drive, genera la página (y /pumas/) y publica.
cd "$(dirname "$0")" || exit 1
pausa() { echo; read -r -p "Presiona Enter para cerrar..." _; }
falla() { echo; echo "$1"; pausa; exit 1; }

git config core.autocrlf input                     # archivos que vienen de Windows (CRLF) se suben igual (LF)

echo "== 0/3 Bajando la ultima version de GitHub =="
git add -A
git update-index --chmod=+x actualizar.command ver_local.command >/dev/null 2>&1   # que sigan abriendo con doble clic
git diff --cached --quiet || git commit -q -m "Cambios locales $(date '+%d/%m/%Y %H:%M:%S')"
if ! git pull --rebase -X theirs; then
  git rebase --abort >/dev/null 2>&1
  falla "No se pudo bajar la ultima version. Revisa el mensaje de arriba."
fi

if [ -f gdrive_key.json ]; then
  echo "== 1/3 Bajando datos de Google Drive =="
  python3 descargar_drive.py || falla "No se pudo bajar de Drive. Revisa el mensaje de arriba."
else
  rm -f config_auto.py
fi

echo "== 2/3 Generando datos de la pagina =="
python3 build.py || falla "Hubo un error. Revisa el mensaje de arriba."
echo "== 2a/3 Generando temporadas anteriores de Varonil (/25-26/, /24-25/) =="
python3 build.py --temporadas
echo "== 2b/3 Generando Femenil (/femenil/) =="
python3 build.py --femenil || echo "[AVISO] No se genero Femenil; se publica lo demas."
echo "== 2c/3 Generando fichas de Pumas para la pagina (/pumas/) =="
python3 build.py --pumas --web || echo "[AVISO] No se generaron las fichas de Pumas; se publica lo demas."

echo
echo "== 3/3 Publicando en GitHub Pages =="
git add -A
if git diff --cached --quiet; then
  echo "No hay cambios nuevos en los datos."
else
  git commit -q -m "Actualizacion $(date '+%d/%m/%Y %H:%M:%S')" || falla "No se pudo guardar el cambio."
fi
git push || falla "No se pudo subir a GitHub. Revisa el mensaje de arriba."    # también sube los "Cambios locales" del paso 0
echo
echo "Listo. La pagina se actualiza en 1-2 minutos."
pausa
