@echo off
setlocal
title FullTime Node - Encerrando Ambiente Portavel
color 0C

set "SCRIPT_DIR=%~dp0"
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"
if exist "%SCRIPT_DIR%\server.js" (
    set "PROJECT_DIR=%SCRIPT_DIR%"
    for %%I in ("%SCRIPT_DIR%\..") do set "DEV_DIR=%%~fI"
) else (
    set "DEV_DIR=%SCRIPT_DIR%\dev"
    set "PROJECT_DIR=%DEV_DIR%\fulltime-node"
)
set "NGINX_DIR=%DEV_DIR%\nginx"
set "NGINX_EXE=%NGINX_DIR%\nginx.exe"
set "NGINX_PID_FILE=%NGINX_DIR%\logs\nginx-windows.pid"
set "MYSQL_DIR=%DEV_DIR%\mysql"
set "ERRORS=0"

echo ========================================================
echo   ENCERRANDO AMBIENTE PORTAVEL - FULLTIME NODE
echo ========================================================
echo.

echo [1/3] Encerrando NGINX...
call :stop_nginx
if errorlevel 1 set "ERRORS=1"

echo [2/3] Encerrando instancias do Node.js (fulltime-node)...
for %%P in (3001 3002 3003 3004) do (
    call :stop_node_port %%P
    if errorlevel 1 set "ERRORS=1"
)

echo [3/3] Encerrando MySQL Portatil...
call :stop_mysql
if errorlevel 1 set "ERRORS=1"

echo.
echo ========================================================
if "%ERRORS%"=="0" (
    echo   Servicos do ambiente encerrados.
) else (
    echo   [ERRO] Alguns servicos nao puderam ser encerrados.
)
echo ========================================================
echo.
color 07
pause
exit /b %ERRORS%

:stop_nginx
if not exist "%NGINX_PID_FILE%" (
    call :recover_nginx_pid
    if errorlevel 1 (
        echo [INFO] Nenhum processo NGINX desta instalacao foi encontrado.
        exit /b 0
    )
)

set "NGINX_PID="
for /f "usebackq tokens=1" %%I in ("%NGINX_PID_FILE%") do set "NGINX_PID=%%I"
if not defined NGINX_PID goto :recover_stale_nginx_pid
echo %NGINX_PID% | findstr /R "^[0-9][0-9]*$" >nul
if errorlevel 1 goto :recover_stale_nginx_pid
call :is_nginx_pid_running
if errorlevel 1 goto :recover_stale_nginx_pid

:stop_nginx_with_pid
"%NGINX_EXE%" -p "%NGINX_DIR%/" -c conf/nginx.conf -g "pid logs/nginx-windows.pid;" -s quit
for /l %%I in (1,1,5) do (
    call :is_nginx_pid_running
    if errorlevel 1 (
        del "%NGINX_PID_FILE%" >nul 2>&1
        echo [OK] NGINX encerrado.
        exit /b 0
    )
    timeout /t 1 /nobreak >nul
)

echo [AVISO] O NGINX nao encerrou graciosamente; finalizando apenas o PID %NGINX_PID%.
call :is_nginx_pid_running
if errorlevel 1 (
    del "%NGINX_PID_FILE%" >nul 2>&1
    echo [OK] NGINX encerrado.
    exit /b 0
)
taskkill /F /T /PID %NGINX_PID% >nul 2>&1
if errorlevel 1 (
    echo [ERRO] Nao foi possivel encerrar o processo NGINX %NGINX_PID%.
    exit /b 1
)
call :is_nginx_pid_running
if not errorlevel 1 (
    echo [ERRO] O processo NGINX %NGINX_PID% continua ativo.
    exit /b 1
)
del "%NGINX_PID_FILE%" >nul 2>&1
echo [OK] NGINX encerrado.
exit /b 0

:recover_stale_nginx_pid
del "%NGINX_PID_FILE%" >nul 2>&1
call :recover_nginx_pid
if errorlevel 1 (
    echo [INFO] PID antigo removido; nenhum NGINX desta instalacao foi encontrado.
    exit /b 0
)
set "NGINX_PID="
for /f "usebackq tokens=1" %%I in ("%NGINX_PID_FILE%") do set "NGINX_PID=%%I"
call :is_nginx_pid_running
if errorlevel 1 (
    echo [ERRO] Nao foi possivel validar o PID recuperado do NGINX.
    exit /b 1
)
goto :stop_nginx_with_pid

:recover_nginx_pid
set "NGINX_DISCOVERY_FILE=%TEMP%\fulltime-nginx-master-%RANDOM%.tmp"
powershell.exe -NoProfile -Command "$exe = '%NGINX_EXE%'; $procs = @(Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'nginx.exe' -and $_.ExecutablePath -ieq $exe -and $_.CommandLine -like '*-c conf/nginx.conf*' }); $ids = @($procs | ForEach-Object { $_.ProcessId }); $master = $procs | Where-Object { $ids -notcontains $_.ParentProcessId } | Select-Object -First 1; if ($master) { $master.ProcessId }" > "%NGINX_DISCOVERY_FILE%"
if errorlevel 1 (
    del "%NGINX_DISCOVERY_FILE%" >nul 2>&1
    exit /b 1
)
set "NGINX_MASTER_PID="
set /p "NGINX_MASTER_PID="<"%NGINX_DISCOVERY_FILE%"
del "%NGINX_DISCOVERY_FILE%" >nul 2>&1
if not defined NGINX_MASTER_PID exit /b 1
set "NGINX_PID=%NGINX_MASTER_PID%"
call :is_nginx_pid_running
if errorlevel 1 exit /b 1
>"%NGINX_PID_FILE%" echo %NGINX_PID%
if errorlevel 1 exit /b 1
echo [INFO] PID do processo principal do NGINX recuperado.
exit /b 0

:is_nginx_pid_running
tasklist /FI "IMAGENAME eq nginx.exe" /FI "PID eq %NGINX_PID%" | findstr /I /C:"nginx.exe" >nul
if errorlevel 1 exit /b 1
powershell.exe -NoProfile -Command "$p = Get-CimInstance Win32_Process -Filter 'ProcessId=%NGINX_PID%'; if ($p -and $p.ExecutablePath -ieq '%NGINX_EXE%') { exit 0 } else { exit 1 }" >nul 2>&1
if errorlevel 1 exit /b 1
exit /b 0

:stop_node_port
set "TARGET_PORT=%~1"
set "PORT_STOP_ERROR="
for /f "tokens=5" %%I in ('netstat -ano -p tcp ^| findstr /R /C:":%TARGET_PORT% .*LISTENING"') do (
    call :stop_node_pid %%I
    if errorlevel 1 set "PORT_STOP_ERROR=1"
)
if defined PORT_STOP_ERROR exit /b 1
exit /b 0

:stop_node_pid
set "NODE_PID=%~1"
tasklist /FI "IMAGENAME eq node.exe" /FI "PID eq %NODE_PID%" | findstr /I /C:"node.exe" >nul
if errorlevel 1 exit /b 0
powershell.exe -NoProfile -Command "$p = Get-CimInstance Win32_Process -Filter 'ProcessId=%NODE_PID%'; if ($p -and $p.CommandLine -like '*%PROJECT_DIR%\server.js*') { exit 0 } else { exit 1 }" >nul 2>&1
if errorlevel 1 (
    echo [AVISO] PID %NODE_PID% na porta %TARGET_PORT% nao foi identificado como FullTime Node; deixado ativo.
    exit /b 1
)
taskkill /F /PID %NODE_PID% >nul 2>&1
if errorlevel 1 (
    echo [ERRO] Nao foi possivel encerrar o Node PID %NODE_PID%.
    exit /b 1
)
echo [OK] FullTime Node PID %NODE_PID% encerrado.
exit /b 0

:stop_mysql
set "MYSQL_STOP_ERROR="
for /f "tokens=5" %%I in ('netstat -ano -p tcp ^| findstr /R /C:":3306 .*LISTENING"') do (
    call :stop_mysql_pid %%I
    if errorlevel 1 set "MYSQL_STOP_ERROR=1"
)
if defined MYSQL_STOP_ERROR exit /b 1
exit /b 0

:stop_mysql_pid
if defined MYSQL_STOP_REQUESTED exit /b 0
set "MYSQL_PID=%~1"
tasklist /FI "IMAGENAME eq mysqld.exe" /FI "PID eq %MYSQL_PID%" | findstr /I /C:"mysqld.exe" >nul
if errorlevel 1 exit /b 0
powershell.exe -NoProfile -Command "$p = Get-CimInstance Win32_Process -Filter 'ProcessId=%MYSQL_PID%'; if ($p -and $p.ExecutablePath -ieq '%MYSQL_DIR%\bin\mysqld.exe') { exit 0 } else { exit 1 }" >nul 2>&1
if errorlevel 1 (
    echo [INFO] MySQL PID %MYSQL_PID% nao pertence ao MySQL portatil; deixado ativo.
    exit /b 0
)
set "MYSQL_STOP_REQUESTED=1"
"%MYSQL_DIR%\bin\mysqladmin.exe" -h 127.0.0.1 -u root shutdown >nul 2>&1
if errorlevel 1 (
    echo [ERRO] Nao foi possivel solicitar o encerramento do MySQL PID %MYSQL_PID%.
    exit /b 1
)
echo [OK] Encerramento solicitado ao MySQL PID %MYSQL_PID%.
exit /b 0
