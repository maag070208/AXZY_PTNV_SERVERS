#!/usr/bin/env bash
# Operacion del dia a dia de Puerto Nuevo. Lo usa el Agente; a mano:
#   bash ./operar.sh reiniciar api|web|todo   reinicia y espera a que responda
#   bash ./operar.sh limpiar                  borra imagenes viejas y cache de Docker
#   bash ./operar.sh logs api|web|postgres    log en vivo de un servicio (Ctrl+C para salir)
#   bash ./operar.sh estado                   servicios y espacio de Docker (una linea JSON por dato)
#   bash ./operar.sh relojes                  relojes checadores leidos de la base (JSON)
#   bash ./operar.sh vigilar                  deja corriendo el vigilante de eventos de Docker
#   bash ./operar.sh diagnostico <carpeta>    deja en <carpeta> lo que soporte necesita

TOTAL_PASOS=1
MENSAJE_FALLA="No se completo la operacion."
source "$(dirname "$0")/comun.sh"

SERVICIOS=(api web postgres)
# case en lugar de un arreglo asociativo: macOS trae bash 3.2.
nombre() { case $1 in api) echo "el API" ;; web) echo "la web" ;; postgres) echo "la base de datos" ;; *) echo "$1" ;; esac; }

exigir_servicio() { # servicio [permitir_todo]
    [[ " ${SERVICIOS[*]} " == *" $1 "* || ($2 == todo && $1 == todo) ]] \
        || falla "Servicio desconocido: '$1' (usa ${SERVICIOS[*]}${2:+ o todo})."
}

reiniciar() { # servicio|todo
    exigir_servicio "$1" todo
    iniciar_log reiniciar
    asegurar_docker
    if [[ $1 == todo ]]; then
        titulo "Reiniciar los servidores"
        # `up -d --wait` levanta lo que estuviera abajo —incluida la base— y espera
        # a que arranque, sin tocar lo que ya corre. Antes era
        # `up -d && restart api web` a ciegas: reiniciaba el API aunque estuviera
        # sano y no comprobaba si la base había vuelto.
        dk compose up -d --wait || falla "No se pudieron levantar los servidores (revisa la base de datos)."
        if responde_ya; then
            echo "El sistema ya responde: no se reinicia nada."
        else
            echo "Todavía no responde: reiniciando el API y la web."
            dk compose restart api web || falla "No se pudieron reiniciar los servidores."
        fi
    else
        titulo "Reiniciar $(nombre "$1")"
        dk compose up -d "$1" && dk compose restart "$1" || falla "No se pudo reiniciar $(nombre "$1")."
    fi
    [[ $1 == postgres ]] || esperar_sistema
    printf '\n%sLISTO: reiniciado.%s\n' "$VERDE" "$NORMAL"
    terminar_log
}

limpiar() {
    iniciar_log limpiar
    asegurar_docker
    titulo "Borrar imágenes y caché que ya no se usan"
    # Solo imagenes sin etiqueta (las versiones viejas que dejan las actualizaciones)
    # y cache de compilacion: la base (volumen) y las imagenes en uso no se tocan.
    dk image prune -f && dk builder prune -f || falla "No se pudo liberar espacio."
    dk system df
    printf '\n%sLISTO: espacio liberado.%s\n' "$VERDE" "$NORMAL"
    terminar_log
}

logs() { # servicio
    exigir_servicio "$1"
    docker_responde || falla "Docker no responde."
    exec "${DOCKER[@]}" compose logs -f --tail 300 --no-log-prefix "$1"
}

# Una linea por dato, con prefijo, para que el Agente la lea sin adivinar formatos.
estado() {
    if ! docker_responde; then
        echo "DOCKER apagado"
        return
    fi
    echo "DOCKER ok"
    # Segun la version de compose sale un JSON por linea o un arreglo: el Agente acepta ambos.
    dk compose ps -a --format json 2>/dev/null | sed 's/^/SERVICIOS /'
    dk system df --format '{{json .}}' 2>/dev/null | sed 's/^/DF /'
}

relojes() {
    docker_responde || falla "Docker no responde."
    dk exec "$CONTENEDOR_BD" psql -U cartas -d cartas -tA -c '
        SELECT coalesce(jsonb_agg(r ORDER BY r.nombre NULLS LAST, r.serie), $$[]$$::jsonb)
        FROM (
            SELECT c."serialNumber" AS serie, c.name AS nombre, c.url, c."countsAttendance" AS cuenta,
                   c."syncedAt" AS sincronizado, coalesce(p.checadas, 0) AS checadas, p.ultima,
                   coalesce(s.intentos, '[]'::jsonb) AS intentos
            FROM time_clocks c
            LEFT JOIN (
                SELECT "clockSerial", count(*) AS checadas, max("occurredAt") AS ultima
                FROM time_clock_punches GROUP BY "clockSerial"
            ) p ON p."clockSerial" = c."serialNumber"
            -- Timeline de sincronizacion: los ultimos 20 intentos de cada reloj.
            LEFT JOIN LATERAL (
                SELECT jsonb_agg(e ORDER BY e."startedAt" DESC) AS intentos
                FROM (
                    SELECT "startedAt", "finishedAt", trigger, ok, "readCount", "newCount", error
                    FROM time_clock_sync_events
                    WHERE "clockSerial" = c."serialNumber"
                    ORDER BY "startedAt" DESC
                    LIMIT 20
                ) e
            ) s ON true
        ) r' | sed 's/^/RELOJES /'
}

# Todo en texto; el .env solo con sus claves (y si estan vacias), nunca los valores.
diagnostico() { # carpeta
    [[ -n $1 ]] || falla "Falta la carpeta de destino."
    mkdir -p "$1" || falla "No pude crear $1."
    local d=$1
    {
        echo "Fecha: $(date '+%Y-%m-%d %H:%M:%S %z')"
        echo "Sistema: $(uname -a)"
        [[ -f /etc/os-release ]] && grep -E '^(PRETTY_NAME|VERSION)=' /etc/os-release
        echo "Git: $(git -c safe.directory="$PWD" log -1 --format='%h %ci %s' 2>&1)"
        echo "Cambios locales:"; git -c safe.directory="$PWD" -c core.fileMode=false status --short 2>&1
        echo; echo "Espacio en disco:"; df -h . 2>&1
    } >"$d/sistema.txt"
    if [[ -f .env ]]; then
        sed -n 's/^[[:space:]]*\([A-Za-z0-9_]*\)[[:space:]]*=[[:space:]]*\(.*\)$/\1 \2/p' .env |
            while read -r clave valor; do
                if [[ -z $valor || $valor == "''" || $valor == '""' ]]; then echo "$clave=(vacia)"; else echo "$clave=(con valor)"; fi
            done >"$d/env-claves.txt"
    else
        echo "No hay .env" >"$d/env-claves.txt"
    fi
    if docker_responde; then
        {
            dk version 2>&1; echo; dk compose version 2>&1; echo
            dk compose ps -a 2>&1; echo
            dk system df 2>&1; echo
            dk compose images 2>&1
        } >"$d/docker.txt"

        # El estado del engine y de los contenedores: es lo que distingue "se
        # cayó el engine" de "alguien paró un contenedor". En `salida=`, 0 es un
        # stop limpio (SIGTERM), 137 es que lo mataron (SIGKILL) y `oom=true` es
        # que fue la memoria. Los `reinicios` y las horas dicen si la base se
        # reinició sola y cuánto vivió.
        {
            dk info 2>&1
            echo
            echo "== desde cuándo =="
            echo "WSL:     $(uptime -s 2>/dev/null || echo '?')  ($(uptime -p 2>/dev/null || echo '?'))"
            echo "dockerd: $(ps -o lstart= -C dockerd 2>/dev/null | head -1 | sed 's/^ *//')"
            echo
            echo "== contenedores =="
            local id
            for id in $(dk ps -aq 2>/dev/null); do
                dk inspect --format '{{.Name}}  creado={{.Created}}  arrancado={{.State.StartedAt}}  terminado={{.State.FinishedAt}}  reinicios={{.RestartCount}}  salida={{.State.ExitCode}}  oom={{.State.OOMKilled}}' "$id" 2>&1
            done
        } >"$d/docker-engine.txt" 2>&1

        # El log del propio engine: si se cayó o lo pararon, aquí queda el motivo.
        if command -v journalctl >/dev/null 2>&1 && journalctl -u docker -n 300 --no-pager >/dev/null 2>&1; then
            journalctl -u docker -n 300 --no-pager >"$d/docker-engine.log" 2>&1
        elif [[ -f /var/log/docker.log ]]; then
            tail -300 /var/log/docker.log >"$d/docker-engine.log" 2>&1
        else
            echo "Sin log del engine: ni 'journalctl -u docker' ni /var/log/docker.log." >"$d/docker-engine.log"
        fi

        local servicio
        for servicio in "${SERVICIOS[@]}"; do
            dk compose logs --no-color --tail 1000 "$servicio" >"$d/log-$servicio.txt" 2>&1
        done
    else
        { echo "Docker no responde:"; docker info 2>&1; } >"$d/docker.txt"
    fi

    # El registro del vigilante (lo que de verdad pasó, evento por evento) va
    # SIEMPRE y completo: no depende de quedar entre los 10 logs más recientes.
    local v
    for v in logs/docker-eventos-*.log; do
        [[ -f $v ]] && cp "$v" "$d/"
    done

    # Desde WSL se le puede preguntar a Windows cuándo arrancó: si la PC se
    # reinició, todo lo demás se explica solo. Best-effort y con tope de tiempo.
    if command -v powershell.exe >/dev/null 2>&1; then
        local consulta="(Get-CimInstance Win32_OperatingSystem).LastBootUpTime"
        if command -v timeout >/dev/null 2>&1; then
            timeout 20 powershell.exe -NoProfile -Command "$consulta" 2>/dev/null | tr -d '\r' >"$d/windows-arranque.txt"
        else
            powershell.exe -NoProfile -Command "$consulta" 2>/dev/null | tr -d '\r' >"$d/windows-arranque.txt"
        fi
        echo "PC (Windows) arrancó: $(head -1 "$d/windows-arranque.txt")" >>"$d/sistema.txt"
    fi

    echo "Diagnostico en $d"
}

# Deja corriendo el vigilante (los eventos de Docker). Es idempotente y a
# propósito NO usa `iniciar_log`: lo llama el Agente cada pocos minutos, y un log
# por llamada llenaría logs/ y sacaría a los demás de la rotación de 30.
vigilar() {
    if [[ -f logs/vigilar.pid ]] && kill -0 "$(cat logs/vigilar.pid 2>/dev/null)" 2>/dev/null; then
        echo "El vigilante ya está corriendo (pid $(cat logs/vigilar.pid))."
        return 0
    fi
    [[ -f ./vigilar.sh ]] || { echo "AVISO: no encuentro vigilar.sh (actualiza Puerto Nuevo)."; return 0; }
    nohup bash ./vigilar.sh >/dev/null 2>&1 &
    sleep 1
    if [[ -f logs/vigilar.pid ]]; then
        echo "Vigilante arrancado (pid $(cat logs/vigilar.pid)): los eventos quedan en logs/docker-eventos-*.log"
    else
        echo "AVISO: no se pudo arrancar el vigilante."
    fi
}

main() {
    cd "$(dirname "$0")" || exit 1
    local accion=$1
    shift || true
    case $accion in
        reiniciar | limpiar | logs | estado | relojes | vigilar | diagnostico) "$accion" "$@" ;;
        *) falla "Uso: bash ./operar.sh reiniciar|limpiar|logs|estado|relojes|vigilar|diagnostico" ;;
    esac
}

main "$@"; exit
