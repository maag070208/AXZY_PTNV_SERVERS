@echo off
rem ================================================================
rem  Doble clic: actualiza Puerto Nuevo y deja la ventana abierta.
rem
rem  CARPETA = donde esta AXZY_PTNV_SERVERS. Vacio = la carpeta de
rem  este archivo. Sirve ruta de Windows o de WSL, por ejemplo:
rem    set "CARPETA=C:\Users\Administrator\AXZY_PTNV_SERVERS"
rem    set "CARPETA=/mnt/c/Users/Administrator/AXZY_PTNV_SERVERS"
rem ================================================================
set "CARPETA="

title Actualizar Puerto Nuevo
if not defined CARPETA set "CARPETA=%~dp0"
if "%CARPETA:~-1%"=="\" set "CARPETA=%CARPETA:~0,-1%"

rem Todo en un bloque: cmd lo lee completo antes de correrlo, asi que
rem no importa que git pull cambie este archivo a medio camino.
(
  wsl.exe --cd "%CARPETA%" -- bash ./actualizar.sh
  if errorlevel 1 (
    echo.
    echo Si dice que no encuentra la carpeta o actualizar.sh, revisa CARPETA
    echo al inicio de Actualizar.cmd ^(clic derecho, Editar^).
  )
  echo.
  pause
  exit /b
)
