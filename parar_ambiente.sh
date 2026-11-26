#!/usr/bin/env bash

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "$SCRIPT_DIR/server.js" ]]; then
    PROJECT_DIR="$SCRIPT_DIR"
    DEV_DIR="$(dirname "$PROJECT_DIR")"
else
    DEV_DIR="$SCRIPT_DIR/dev"
    PROJECT_DIR="$DEV_DIR/fulltime-node"
fi
MYSQL_DIR="$DEV_DIR/mysql"
NGINX_DIR="$DEV_DIR/nginx"
RUN_DIR="$PROJECT_DIR/logs/runtime"
NGINX_PID_FILE="$NGINX_DIR/logs/nginx-linux.pid"
ERRORS=0

is_valid_pid() {
    [[ "${1:-}" =~ ^[0-9]+$ ]]
}

is_live_pid() {
    is_valid_pid "$1" && [[ -e "/proc/$1/exe" ]]
}

process_exe() {
    readlink -f "/proc/$1/exe" 2>/dev/null
}

is_our_nginx_pid() {
    local pid="$1"
    local actual_exe expected_exe cmdline
    is_live_pid "$pid" || return 1
    actual_exe="$(process_exe "$pid")" || return 1
    [[ "$(basename "$actual_exe")" == nginx ]] || return 1

    if [[ -n "${NGINX_BIN:-}" ]]; then
        expected_exe="$(readlink -f "$NGINX_BIN" 2>/dev/null)" || return 1
        [[ "$actual_exe" == "$expected_exe" ]] || return 1
    fi

    cmdline="$(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null)" || return 1
    [[ "$cmdline" == *"$NGINX_DIR"* && "$cmdline" == *"conf/nginx.conf"* ]]
}

is_our_node_pid() {
    local pid="$1"
    local port="$2"
    local actual_exe cmdline environ node_name
    is_live_pid "$pid" || return 1
    actual_exe="$(process_exe "$pid")" || return 1
    node_name="$(basename "$actual_exe")"
    [[ "$node_name" == node || "$node_name" == nodejs ]] || return 1
    cmdline="$(tr '\0' '\n' < "/proc/$pid/cmdline" 2>/dev/null)" || return 1
    environ="$(tr '\0' '\n' < "/proc/$pid/environ" 2>/dev/null)" || return 1
    grep -F -x -q -- "$PROJECT_DIR/server.js" <<< "$cmdline" || return 1
    grep -F -x -q -- "PORT=$port" <<< "$environ"
}

is_our_mysql_pid() {
    local pid="$1"
    local actual_exe expected_exe cmdline
    is_live_pid "$pid" || return 1
    actual_exe="$(process_exe "$pid")" || return 1
    expected_exe="$(readlink -f "$MYSQL_DIR/bin/mysqld" 2>/dev/null)" || return 1
    [[ "$actual_exe" == "$expected_exe" ]] || return 1
    cmdline="$(tr '\0' '\n' < "/proc/$pid/cmdline" 2>/dev/null)" || return 1
    grep -F -x -q -- "--datadir=$MYSQL_DIR/data" <<< "$cmdline"
}

read_pid_file() {
    local file="$1"
    local pid=""
    [[ -r "$file" ]] || return 1
    IFS= read -r pid < "$file" || [[ -n "$pid" ]] || return 1
    is_valid_pid "$pid" || return 1
    printf '%s\n' "$pid"
}

wait_for_process_exit() {
    local pid="$1"
    local validator="$2"
    local extra="${3:-}"
    local attempts="$4"
    local attempt
    for ((attempt = 0; attempt < attempts; attempt++)); do
        if [[ -n "$extra" ]]; then
            "$validator" "$pid" "$extra" || return 0
        else
            "$validator" "$pid" || return 0
        fi
        sleep 1
    done
    if [[ -n "$extra" ]]; then
        ! "$validator" "$pid" "$extra"
    else
        ! "$validator" "$pid"
    fi
}

stop_nginx() {
    echo "[1/3] Encerrando Nginx..."
    if [[ ! -e "$NGINX_PID_FILE" ]]; then
        echo "[INFO] Arquivo PID do Nginx ausente; nenhum processo sera encerrado."
        return 0
    fi

    local pid actual_exe nginx_bin expected_exe
    if ! pid="$(read_pid_file "$NGINX_PID_FILE")"; then
        echo "[ERRO] PID invalido em $NGINX_PID_FILE; arquivo mantido para verificacao."
        return 1
    fi
    if ! is_live_pid "$pid"; then
        rm -f -- "$NGINX_PID_FILE"
        echo "[INFO] PID antigo do Nginx removido; processo ja estava parado."
        return 0
    fi
    if ! is_our_nginx_pid "$pid"; then
        echo "[ERRO] O PID $pid nao corresponde ao Nginx desta aplicacao; processo deixado ativo."
        return 1
    fi

    actual_exe="$(process_exe "$pid")" || {
        echo "[ERRO] Nao foi possivel identificar o executavel Nginx do PID $pid."
        return 1
    }
    if [[ -n "${NGINX_BIN:-}" ]]; then
        expected_exe="$(readlink -f "$NGINX_BIN" 2>/dev/null)" || {
            echo "[ERRO] NGINX_BIN nao aponta para um executavel valido."
            return 1
        }
        if [[ "$expected_exe" != "$actual_exe" ]]; then
            echo "[ERRO] O executavel Nginx encontrado nao corresponde ao PID $pid."
            return 1
        fi
    fi
    nginx_bin="$actual_exe"

    "$nginx_bin" -p "$NGINX_DIR/" -c conf/nginx.conf -g "pid logs/nginx-linux.pid;" -s quit || \
        echo "[AVISO] O comando graceful quit falhou; tentarei SIGTERM no master."

    if wait_for_process_exit "$pid" is_our_nginx_pid "" 10; then
        rm -f -- "$NGINX_PID_FILE"
        echo "[OK] Nginx encerrado graciosamente."
        return 0
    fi

    if is_our_nginx_pid "$pid"; then
        echo "[AVISO] Nginx nao encerrou graciosamente; enviando SIGTERM ao master $pid."
        kill -TERM "$pid" 2>/dev/null || true
    fi
    if wait_for_process_exit "$pid" is_our_nginx_pid "" 5; then
        rm -f -- "$NGINX_PID_FILE"
        echo "[OK] Nginx encerrado."
        return 0
    fi

    if is_our_nginx_pid "$pid"; then
        echo "[AVISO] Nginx continua ativo; enviando SIGKILL ao master $pid."
        kill -KILL "$pid" 2>/dev/null || true
    fi
    if wait_for_process_exit "$pid" is_our_nginx_pid "" 5; then
        rm -f -- "$NGINX_PID_FILE"
        echo "[OK] Nginx encerrado."
        return 0
    fi
    echo "[ERRO] Nao foi possivel encerrar o Nginx PID $pid."
    return 1
}

stop_node_instance() {
    local port="$1"
    local pid_file="$RUN_DIR/node-$port.pid"
    local pid
    if [[ ! -e "$pid_file" ]]; then
        echo "[INFO] Sem PID registrado para Node na porta $port."
        return 0
    fi
    if ! pid="$(read_pid_file "$pid_file")"; then
        echo "[ERRO] PID invalido em $pid_file; arquivo mantido para verificacao."
        return 1
    fi
    if ! is_live_pid "$pid"; then
        rm -f -- "$pid_file"
        echo "[INFO] PID antigo do Node na porta $port removido."
        return 0
    fi
    if ! is_our_node_pid "$pid" "$port"; then
        echo "[ERRO] O PID $pid nao corresponde a esta instancia FullTime; processo deixado ativo."
        return 1
    fi

    kill -TERM "$pid" 2>/dev/null || true
    if wait_for_process_exit "$pid" is_our_node_pid "$port" 10; then
        rm -f -- "$pid_file"
        echo "[OK] Node na porta $port encerrado."
        return 0
    fi
    if is_our_node_pid "$pid" "$port"; then
        echo "[AVISO] Node na porta $port nao encerrou com SIGTERM; enviando SIGKILL."
        kill -KILL "$pid" 2>/dev/null || true
    fi
    if wait_for_process_exit "$pid" is_our_node_pid "$port" 5; then
        rm -f -- "$pid_file"
        echo "[OK] Node na porta $port encerrado."
        return 0
    fi
    echo "[ERRO] Nao foi possivel encerrar o Node PID $pid na porta $port."
    return 1
}

stop_mysql() {
    echo "[3/3] Encerrando MySQL..."
    local pid_file="$RUN_DIR/mysql.pid"
    local pid
    local attempt
    if [[ ! -e "$pid_file" ]]; then
        echo "[INFO] Sem PID registrado para MySQL; nenhum processo sera encerrado."
        return 0
    fi
    if ! pid="$(read_pid_file "$pid_file")"; then
        echo "[ERRO] PID invalido em $pid_file; arquivo mantido para verificacao."
        return 1
    fi
    if ! is_live_pid "$pid"; then
        rm -f -- "$pid_file"
        echo "[INFO] PID antigo do MySQL removido."
        return 0
    fi
    if ! is_our_mysql_pid "$pid"; then
        echo "[ERRO] O PID $pid nao corresponde ao MySQL portatil; processo deixado ativo."
        return 1
    fi
    if [[ ! -x "$MYSQL_DIR/bin/mysqladmin" ]]; then
        echo "[ERRO] mysqladmin nao encontrado em $MYSQL_DIR/bin."
        return 1
    fi
    if ! "$MYSQL_DIR/bin/mysqladmin" --protocol=tcp -h 127.0.0.1 -u root shutdown; then
        echo "[ERRO] mysqladmin nao conseguiu encerrar o MySQL PID $pid."
        return 1
    fi
    for ((attempt = 0; attempt < 30; attempt++)); do
        if ! is_our_mysql_pid "$pid"; then
            rm -f -- "$pid_file"
            echo "[OK] MySQL encerrado."
            return 0
        fi
        sleep 1
    done
    echo "[ERRO] MySQL PID $pid continua ativo; arquivo PID foi mantido."
    return 1
}

if ! stop_nginx; then
    ERRORS=1
fi

echo "[2/3] Encerrando instancias Node..."
for port in 3001 3002 3003 3004; do
    if ! stop_node_instance "$port"; then
        ERRORS=1
    fi
done

if ! stop_mysql; then
    ERRORS=1
fi

echo
if [[ "$ERRORS" -eq 0 ]]; then
    echo "Ambiente FullTime encerrado."
else
    echo "[ERRO] Alguns servicos nao puderam ser encerrados; consulte as mensagens acima."
fi
exit "$ERRORS"
