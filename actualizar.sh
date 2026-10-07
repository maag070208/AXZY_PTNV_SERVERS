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

# Este repositorio es del SISTEMA, no del cliente: manda lo que trae git. Si el
# servidor quedó con archivos modificados a mano, el pull se detendría (pasó en
# el cliente el 07/10/2026), así que se REVIERTEN antes de traer lo nuevo.
# No toca .env, logs/, respaldos/ ni soporte/: están en .gitignore, git no los ve.
revertir_cambios_locales() {
    local git_cmd=(git -c safe.directory="$PWD" -c core.fileMode=false)
    local pendientes
    pendientes=$("${git_cmd[@]}" status --porcelain | wc -l | tr -d ' ')
    if [[ "$pendientes" == "0" ]]; then
        echo "  sin cambios locales."
        return
    fi
    aviso "$pendientes archivo(s) con cambios locales: se revierten antes de actualizar."
    mkdir -p logs
    # Respaldo de lo que había (por si alguien editó algo a propósito).
    "${git_cmd[@]}" diff > "logs/cambios-locales-$(date '+%Y%m%d-%H%M%S').patch" 2>/dev/null || true
    "${git_cmd[@]}" checkout -- .
    bien "  cambios locales revertidos (respaldo en logs/)."
}

# Un archivo SIN rastrear que choque con lo que viene también detiene el pull
# ("untracked working tree files would be overwritten"). Se aparta con stash
# (recuperable con `git stash pop`) en vez de borrarse.
apartar_sin_rastrear() {
    aviso "quedan archivos sin rastrear que estorban: se apartan con git stash."
    git -c safe.directory="$PWD" -c core.fileMode=false stash push -u \
        -m "actualizar $(date '+%Y-%m-%d %H:%M')" >/dev/null 2>&1 || true
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
    revertir_cambios_locales
    if ! GIT_TERMINAL_PROMPT=0 git -c safe.directory="$PWD" -c core.fileMode=false pull --ff-only; then
        apartar_sin_rastrear
        GIT_TERMINAL_PROMPT=0 git -c safe.directory="$PWD" -c core.fileMode=false pull --ff-only \
            || falla "git pull no pudo traer los cambios."
    fi
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
    esperar_sistema
    dk compose ps

    titulo "Borrar imágenes viejas"
    dk image prune -f

    printf '\n%sLISTO: Puerto Nuevo quedó actualizado.%s\n' "$VERDE" "$NORMAL"
    terminar_log
}

# Todo va dentro de main: git pull puede reescribir este archivo mientras corre,
# y bash ya tiene la funcion completa en memoria.
main "$@"; exit
