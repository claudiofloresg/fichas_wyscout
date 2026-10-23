#!/bin/bash
# Genera los datos y publica en GitHub Pages.   Uso: ./actualizar.sh
set -e
cd "$(dirname "$0")"
echo "== 0/2 Bajando la última versión de GitHub =="
git pull --rebase --autostash
if [ -f gdrive_key.json ]; then
  echo "== Bajando datos de Google Drive =="
  python3 descargar_drive.py
else
  rm -f config_auto.py
fi
echo "== 1/2 Generando datos de la página =="
python3 build.py
echo ""
echo "== 2/2 Publicando en GitHub Pages =="
git add -A
if git diff --cached --quiet; then
  echo "No hay cambios que publicar."
else
  git commit -m "Actualización $(date '+%d/%m/%Y %H:%M')"
  git push
fi
echo "Listo. La página se actualiza en 1-2 minutos."
