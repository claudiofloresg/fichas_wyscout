@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo == 1/2 Generando datos de la pagina ==
python build.py
if errorlevel 1 (
  echo.
  echo Hubo un error. Revisa el mensaje de arriba.
  pause
  exit /b 1
)
echo.
echo == 2/2 Publicando en GitHub Pages ==
git add -A
git diff --cached --quiet && (echo No hay cambios que publicar.) || (git commit -m "Actualizacion %date% %time%" && git push)
echo.
echo Listo. La pagina se actualiza en 1-2 minutos.
pause
