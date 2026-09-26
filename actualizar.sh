#!/usr/bin/env bash
# Actualiza Puerto Nuevo. Corre dentro de WSL, desde la carpeta AXZY_PTNV_SERVERS:
#   1. Revisa que Docker responda (si no, intenta arrancarlo).
#   2. Trae la configuracion nueva de este repositorio (git pull).
#   3. Respalda la base de datos en respaldos/ (guarda los ultimos 14).
#   4. Baja las imagenes nuevas del API y la web.
#   5. Aplica las migraciones (prisma migrate deploy) y se detiene si fallan:
#      el sistema viejo sigue corriendo.
#   6. Reinicia los servidores con la version nueva y revisa /api/v1/health.
#   7. Borra las imagenes viejas.
# Uso normal: doble clic en Actualizar.cmd. A mano: bash ./actualizar.sh
# El detalle de cada corrida queda en logs/.

RESPALDOS_A_GUARDAR=14
LOGS_A_GUARDAR=30
ESPERA_SEGUNDOS=180
CONTENEDOR_BD=ptnv-postgres
URL_API=http://localhost:4001/api/v1/health
URL_WEB=http://localhost:8080/api/v1/health
IMAGENES=(axzydev/axzy_ptnv_api:latest axzydev/axzy_ptnv_web:latest)

AZUL=$'\e[1;36m'; VERDE=$'\e[1;32m'; AMARILLO=$'\e[1;33m'; ROJO=$'\e[1;31m'; NORMAL=$'\e[0m'

titulo() { printf '\n%s==> %s%s\n' "$AZUL" "$1" "$NORMAL"; }
aviso()  { printf '%sAVISO: %s%s\n' "$AMARILLO" "$1" "$NORMAL"; }
bien()   { printf '%s%s%s\n' "$VERDE" "$1" "$NORMAL"; }
falla()  {
    printf '\n%sERROR: %s%s\n' "$ROJO" "$1" "$NORMAL"
    printf '%sLa actualizacion se detuvo en ese paso. Detalle en: %s%s\n' "$ROJO" "$LOG" "$NORMAL"
    exit 1
}

# Con sudo solo si el usuario de WSL no esta en el grupo docker.
DOCKER=(docker)
dk() { "${DOCKER[@]}" "$@"; }

asegurar_docker() {
    command -v docker >/dev/null || falla "No encuentro 'docker' dentro de WSL."
    local salida
    salida=$(docker info 2>&1) && return 0
    if grep -qi 'permission denied' <<<"$salida"; then
        DOCKER=(sudo docker)
        dk info >/dev/null 2>&1 && return 0
    fi
    echo "Docker no esta corriendo: intentando arrancarlo..."
    sudo service docker start >/dev/null 2>&1 || true
    local limite=$((SECONDS + 90))
    while ((SECONDS < limite)); do
        dk info >/dev/null 2>&1 && return 0
        sleep 5
    done
    falla "Docker no responde. Si usas Docker Desktop, abrelo; si no, corre 'sudo service docker start' y vuelve a intentar."
}

leer_claves() { sed -n 's/^[[:space:]]*\([A-Za-z0-9_]*\)[[:space:]]*=.*/\1/p' "$1"; }

# git no toca el .env: si la configuracion nueva trae variables, solo se avisa.
avisar_variables_nuevas() {
    if [[ ! -f .env ]]; then
        aviso "no hay archivo .env; se usan los valores por defecto."
        return
    fi
    local faltan
    faltan=$(comm -13 <(leer_claves .env | sort -u) <(leer_claves .env.example | sort -u) | paste -sd, -)
    [[ -n $faltan ]] && aviso "faltan en .env (ver README, paso 4): $faltan"
}

id_imagen() { dk image inspect --format '{{.Id}}' "$1" 2>/dev/null; }

borrar_viejos() { # carpeta patron cuantos_guardar
    ls -1t "$1"/$2 2>/dev/null | tail -n +$(($3 + 1)) | xargs -r rm -f --
}

esperar_url() { # url nombre
    local limite=$((SECONDS + ESPERA_SEGUNDOS)) codigo
    printf 'Esperando %s' "$2"
    while ((SECONDS < limite)); do
        codigo=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$1")
        if [[ $codigo == 200 ]]; then
            printf '\n'
            bien "$2 responde (200 en $1)."
            return 0
        fi
        printf '.'
        sleep 3
    done
    printf '\n'
    return 1
}

main() {
    cd "$(dirname "$0")" || exit 1
    mkdir -p logs respaldos
    local sello
    sello=$(date +%Y%m%d-%H%M%S)
    LOG="$PWD/logs/actualizar-$sello.log"
    exec > >(tee -a "$LOG") 2>&1

    echo "Actualizando Puerto Nuevo en $PWD ($(date '+%d/%m/%Y %H:%M'))"
    for programa in git curl; do
        command -v "$programa" >/dev/null || falla "No encuentro '$programa' dentro de WSL (sudo apt install $programa)."
    done
    asegurar_docker

    titulo "Traer la configuracion nueva (git pull)"
    # Sin nadie frente a la PC, git no debe quedarse esperando usuario o contrasena.
    # En /mnt/c los permisos de archivo no son confiables: se ignoran.
    GIT_TERMINAL_PROMPT=0 git -c safe.directory="$PWD" -c core.fileMode=false pull --ff-only \
        || falla "git pull no pudo traer los cambios."
    avisar_variables_nuevas

    # La base se levanta primero: si el sistema estaba apagado, igual hay respaldo.
    titulo "Respaldar la base de datos"
    local respaldo="respaldos/cartas-$sello.dump"
    dk compose up -d --wait postgres || falla "La base de datos no arranco."
    dk exec "$CONTENEDOR_BD" pg_dump -U cartas -d cartas -Fc >"$respaldo.parcial" \
        || { rm -f "$respaldo.parcial"; falla "No se pudo respaldar la base de datos."; }
    mv "$respaldo.parcial" "$respaldo"
    echo "Respaldo: $PWD/$respaldo ($(du -h "$respaldo" | cut -f1))"
    borrar_viejos respaldos '*.dump' "$RESPALDOS_A_GUARDAR"

    titulo "Bajar las imagenes nuevas"
    local antes=() imagen i
    for imagen in "${IMAGENES[@]}"; do antes+=("$(id_imagen "$imagen")"); done
    dk compose pull || falla "No se pudieron bajar las imagenes (revisa el internet)."
    for i in "${!IMAGENES[@]}"; do
        if [[ $(id_imagen "${IMAGENES[i]}") == "${antes[i]}" ]]; then
            echo "  ${IMAGENES[i]}: sin cambios"
        else
            bien "  ${IMAGENES[i]}: version nueva"
        fi
    done

    # Corre en un contenedor aparte: si falla, el API viejo sigue atendiendo.
    titulo "Aplicar migraciones (prisma migrate deploy)"
    dk compose run --rm --no-deps -T api npx prisma migrate deploy \
        || falla "Las migraciones fallaron. El sistema sigue con la version anterior; respaldo en $respaldo."
    bien "Migraciones al 100%."

    titulo "Reiniciar los servidores con la version nueva"
    dk compose up -d --remove-orphans || falla "No se pudieron levantar los contenedores."

    titulo "Revisar que el sistema responda"
    if ! esperar_url "$URL_API" "API"; then
        echo "Ultimas lineas del API:"
        dk compose logs --tail 60 api
        falla "El API no respondio en $ESPERA_SEGUNDOS segundos ($URL_API)."
    fi
    esperar_url "$URL_WEB" "Web" || falla "La web no llega al API ($URL_WEB)."
    dk compose ps

    titulo "Borrar imagenes viejas"
    dk image prune -f

    printf '\n%sLISTO: Puerto Nuevo quedo actualizado.%s\n' "$VERDE" "$NORMAL"
    borrar_viejos logs '*.log' "$LOGS_A_GUARDAR"
}

# Todo va dentro de main: git pull puede reescribir este archivo mientras corre,
# y bash ya tiene la funcion completa en memoria.
main "$@"; exit
