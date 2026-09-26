#!/usr/bin/env bash
# Operacion del dia a dia de Puerto Nuevo. Lo usa el Agente; a mano:
#   bash ./operar.sh reiniciar api|web|todo   reinicia y espera a que responda
#   bash ./operar.sh limpiar                  borra imagenes viejas y cache de Docker
#   bash ./operar.sh logs api|web|postgres    log en vivo de un servicio (Ctrl+C para salir)
#   bash ./operar.sh estado                   servicios y espacio de Docker (una linea JSON por dato)
#   bash ./operar.sh relojes                  relojes checadores leidos de la base (JSON)
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
        # up -d levanta lo que estuviera abajo; restart reinicia lo que ya corria.
        dk compose up -d && dk compose restart api web || falla "No se pudieron reiniciar los servidores."
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
                   c."syncedAt" AS sincronizado, coalesce(p.checadas, 0) AS checadas, p.ultima
            FROM time_clocks c
            LEFT JOIN (
                SELECT "clockSerial", count(*) AS checadas, max("occurredAt") AS ultima
                FROM time_clock_punches GROUP BY "clockSerial"
            ) p ON p."clockSerial" = c."serialNumber"
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
        local servicio
        for servicio in "${SERVICIOS[@]}"; do
            dk compose logs --no-color --tail 1000 "$servicio" >"$d/log-$servicio.txt" 2>&1
        done
    else
        { echo "Docker no responde:"; docker info 2>&1; } >"$d/docker.txt"
    fi
    echo "Diagnostico en $d"
}

main() {
    cd "$(dirname "$0")" || exit 1
    local accion=$1
    shift || true
    case $accion in
        reiniciar | limpiar | logs | estado | relojes | diagnostico) "$accion" "$@" ;;
        *) falla "Uso: bash ./operar.sh reiniciar|limpiar|logs|estado|relojes|diagnostico" ;;
    esac
}

main "$@"; exit
