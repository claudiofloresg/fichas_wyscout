@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo == 0/3 Bajando la ultima version de GitHub ==
rem Primero se guardan tus cambios locales (asi git no los mezcla con marcas de conflicto)
git add -A
git diff --cached --quiet || git commit -q -m "Cambios locales %date% %time%"
git pull --rebase -X theirs
if errorlevel 1 (
  git rebase --abort >nul 2>&1
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
echo == 2a/3 Generando temporadas anteriores de Varonil (/25-26/, /24-25/) ==
python build.py --temporadas
echo == 2b/3 Generando Femenil (/femenil/) ==
python build.py --femenil
if errorlevel 1 echo [AVISO] No se genero Femenil; se publica lo demas.
echo == 2c/3 Generando fichas de Pumas para la pagina (/pumas/) ==
python build.py --pumas --web
if errorlevel 1 echo [AVISO] No se generaron las fichas de Pumas; se publica lo demas.
echo.
echo == 3/3 Publicando en GitHub Pages ==
git add -A
git diff --cached --quiet && (echo No hay cambios nuevos en los datos.) || (git commit -m "Actualizacion %date% %time%")
rem tambien sube los "Cambios locales" del paso 0 (aunque los datos no hayan cambiado)
git push
if errorlevel 1 (
  echo.
  echo No se pudo subir a GitHub. Revisa el mensaje de arriba.
  pause
  exit /b 1
)
echo.
echo Listo. La pagina se actualiza en 1-2 minutos.
pause
