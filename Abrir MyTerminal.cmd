@echo off
cd /d "%~dp0"
if not exist "node_modules\electron\dist\electron.exe" (
  echo Faltan las dependencias. Ejecuta npm install en esta carpeta.
  pause
  exit /b 1
)
start "" "node_modules\electron\dist\electron.exe" .
