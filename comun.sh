# Funciones compartidas por actualizar.sh y respaldar.sh (se cargan con `source`).
# Antes de cargarlo, cada script define TOTAL_PASOS y MENSAJE_FALLA.

RESPALDOS_A_GUARDAR=14
LOGS_A_GUARDAR=30
CONTENEDOR_BD=ptnv-postgres
# Las checadas de los relojes son la mayor parte de la base y se pueden volver a
# bajar de los relojes: el respaldo guarda la tabla vacia (ver README, "Restaurar").
TABLAS_SIN_DATOS=(time_clock_punches)

# Colores solo en una terminal; el Agente lee la salida en texto plano.
if [[ -t 1 ]]; then
    AZUL=$'\e[1;36m'; VERDE=$'\e[1;32m'; AMARILLO=$'\e[1;33m'; ROJO=$'\e[1;31m'; NORMAL=$'\e[0m'
fi

# "==> [n/total] Titulo": el Agente usa este formato para su barra de avance.
PASO=0
titulo() { PASO=$((PASO + 1)); printf '\n%s==> [%d/%d] %s%s\n' "$AZUL" "$PASO" "$TOTAL_PASOS" "$1" "$NORMAL"; }
aviso()  { printf '%sAVISO: %s%s\n' "$AMARILLO" "$1" "$NORMAL"; }
bien()   { printf '%s%s%s\n' "$VERDE" "$1" "$NORMAL"; }
falla()  {
    printf '\n%sERROR: %s%s\n' "$ROJO" "$1" "$NORMAL"
    printf '%s%s Detalle en: %s%s\n' "$ROJO" "$MENSAJE_FALLA" "$LOG" "$NORMAL"
    exit 1
}

# Entra a la carpeta del script y manda toda la salida tambien a logs/<nombre>-<sello>.log.
iniciar_log() { # nombre
    cd "$(dirname "$0")" || exit 1
    mkdir -p logs respaldos
    SELLO=$(date +%Y%m%d-%H%M%S)
    LOG="$PWD/logs/$1-$SELLO.log"
    exec > >(tee -a "$LOG") 2>&1
}

borrar_viejos() { # carpeta patron cuantos_guardar
    ls -1t "$1"/$2 2>/dev/null | tail -n +$(($3 + 1)) | xargs -r rm -f --
}

terminar_log() { borrar_viejos logs '*.log' "$LOGS_A_GUARDAR"; }

# Con sudo solo si el usuario no esta en el grupo docker.
DOCKER=(docker)
dk() { "${DOCKER[@]}" "$@"; }

asegurar_docker() {
    command -v docker >/dev/null || falla "No encuentro 'docker' (en Windows se busca dentro de WSL)."
    local salida
    salida=$(docker info 2>&1) && return 0
    if grep -qi 'permission denied' <<<"$salida"; then
        DOCKER=(sudo -n docker)
        [[ -t 0 ]] && DOCKER=(sudo docker)
        dk info >/dev/null 2>&1 && return 0
    fi
    echo "Docker no esta corriendo: intentando arrancarlo..."
    if [[ $(uname) == Darwin ]]; then
        open -a Docker 2>/dev/null || true
    else
        # En una terminal sudo puede pedir la contrasena; desde el Agente no hay donde escribirla.
        local sudo=(sudo -n)
        [[ -t 0 ]] && sudo=(sudo)
        "${sudo[@]}" service docker start >/dev/null 2>&1 || "${sudo[@]}" systemctl start docker >/dev/null 2>&1 || true
    fi
    local limite=$((SECONDS + 90))
    while ((SECONDS < limite)); do
        dk info >/dev/null 2>&1 && return 0
        sleep 5
    done
    falla "Docker no responde. Abre Docker Desktop, o en Linux/WSL corre 'sudo service docker start', y vuelve a intentar."
}

# Deja en RESPALDO la ruta del respaldo nuevo. La base se levanta primero: si el
# sistema estaba apagado, igual hay respaldo.
respaldar_bd() {
    RESPALDO="respaldos/cartas-$SELLO.dump"
    local excluir=() tabla
    for tabla in "${TABLAS_SIN_DATOS[@]}"; do excluir+=("--exclude-table-data=$tabla"); done
    dk compose up -d --wait postgres || falla "La base de datos no arranco."
    dk exec "$CONTENEDOR_BD" pg_dump -U cartas -d cartas -Fc "${excluir[@]}" >"$RESPALDO.parcial" \
        || { rm -f "$RESPALDO.parcial"; falla "No se pudo respaldar la base de datos."; }
    mv "$RESPALDO.parcial" "$RESPALDO"
    echo "Respaldo: $PWD/$RESPALDO ($(du -h "$RESPALDO" | cut -f1)), sin las checadas de los relojes."
    borrar_viejos respaldos '*.dump' "$RESPALDOS_A_GUARDAR"
}
