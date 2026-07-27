@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0START_IPHONE_PREVIEW.ps1" %*
exit /b %ERRORLEVEL%
