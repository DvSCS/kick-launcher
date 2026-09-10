@echo off
title Motor de Transmissao (Kick Launcher)
echo ====================================================
echo Iniciando o Motor do Kick Launcher...
echo ====================================================
echo.

:: Verifica se a pasta node_modules existe
if not exist "node_modules\" (
    echo Instalando as dependencias necessarias pela primeira vez...
    echo Isso pode levar um minuto...
    call npm install
    echo.
)

:: Inicia o worker
node worker.js
pause
