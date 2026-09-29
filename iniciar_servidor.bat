@echo off
REM ========================================================
REM Script para iniciar el servidor local de OMS Map
REM ========================================================

cd /d "%~dp0"

REM Configurar ruta de Node.js portable
set "NODE_PORTABLE=C:\Users\P723919021\Documents\vscode\DEPENDENCIAS\node-v24.17.0-win-x64"
if exist "%NODE_PORTABLE%\node.exe" (
    set "PATH=%NODE_PORTABLE%;%PATH%"
)

REM Verificar si node esta disponible
where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] No se encontro Node.js en el sistema ni en:
    echo %NODE_PORTABLE%
    echo.
    echo Presiona una tecla para salir...
    pause >nul
    exit /b 1
)

echo ========================================================
echo        INICIANDO SERVIDOR LOCAL - OMS MAP
echo ========================================================
echo.
echo  * Servidor web: http://localhost:3000
echo  * Para CERRAR el servidor: Simplemente cierra esta ventana
echo.
echo ========================================================
echo.

REM Abrir automaticamente la pagina web en el navegador
start http://localhost:3000

REM Iniciar el servidor en primer plano
node server.js
