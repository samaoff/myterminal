@echo off
cd /d "%~dp0"
if not exist "node_modules\electron\dist\electron.exe" (
  echo Faltan las dependencias de desarrollo de MyTerminal.
  pause
  exit /b 1
)
start "" "node_modules\electron\dist\electron.exe" . "--user-data-dir=%TEMP%\ai-terminal-feature-preview" --sftp-preview
