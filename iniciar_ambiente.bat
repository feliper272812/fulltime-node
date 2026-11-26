@echo off
setlocal
title Ambiente Portatil - Node.js, MySQL, Express, EJS e Nginx
echo ========================================================
echo   Iniciando Ambiente Portatil (Sem Admin)
echo ========================================================

set "SCRIPT_DIR=%~dp0"
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"
if exist "%SCRIPT_DIR%\server.js" (
    set "PROJECT_DIR=%SCRIPT_DIR%"
    for %%I in ("%SCRIPT_DIR%\..") do set "DEV_DIR=%%~fI"
) else (
    set "DEV_DIR=%SCRIPT_DIR%\dev"
    set "PROJECT_DIR=%DEV_DIR%\fulltime-node"
)
set "NODE_DIR=%DEV_DIR%\nodejs"
set "MYSQL_DIR=%DEV_DIR%\mysql"
set "NGINX_DIR=%DEV_DIR%\nginx"
set "NGINX_EXE=%NGINX_DIR%\nginx.exe"
set "MYSQLADMIN=%MYSQL_DIR%\bin\mysqladmin.exe"

if not exist "%NODE_DIR%\node.exe" (
    echo [ERRO] Node.js nao encontrado em "%NODE_DIR%".
    goto :startup_failed
)
if not exist "%NODE_DIR%\npm.cmd" (
    echo [ERRO] npm.cmd nao encontrado em "%NODE_DIR%".
    goto :startup_failed
)
if not exist "%MYSQL_DIR%\bin\mysqld.exe" (
    echo [ERRO] MySQL nao encontrado em "%MYSQL_DIR%\bin".
    goto :startup_failed
)
if not exist "%MYSQLADMIN%" (
    echo [ERRO] mysqladmin.exe nao encontrado em "%MYSQL_DIR%\bin".
    goto :startup_failed
)
if not exist "%PROJECT_DIR%\server.js" (
    echo [ERRO] Aplicacao nao encontrada em "%PROJECT_DIR%".
    goto :startup_failed
)
if not exist "%NGINX_EXE%" (
    echo [ERRO] nginx.exe nao encontrado em "%NGINX_DIR%".
    goto :startup_failed
)
if not exist "%NGINX_DIR%\conf\nginx.conf" (
    echo [ERRO] Configuracao Nginx nao encontrada em "%NGINX_DIR%\conf".
    goto :startup_failed
)

set "PATH=%NODE_DIR%;%MYSQL_DIR%\bin;%PATH%"
if not exist "%MYSQL_DIR%\data" (
    echo [INFO] Inicializando o diretorio de dados do MySQL...
    "%MYSQL_DIR%\bin\mysqld.exe" --initialize-insecure --basedir="%MYSQL_DIR%" --datadir="%MYSQL_DIR%\data"
    if errorlevel 1 (
        echo [ERRO] Falha ao inicializar o MySQL.
        goto :startup_failed
    )
)

if not exist "%PROJECT_DIR%\node_modules\express\package.json" (
    echo [INFO] Dependencias da aplicacao ausentes; executando npm ci...
    pushd "%PROJECT_DIR%"
    call "%NODE_DIR%\npm.cmd" ci
    if errorlevel 1 (
        popd
        echo [ERRO] npm ci falhou.
        goto :startup_failed
    )
    popd
)

if not exist "%NGINX_DIR%\logs" mkdir "%NGINX_DIR%\logs"
if not exist "%NGINX_DIR%\temp" mkdir "%NGINX_DIR%\temp"

echo [INFO] Validando configuracao do Nginx...
"%NGINX_EXE%" -p "%NGINX_DIR%/" -c conf/nginx.conf -g "pid logs/nginx-windows.pid;" -t
if errorlevel 1 (
    echo [ERRO] A configuracao do Nginx e invalida.
    goto :startup_failed
)

set "NGINX_RUNNING="
set "NGINX_WITHOUT_PID="
if exist "%NGINX_DIR%\logs\nginx-windows.pid" call :check_nginx_running
if not defined NGINX_RUNNING del "%NGINX_DIR%\logs\nginx-windows.pid" >nul 2>&1
if not defined NGINX_RUNNING (
    call :check_nginx_listener
    if not errorlevel 1 (
        set "NGINX_RUNNING=1"
        set "NGINX_WITHOUT_PID=1"
        echo [AVISO] NGINX ja esta ativo na porta 8080 sem arquivo PID; sera reutilizado sem recarga.
    )
)
if not defined NGINX_RUNNING (
    call :check_nginx_process
    if not errorlevel 1 (
        echo [ERRO] Ha um processo NGINX antigo sem listener na porta 8080.
        echo        Execute "%PROJECT_DIR%\parar_ambiente.bat" e tente novamente.
        goto :startup_failed
    )
)

for %%P in (3001 3002 3003 3004) do (
    call :check_port_free %%P
    if errorlevel 1 (
        echo [ERRO] A porta %%P ja esta em uso. Verifique as instancias Node existentes.
        goto :startup_failed
    )
)
if not defined NGINX_RUNNING (
    call :check_port_free 8080
    if errorlevel 1 (
        echo [ERRO] A porta 8080 ja esta em uso e o Nginx nao tem PID ativo.
        goto :startup_failed
    )
)

if not defined SESSION_SECRET call :generate_session_secret
if not defined SESSION_SECRET (
    echo [ERRO] SESSION_SECRET esta vazio.
    goto :startup_failed
)

echo [INFO] Iniciando MySQL...
"%MYSQLADMIN%" -h 127.0.0.1 -u root ping >nul 2>&1
if errorlevel 1 (
    start "MySQL Server Portatil" /MIN "%MYSQL_DIR%\bin\mysqld.exe" --basedir="%MYSQL_DIR%" --datadir="%MYSQL_DIR%\data" --console
)
call :wait_for_mysql
if errorlevel 1 (
    echo [ERRO] MySQL nao ficou pronto. Consulte o log/janela do MySQL.
    goto :startup_failed
)

echo [INFO] Iniciando quatro instancias Node...
for %%P in (3001 3002 3003 3004) do (
    set "PORT=%%P"
    set "HOST=127.0.0.1"
    start "FullTime Node %%P" /MIN "%NODE_DIR%\node.exe" "%PROJECT_DIR%\server.js"
    call :wait_for_http http://127.0.0.1:%%P/
    if errorlevel 1 (
        echo [ERRO] A instancia Node na porta %%P nao ficou pronta.
        goto :startup_failed
    )
    echo [OK] Node ouvindo em 127.0.0.1:%%P
)

echo [INFO] Iniciando ou recarregando o Nginx...
if defined NGINX_RUNNING (
    if defined NGINX_WITHOUT_PID (
        echo [INFO] Mantendo a configuracao do NGINX que ja esta carregada.
    ) else (
        "%NGINX_EXE%" -p "%NGINX_DIR%/" -c conf/nginx.conf -g "pid logs/nginx-windows.pid;" -s reload
    )
) else (
    start "Nginx FullTime" /MIN "%NGINX_EXE%" -p "%NGINX_DIR%/" -c conf/nginx.conf -g "pid logs/nginx-windows.pid;"
)
if errorlevel 1 (
    echo [ERRO] Nao foi possivel iniciar/recarregar o Nginx.
    goto :startup_failed
)
call :wait_for_http http://127.0.0.1:8080/
if errorlevel 1 (
    echo [ERRO] O proxy Nginx nao respondeu em http://127.0.0.1:8080/.
    goto :startup_failed
)

set "PORT="
set "HOST="
set "SESSION_SECRET="
echo.
echo ========================================================
echo   Ambiente Pronto!
echo ========================================================
echo   Aplicacao: http://localhost:8080
echo   Instancias Node: 127.0.0.1:3001, :3002, :3003 e :3004
echo   Nginx: %NGINX_DIR%
echo   Logs das aplicacoes: "%PROJECT_DIR%"
echo ========================================================
echo.
cd /d "%PROJECT_DIR%"
cmd /k
exit /b 0

:check_port_free
set "CHECK_PORT=%~1"
netstat -ano -p tcp | findstr /R /C:":%CHECK_PORT% .*LISTENING" >nul
if errorlevel 1 exit /b 0
exit /b 1

:check_nginx_running
set "NGINX_PID="
for /f "usebackq tokens=1" %%I in ("%NGINX_DIR%\logs\nginx-windows.pid") do set "NGINX_PID=%%I"
if not defined NGINX_PID exit /b 1
echo %NGINX_PID% | findstr /R "^[0-9][0-9]*$" >nul
if errorlevel 1 exit /b 1
tasklist /FI "IMAGENAME eq nginx.exe" /FI "PID eq %NGINX_PID%" | findstr /I /C:"nginx.exe" >nul
if errorlevel 1 exit /b 1
set "NGINX_RUNNING=1"
exit /b 0

:check_nginx_listener
set "NGINX_LISTENER_PID="
for /f "tokens=5" %%I in ('netstat -ano -p tcp ^| findstr /R /C:":8080 .*LISTENING"') do set "NGINX_LISTENER_PID=%%I"
if not defined NGINX_LISTENER_PID exit /b 1
tasklist /FI "IMAGENAME eq nginx.exe" /FI "PID eq %NGINX_LISTENER_PID%" | findstr /I /C:"nginx.exe" >nul
if errorlevel 1 exit /b 1
powershell.exe -NoProfile -Command "$p = Get-CimInstance Win32_Process -Filter 'ProcessId=%NGINX_LISTENER_PID%'; if ($p -and $p.ExecutablePath -ieq '%NGINX_EXE%') { exit 0 } else { exit 1 }" >nul 2>&1
if errorlevel 1 exit /b 1
exit /b 0

:check_nginx_process
powershell.exe -NoProfile -Command "$exe = '%NGINX_EXE%'; $p = Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'nginx.exe' -and $_.ExecutablePath -ieq $exe -and $_.CommandLine -like '*-c conf/nginx.conf*' } | Select-Object -First 1; if ($p) { exit 0 } else { exit 1 }" >nul 2>&1
if errorlevel 1 exit /b 1
exit /b 0

:generate_session_secret
set "SESSION_SECRET_FILE=%TEMP%\fulltime-session-secret-%RANDOM%.tmp"
"%NODE_DIR%\node.exe" -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))" > "%SESSION_SECRET_FILE%"
if errorlevel 1 (
    del "%SESSION_SECRET_FILE%" >nul 2>&1
    echo [ERRO] Nao foi possivel gerar o segredo das sessoes.
    exit /b 1
)
set /p "SESSION_SECRET="<"%SESSION_SECRET_FILE%"
del "%SESSION_SECRET_FILE%" >nul 2>&1
exit /b 0

:wait_for_mysql
for /l %%I in (1,1,90) do (
    "%MYSQLADMIN%" -h 127.0.0.1 -u root ping >nul 2>&1
    if not errorlevel 1 exit /b 0
    timeout /t 1 /nobreak >nul
)
exit /b 1

:wait_for_http
for /l %%I in (1,1,90) do (
    curl.exe --silent --fail --noproxy "*" --output NUL --connect-timeout 2 --max-time 3 "%~1" >nul 2>&1
    if not errorlevel 1 exit /b 0
    timeout /t 1 /nobreak >nul
)
exit /b 1

:startup_failed
echo.
echo [ERRO] Inicializacao interrompida. Verifique os caminhos e logs indicados acima.
pause
exit /b 1
