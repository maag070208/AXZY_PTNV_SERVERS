#!/usr/bin/env bash
# Vigilante del servidor: deja constancia de lo que le pasa a Docker y a los
# contenedores, para que el paquete de soporte traiga EL DATO y no la hipótesis.
#
#   bash ./vigilar.sh          # se queda corriendo; lo mantiene el Agente
#
# Escribe en `logs/docker-eventos-<AAAA-MM-DD>.log`:
#   - cada evento de contenedor (create / start / stop / kill / die / destroy)
#     con su hora, sin muestrear: un `stop` de 5 segundos queda registrado;
#   - un latido cada 10 minutos (así se ve hasta cuándo estuvo vivo);
#   - si el flujo de eventos se corta tras haber estado vivo, la señal de que se
#     fue el engine o de que lo pararon.
#
# Corre en WSL (o donde corra Docker), FUERA de los contenedores, así que
# sobrevive a que se caiga el engine. No usa systemd a propósito: en la PC del
# cliente puede no haberlo, así que lo mantiene vivo el Agente, que arranca con
# la sesión de Windows y lo vuelve a asegurar cada 10 minutos.
set -uo pipefail

cd "$(dirname "$0")" || exit 1
mkdir -p logs

PIDFILE="logs/vigilar.pid"
LATIDO=600    # latido: cada 10 min
REINTENTO=15  # si el flujo se corta, cuánto esperar antes de reintentar

archivo() { printf 'logs/docker-eventos-%s.log\n' "$(date +%Y-%m-%d)"; }
anota() { printf '%s  %s\n' "$(date '+%F %T %z')" "$*" >>"$(archivo)"; }
contenedores() { docker ps -a --format '{{.Names}}={{.Status}}' 2>/dev/null | paste -sd' ' - ; }

# Idempotente: si ya hay uno corriendo (vivo, no un pid viejo), no arranca otro.
if [[ -f $PIDFILE ]] && kill -0 "$(cat "$PIDFILE" 2>/dev/null)" 2>/dev/null; then
    echo "El vigilante ya está corriendo (pid $(cat "$PIDFILE"))."
    exit 0
fi
echo $$ >"$PIDFILE"

# El flujo de eventos va en segundo plano y el latido al frente.
#
# Con el engine caído (o sin `docker`) el flujo falla al instante: por eso el
# "se cortó" solo se anota si llegó a durar unos segundos. Si no, el latido ya
# deja ver que Docker no responde, sin llenar el log de renglones repetidos.
(
    while true; do
        arranque=$(date +%s)
        docker events \
            --filter type=container \
            --filter event=create --filter event=start --filter event=stop \
            --filter event=kill --filter event=die --filter event=destroy \
            --format '{{.Action}}|{{.Actor.Attributes.name}}|{{.Actor.Attributes.exitCode}}' 2>/dev/null |
        while IFS='|' read -r accion nombre codigo; do
            [[ -n ${accion:-} ]] || continue
            anota "contenedor ${accion}: ${nombre:-?}${codigo:+ (exit=$codigo)}"
        done
        duracion=$(( $(date +%s) - arranque ))
        if (( duracion > 5 )); then
            anota "!! el flujo de eventos se cortó tras ${duracion}s: se cayó el engine o lo pararon"
        fi
        sleep "$REINTENTO"
    done
) &
EVENTOS=$!

limpiar() { kill "$EVENTOS" 2>/dev/null; rm -f "$PIDFILE"; }
trap limpiar EXIT INT TERM

anota "---- vigilante arrancado (pid $$) ----"
anota "engine: $(docker info --format '{{.ServerVersion}} ({{.OperatingSystem}})' 2>/dev/null || echo 'no responde')"
anota "contenedores: $(contenedores)"

while true; do
    sleep "$LATIDO"
    if docker info >/dev/null 2>&1; then
        anota "latido: $(contenedores)"
    else
        anota "latido: docker NO responde"
    fi
done
