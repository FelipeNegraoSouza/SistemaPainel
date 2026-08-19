@echo off
cd /d "%~dp0"

:: Inicia o servidor Python FastAPI na porta 7000
start /B python run_server.py > "%~dp0server.log" 2>&1

:: Aguarda 2 segundos para o servidor subir
timeout /t 2 /nobreak >nul

:: Abre a interface no navegador padrao
start http://127.0.0.1:7000
exit
