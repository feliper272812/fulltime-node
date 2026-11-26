#!/usr/bin/env bash

echo "========================================================"
echo "  Iniciando Ambiente Portatil Linux (Sem Root/Sudo)"
echo "========================================================"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "$SCRIPT_DIR/server.js" ]]; then
    PROJECT_DIR="$SCRIPT_DIR"
    DEV_DIR="$(dirname "$PROJECT_DIR")"
else
    DRIVE_ROOT="$SCRIPT_DIR"
    DEV_DIR="$DRIVE_ROOT/dev"
    PROJECT_DIR="$DEV_DIR/fulltime-node"
fi
export NVM_DIR="$DEV_DIR/nvm"
MYSQL_DIR="$DEV_DIR/mysql"
NGINX_DIR="$DEV_DIR/nginx"
RUN_DIR="$PROJECT_DIR/logs/runtime"
NGINX_PID_FILE="$NGINX_DIR/logs/nginx-linux.pid"
NODE_PIDS=()

mkdir -p "$NVM_DIR" "$PROJECT_DIR" "$RUN_DIR"

if [[ ! -s "$NVM_DIR/nvm.sh" ]]; then
    if ! command -v curl >/dev/null 2>&1; then
        echo "[ERRO] curl e necessario para instalar o NVM em $NVM_DIR."
        exit 1
    fi
    echo "[INFO] NVM nao encontrado. Baixando e instalando no pendrive..."
    PROFILE=/dev/null bash -c 'set -o pipefail; curl --fail --location --silent --show-error https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash' || {
        echo "[ERRO] Falha ao instalar o NVM."
        exit 1
    }
fi

if [[ -s "$NVM_DIR/nvm.sh" ]]; then
    # shellcheck disable=SC1090
    . "$NVM_DIR/nvm.sh"
fi

if ! command -v node >/dev/null 2>&1; then
    if ! command -v nvm >/dev/null 2>&1 || ! nvm install --lts || ! nvm use --lts; then
        echo "[ERRO] Node.js LTS nao esta disponivel pelo NVM."
        exit 1
    fi
fi
if ! command -v npm >/dev/null 2>&1; then
    echo "[ERRO] npm nao encontrado junto com o Node.js."
    exit 1
fi
NODE_BIN="$(command -v node)"

if [[ ! -f "$PROJECT_DIR/server.js" ]]; then
    echo "[ERRO] Aplicacao nao encontrada em $PROJECT_DIR."
    exit 1
fi

if [[ -z "${NGINX_BIN:-}" ]]; then
    for candidate in "$NGINX_DIR/sbin/nginx" "$NGINX_DIR/nginx"; do
        if [[ -x "$candidate" ]]; then
            NGINX_BIN="$candidate"
            break
        fi
    done
    if [[ -z "${NGINX_BIN:-}" ]]; then
        NGINX_BIN="$(command -v nginx 2>/dev/null || true)"
    fi
fi
if [[ -z "${NGINX_BIN:-}" || ! -x "$NGINX_BIN" ]]; then
    echo "[ERRO] Nginx compativel com Linux nao foi encontrado."
    echo "       O nginx.exe do Windows nao pode ser executado por este script."
    echo "       Instale um binario Linux em $NGINX_DIR/sbin/nginx ou defina NGINX_BIN."
    exit 1
fi
if [[ ! -f "$NGINX_DIR/conf/nginx.conf" ]]; then
    echo "[ERRO] Configuracao Nginx nao encontrada em $NGINX_DIR/conf/nginx.conf."
    exit 1
fi
mkdir -p "$NGINX_DIR/logs" "$NGINX_DIR/temp"

if [[ ! -d "$PROJECT_DIR/node_modules/express" ]]; then
    echo "[INFO] Dependencias ausentes; executando npm ci..."
    (cd "$PROJECT_DIR" && npm ci) || {
        echo "[ERRO] npm ci falhou."
        exit 1
    }
fi

if [[ -z "${SESSION_SECRET:-}" ]]; then
    if ! SESSION_SECRET="$("$NODE_BIN" -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))")"; then
        echo "[ERRO] Nao foi possivel gerar o segredo das sessoes."
        exit 1
    fi
fi
if [[ -z "$SESSION_SECRET" ]]; then
    echo "[ERRO] SESSION_SECRET esta vazio."
    exit 1
fi
export SESSION_SECRET

"$NGINX_BIN" -p "$NGINX_DIR/" -c conf/nginx.conf -g "pid logs/nginx-linux.pid;" -t || {
    echo "[ERRO] A configuracao do Nginx e invalida."
    exit 1
}

port_is_open() {
    (exec 3<>"/dev/tcp/127.0.0.1/$1") >/dev/null 2>&1
}

wait_for_port() {
    local port="$1"
    local attempts="${2:-90}"
    local attempt
    for ((attempt = 0; attempt < attempts; attempt++)); do
        if port_is_open "$port"; then
            return 0
        fi
        sleep 1
    done
    return 1
}

wait_for_mysql() {
    local attempts="${1:-90}"
    local attempt
    for ((attempt = 0; attempt < attempts; attempt++)); do
        if "$MYSQL_DIR/bin/mysqladmin" --protocol=tcp -h 127.0.0.1 -u root ping >/dev/null 2>&1; then
            return 0
        fi
        sleep 1
    done
    return 1
}

is_our_nginx_running() {
    [[ -f "$NGINX_PID_FILE" ]] || return 1
    local pid
    local actual_exe
    local expected_exe
    pid="$(cat "$NGINX_PID_FILE" 2>/dev/null)" || return 1
    [[ "$pid" =~ ^[0-9]+$ && -e "/proc/$pid/exe" ]] || return 1
    actual_exe="$(readlink -f "/proc/$pid/exe" 2>/dev/null)" || return 1
    expected_exe="$(readlink -f "$NGINX_BIN" 2>/dev/null)" || return 1
    [[ "$actual_exe" == "$expected_exe" ]]
}

for port in 3001 3002 3003 3004; do
    if port_is_open "$port"; then
        echo "[ERRO] A porta $port ja esta em uso. Verifique as instancias Node existentes."
        exit 1
    fi
done

NGINX_RUNNING=0
if is_our_nginx_running; then
    NGINX_RUNNING=1
else
    rm -f "$NGINX_PID_FILE"
    if port_is_open 8080; then
        echo "[ERRO] A porta 8080 ja esta em uso por outro processo."
        exit 1
    fi
fi

cleanup_nodes() {
    local pid
    for pid in "${NODE_PIDS[@]}"; do
        kill "$pid" 2>/dev/null || true
    done
}

start_node_instance() {
    local port="$1"
    PORT="$port" HOST=127.0.0.1 SESSION_SECRET="$SESSION_SECRET" \
        nohup "$NODE_BIN" "$PROJECT_DIR/server.js" >"$RUN_DIR/node-$port.log" 2>&1 &
    local pid=$!
    NODE_PIDS+=("$pid")
    printf '%s\n' "$pid" > "$RUN_DIR/node-$port.pid"
    if ! wait_for_port "$port" 90; then
        echo "[ERRO] A instancia Node na porta $port nao ficou pronta."
        tail -n 40 "$RUN_DIR/node-$port.log"
        return 1
    fi
    echo "[OK] Node ouvindo em 127.0.0.1:$port (PID: $pid)"
}

if [[ -x "$MYSQL_DIR/bin/mysqld" && -x "$MYSQL_DIR/bin/mysqladmin" ]]; then
    if [[ ! -d "$MYSQL_DIR/data" ]]; then
        echo "[INFO] Inicializando banco de dados MySQL..."
        "$MYSQL_DIR/bin/mysqld" --initialize-insecure --basedir="$MYSQL_DIR" --datadir="$MYSQL_DIR/data" || {
            echo "[ERRO] Falha ao inicializar o MySQL."
            exit 1
        }
    fi

    if ! wait_for_mysql 1; then
        echo "[INFO] Iniciando MySQL..."
        nohup "$MYSQL_DIR/bin/mysqld" --basedir="$MYSQL_DIR" --datadir="$MYSQL_DIR/data" \
            --socket="$MYSQL_DIR/mysql.sock" --port=3306 >"$RUN_DIR/mysql.log" 2>&1 &
        printf '%s\n' "$!" > "$RUN_DIR/mysql.pid"
    fi
    if ! wait_for_mysql 90; then
        echo "[ERRO] MySQL nao ficou pronto. Consulte $RUN_DIR/mysql.log."
        cleanup_nodes
        exit 1
    fi
else
    echo "[ERRO] mysqld/mysqladmin Linux nao encontrados em $MYSQL_DIR/bin."
    exit 1
fi

echo "[INFO] Iniciando quatro instancias Node..."
for port in 3001 3002 3003 3004; do
    if ! start_node_instance "$port"; then
        cleanup_nodes
        exit 1
    fi
done

if [[ "$NGINX_RUNNING" -eq 1 ]]; then
    echo "[INFO] Recarregando o Nginx..."
    "$NGINX_BIN" -p "$NGINX_DIR/" -c conf/nginx.conf -g "pid logs/nginx-linux.pid;" -s reload || {
        echo "[ERRO] Nao foi possivel recarregar o Nginx."
        cleanup_nodes
        exit 1
    }
else
    echo "[INFO] Iniciando o Nginx..."
    "$NGINX_BIN" -p "$NGINX_DIR/" -c conf/nginx.conf -g "pid logs/nginx-linux.pid;" || {
        echo "[ERRO] Nao foi possivel iniciar o Nginx."
        cleanup_nodes
        exit 1
    }
fi

if ! wait_for_port 8080 30; then
    echo "[ERRO] O proxy Nginx nao respondeu em http://127.0.0.1:8080/."
    cleanup_nodes
    exit 1
fi

unset SESSION_SECRET PORT HOST
echo ""
echo "========================================================"
echo "  Ambiente Pronto!"
echo "========================================================"
echo "  Aplicacao: http://localhost:8080"
echo "  Instancias Node: 127.0.0.1:3001, :3002, :3003 e :3004"
echo "  Logs e PIDs: $RUN_DIR"
echo "  Parar o Nginx: $NGINX_BIN -p $NGINX_DIR/ -c conf/nginx.conf -g 'pid logs/nginx-linux.pid;' -s stop"
echo "========================================================"
echo ""

exec "${SHELL:-/bin/bash}" -i
