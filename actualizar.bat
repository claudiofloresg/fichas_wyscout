@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo == 0/3 Bajando la ultima version de GitHub ==
git pull --rebase --autostash
if errorlevel 1 (
  echo.
  echo No se pudo bajar la ultima version. Revisa el mensaje de arriba.
  pause
  exit /b 1
)
if exist gdrive_key.json (
  echo == 1/3 Bajando datos de Google Drive ==
  python descargar_drive.py
  if errorlevel 1 (
    echo.
    echo No se pudo bajar de Drive. Revisa el mensaje de arriba.
    pause
    exit /b 1
  )
) else (
  if exist config_auto.py del config_auto.py
)
echo == 2/3 Generando datos de la pagina ==
python build.py
if errorlevel 1 (
  echo.
  echo Hubo un error. Revisa el mensaje de arriba.
  pause
  exit /b 1
)
echo.
echo == 3/3 Publicando en GitHub Pages ==
git add -A
git diff --cached --quiet && (echo No hay cambios que publicar.) || (git commit -m "Actualizacion %date% %time%" && git push)
echo.
echo Listo. La pagina se actualiza en 1-2 minutos.
pause
