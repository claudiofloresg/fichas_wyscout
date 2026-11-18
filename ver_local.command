#!/bin/bash
# Mac: lo mismo que ver_local.bat (doble clic). Abre la pagina con lo que ya hay en docs/ (sin GitHub).
cd "$(dirname "$0")" || exit 1
echo "Abriendo http://localhost:8000  (cierra esta ventana para detenerlo)"
(sleep 1; open "http://localhost:8000") &
python3 -c "import http.server as h, mimetypes as m, functools as f; m.add_type('text/javascript','.mjs'); h.test(HandlerClass=f.partial(h.SimpleHTTPRequestHandler, directory='docs'), port=8000)"
