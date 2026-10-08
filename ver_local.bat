@echo off
cd /d "%~dp0"
echo Abriendo http://localhost:8000  (cierra esta ventana para detenerlo)
start "" http://localhost:8000
python -m http.server 8000 -d docs
