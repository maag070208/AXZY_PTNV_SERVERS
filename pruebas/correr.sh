#!/usr/bin/env bash
# Corre TODAS las pruebas del servidor y del Agente.
#
#   bash pruebas/correr.sh
#
# No necesita Docker, ni contenedores, ni Windows: los scripts se prueban con un
# `docker` y un `curl` de mentira y el vigilante con el runner de Node. Es lo que
# hay que correr antes de mandarle un instalador nuevo al cliente.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

estado=0

printf '\n### Scripts del servidor (comun.sh / operar.sh) ###\n'
bash pruebas/operar.test.sh || estado=1

printf '\n### Vigilante del Agente (registro de caídas) ###\n'
node --test pruebas/vigilante.test.cjs 2>&1 | tail -40 || estado=1

printf '\n'
if [[ $estado == 0 ]]; then
  printf 'TODO EN VERDE\n'
else
  printf 'HAY FALLAS\n'
fi
exit $estado
