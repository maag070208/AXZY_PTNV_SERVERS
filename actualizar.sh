#!/usr/bin/env bash
# Actualiza Puerto Nuevo (en Windows corre dentro de WSL):
#   1. Revisa que Docker responda (si no, intenta arrancarlo).
#   2. Trae la configuracion nueva de este repositorio (git pull).
#   3. Respalda la base de datos en respaldos/ (como respaldar.sh).
#   4. Baja las imagenes nuevas del API y la web.
#   5. Aplica las migraciones (prisma migrate deploy) y se detiene si fallan:
#      el sistema viejo sigue corriendo.
#   6. Reinicia los servidores con la version nueva y revisa /api/v1/health.
#   7. Borra las imagenes viejas.
# Uso normal: doble clic en Actualizar.cmd. A mano: bash ./actualizar.sh
# El detalle de cada corrida queda en logs/.

TOTAL_PASOS=7
MENSAJE_FALLA="La actualizacion se detuvo en ese paso."
ESPERA_SEGUNDOS=180
URL_API=http://localhost:4001/api/v1/health
URL_WEB=http://localhost:8080/api/v1/health
IMAGENES=(axzydev/axzy_ptnv_api:latest axzydev/axzy_ptnv_web:latest)
source "$(dirname "$0")/comun.sh"

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
    iniciar_log actualizar

    echo "Actualizando Puerto Nuevo en $PWD ($(date '+%d/%m/%Y %H:%M'))"
    for programa in git curl; do
        command -v "$programa" >/dev/null || falla "No encuentro '$programa' (en Windows se busca dentro de WSL)."
    done
    asegurar_docker

    titulo "Traer la configuración nueva (git pull)"
    # Sin nadie frente a la PC, git no debe quedarse esperando usuario o contrasena.
    # En /mnt/c los permisos de archivo no son confiables: se ignoran.
    GIT_TERMINAL_PROMPT=0 git -c safe.directory="$PWD" -c core.fileMode=false pull --ff-only \
        || falla "git pull no pudo traer los cambios."
    avisar_variables_nuevas

    titulo "Respaldar la base de datos"
    respaldar_bd

    titulo "Bajar las imágenes nuevas"
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
        || falla "Las migraciones fallaron. El sistema sigue con la version anterior; respaldo en $RESPALDO."
    bien "Migraciones al 100%."

    titulo "Reiniciar los servidores con la versión nueva"
    dk compose up -d --remove-orphans || falla "No se pudieron levantar los contenedores."

    titulo "Revisar que el sistema responda"
    if ! esperar_url "$URL_API" "API"; then
        echo "Ultimas lineas del API:"
        dk compose logs --tail 60 api
        falla "El API no respondio en $ESPERA_SEGUNDOS segundos ($URL_API)."
    fi
    esperar_url "$URL_WEB" "Web" || falla "La web no llega al API ($URL_WEB)."
    dk compose ps

    titulo "Borrar imágenes viejas"
    dk image prune -f

    printf '\n%sLISTO: Puerto Nuevo quedó actualizado.%s\n' "$VERDE" "$NORMAL"
    terminar_log
}

# Todo va dentro de main: git pull puede reescribir este archivo mientras corre,
# y bash ya tiene la funcion completa en memoria.
main "$@"; exit
