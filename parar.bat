@echo off
echo Encerrando servidor de Apontamentos (Porta 7000)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :7000') do (
    taskkill /F /PID %%a >nul 2>&1
)
echo [OK] Servidor finalizado com sucesso.
timeout /t 2 >nul
exit
