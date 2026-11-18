#!/bin/bash
# Viejo: usa actualizar.command (Mac) o actualizar.bat (Windows). Este solo llama al de Mac.
exec bash "$(dirname "$0")/actualizar.command"
