#!/usr/bin/env bash
# Respalda la base de datos de Puerto Nuevo en respaldos/ (guarda los ultimos 14),
# sin las checadas de los relojes (ver comun.sh). Lo usa el Agente; a mano:
#   bash ./respaldar.sh

TOTAL_PASOS=1
MENSAJE_FALLA="El respaldo no se hizo."
source "$(dirname "$0")/comun.sh"

main() {
    iniciar_log respaldar
    echo "Respaldando Puerto Nuevo en $PWD ($(date '+%d/%m/%Y %H:%M'))"
    asegurar_docker
    titulo "Respaldar la base de datos"
    respaldar_bd
    printf '\n%sLISTO: respaldo guardado.%s\n' "$VERDE" "$NORMAL"
    terminar_log
}

main "$@"; exit
