#!/usr/bin/env bash
# Pruebas de los scripts que corren en la máquina del cliente (`comun.sh` y
# `operar.sh`), con `docker` y `curl` de mentira: sin Docker ni contenedores.
#
#   bash pruebas/operar.test.sh
#
# Vigila justo la lógica que ya falló una vez en el cliente (08/10/2026):
#   - las sondas tienen que exigir la BASE, no solo que el proceso del API viva;
#   - «Reiniciar» no debe reiniciar un API sano;
#   - y no debe cantar LISTO si la base no volvió.
# Y que el soporte salga completo: el vigilante corriendo y su registro, más lo
# del engine (código de salida, OOM, desde cuándo) dentro del diagnóstico.
set -uo pipefail

AQUI=$(cd "$(dirname "$0")" && pwd)
RAIZ=$(dirname "$AQUI")
DOBLES="$AQUI/dobles"
PATH_BASE=$PATH

ok=0
fallas=0
titulo() { printf '\n%s\n' "$1"; }
bien() { ok=$((ok + 1)); printf '  ok    %s\n' "$1"; }
mal() { fallas=$((fallas + 1)); printf '  FALLA %s\n' "$1"; }
afirmar() { # descripcion, condicion ya evaluada (0 = pasa)
  if [[ $2 == 0 ]]; then bien "$1"; else mal "$1"; fi
}

# Cada caso trabaja sobre una copia de los scripts en un directorio temporal:
# así no se ensucian logs/ ni respaldos/ del repositorio.
T=""
DOBLE_LOG=""
VIGILANTE_PID=""
taller() {
  limpiar
  T=$(mktemp -d)
  cp "$RAIZ/comun.sh" "$RAIZ/operar.sh" "$RAIZ/vigilar.sh" "$T/"
  # Un sondeo fallido espera 180 s por diseño; en la prueba, 1 s.
  sed 's/^ESPERA_SEGUNDOS=180/ESPERA_SEGUNDOS=1/' "$T/comun.sh" >"$T/comun.tmp" && mv "$T/comun.tmp" "$T/comun.sh"
  DOBLE_LOG="$T/llamadas.log"
  : >"$DOBLE_LOG"
  export DOBLE_LOG
  export PATH="$DOBLES:$PATH_BASE"
  # Escenario base: todo sano. `FAKE_*` es la sonda de vida (/health) y
  # `FAKE_*_READY` la de disponibilidad (/health/ready, la que mira la base).
  export FAKE_API=200 FAKE_API_READY=200 FAKE_WEB=200 FAKE_WEB_READY=200
  unset FAKE_UP_EXIT FAKE_RESTART_EXIT FAKE_DOCKER FAKE_PS FAKE_DF
}
limpiar() {
  # El vigilante que arrancó una prueba tiene que morir con ella.
  [[ -n $VIGILANTE_PID ]] && kill "$VIGILANTE_PID" 2>/dev/null
  VIGILANTE_PID=""
  [[ -n $T && -d $T ]] && rm -rf "$T"
  T=""
}
trap limpiar EXIT

salida=""
codigo=0
correr() { # args... -> deja $salida y $codigo
  salida=$(cd "$T" && bash operar.sh "$@" 2>&1)
  codigo=$?
}
contiene() { [[ $salida == *"$1"* ]]; }
llamo() { grep -qF "docker $1" "$DOBLE_LOG"; }

# ---------------------------------------------------------------------------
titulo "1. Las sondas exigen la base de datos, no solo que el API viva"
# El defecto original: /health no toca la base, así que devolvía 200 con la base
# caída y todo el mundo (agente y reinicio) daba el sistema por bueno.
for archivo in comun.sh agente/electron/main.cjs; do
  if grep -q "api/v1/health/ready" "$RAIZ/$archivo"; then
    bien "$archivo sondea /health/ready"
  else
    mal "$archivo NO sondea /health/ready (¿volvió a /health?)"
  fi
done
if grep -nE 'api/v1/health([^/]|$)' "$RAIZ/comun.sh" >/dev/null 2>&1; then
  mal "comun.sh todavía tiene una URL a /health a secas"
else
  bien "comun.sh no tiene ninguna URL a /health a secas"
fi

# ---------------------------------------------------------------------------
titulo "2. «¿ya responde?»: es lo que decide si se reinicia el API"
# El caso exacto del cliente: el API vivo (200 en /health) con la base caída
# (503 en /health/ready). Antes eso contaba como «responde» y no se reiniciaba
# nada, así que el sistema se quedaba caído sin que nadie se enterara.
responde_con() { # api_vida api_listo web_vida web_listo
  ( export PATH="$DOBLES:$PATH_BASE" \
        FAKE_API=${1:-200} FAKE_API_READY=${2:-${1:-200}} \
        FAKE_WEB=${3:-200} FAKE_WEB_READY=${4:-${3:-200}}
    # shellcheck disable=SC1090
    source "$RAIZ/comun.sh"
    responde_ya ) >/dev/null 2>&1
}
si() { if responde_con "$@"; then echo 0; else echo 1; fi; }
no() { if responde_con "$@"; then echo 1; else echo 0; fi; }
afirmar "API vivo y base OK -> ya responde" "$(si 200 200 200 200)"
afirmar "API vivo pero base CAÍDA (200 en /health, 503 en /health/ready) -> NO responde" "$(no 200 503 200 200)"
afirmar "API caído (503 en las dos sondas) -> NO responde" "$(no 503 503 200 200)"
afirmar "web 502 (nginx sin llegar al API) -> NO responde" "$(no 200 200 502 502)"

# ---------------------------------------------------------------------------
titulo "3. Con la base caída, el sistema no se da por listo"
# Se usa la copia parcheada de `taller` (ESPERA_SEGUNDOS=1): con la de verdad,
# este caso tardaría los 180 s completos de la espera. Mismo escenario: el API
# contestando /health con 200 y la base caída.
taller
salida=$(export PATH="$DOBLES:$PATH_BASE" \
    FAKE_API=200 FAKE_API_READY=503 FAKE_WEB=200 FAKE_WEB_READY=200
  bash -c "source \"$T/comun.sh\"; esperar_sistema" 2>&1)
codigo=$?
afirmar "esperar_sistema falla (no canta OK)" "$([[ $codigo != 0 ]] && echo 0 || echo 1)"
afirmar "y dice qué no respondió" "$(contiene "no respondieron" && echo 0 || echo 1)"
afirmar "y muestra el log del API para soporte" "$(contiene "ultimas lineas del API" && echo 0 || echo 1)"

# ---------------------------------------------------------------------------
titulo "4. «Reiniciar todo»"
taller
correr reiniciar todo
afirmar "con todo sano termina bien" "$([[ $codigo == 0 ]] && echo 0 || echo 1)"
afirmar "levanta lo que esté abajo (up -d --wait)" "$(llamo "compose up -d --wait" && echo 0 || echo 1)"
afirmar "y NO reinicia un API sano" "$(llamo "compose restart" && echo 1 || echo 0)"
afirmar "lo dice en la salida" "$(contiene "El sistema ya responde" && echo 0 || echo 1)"
afirmar "cierra con LISTO" "$(contiene "LISTO: reiniciado" && echo 0 || echo 1)"
afirmar "deja su log en logs/ (lo lee el Agente)" "$(ls "$T"/logs/reiniciar-*.log >/dev/null 2>&1 && echo 0 || echo 1)"

taller
export FAKE_API_READY=503 # el API vive, la base no (el caso del cliente)
correr reiniciar todo
afirmar "con la base caída sí reinicia api y web" "$(llamo "compose restart api web" && echo 0 || echo 1)"
afirmar "y NO canta LISTO si la base no volvió" "$(contiene "LISTO" && echo 1 || echo 0)"
afirmar "termina con error" "$([[ $codigo != 0 ]] && echo 0 || echo 1)"
afirmar "dice que fue el API o la base" "$(contiene "El API o la base de datos no respondieron" && echo 0 || echo 1)"

taller
export FAKE_API_READY=503 FAKE_UP_EXIT=1 FAKE_RESTART_EXIT=0
correr reiniciar todo
afirmar "si la base no arranca, falla" "$([[ $codigo != 0 ]] && echo 0 || echo 1)"
afirmar "y manda a revisar la base" "$(contiene "revisa la base de datos" && echo 0 || echo 1)"
afirmar "y no reinicia nada más" "$(llamo "compose restart" && echo 1 || echo 0)"

# ---------------------------------------------------------------------------
titulo "5. «estado»: el contrato que lee el Agente"
taller
export FAKE_PS='{"Service":"postgres","State":"running","Health":"healthy","Status":"Up 2 minutes"}
{"Service":"api","State":"running","Health":"","Status":"Up 1 minute"}
{"Service":"web","State":"running","Health":"","Status":"Up 1 minute"}'
correr estado
afirmar "termina bien" "$([[ $codigo == 0 ]] && echo 0 || echo 1)"
afirmar "dice DOCKER ok" "$([[ $(grep -c '^DOCKER ok$' <<<"$salida") == 1 ]] && echo 0 || echo 1)"
afirmar "una línea SERVICIOS por contenedor" "$([[ $(grep -c '^SERVICIOS ' <<<"$salida") == 3 ]] && echo 0 || echo 1)"
afirmar "una línea DF" "$([[ $(grep -c '^DF ' <<<"$salida") == 1 ]] && echo 0 || echo 1)"
afirmar "cada SERVICIOS es JSON válido (lo que parsea el Agente)" "$(
  grep '^SERVICIOS ' <<<"$salida" | sed 's/^SERVICIOS //' | node -e '
    const r = require("node:readline").createInterface({ input: process.stdin });
    let n = 0;
    r.on("line", (l) => { JSON.parse(l); n++; });
    r.on("close", () => process.exit(n === 3 ? 0 : 1));
  ' >/dev/null 2>&1 && echo 0 || echo 1
)"

taller
export FAKE_DOCKER=apagado
correr estado
afirmar "con Docker apagado dice exactamente «DOCKER apagado»" "$([[ $salida == "DOCKER apagado" ]] && echo 0 || echo 1)"
afirmar "y no inventa servicios" "$(grep -q '^SERVICIOS ' <<<"$salida" && echo 1 || echo 0)"

# ---------------------------------------------------------------------------
titulo "6. El vigilante: sin muestreo, y siempre corriendo"
# El sondeo de la salud corre cada 15 s: una caída de 5 segundos se le escapa. El
# vigilante escucha el flujo de eventos de Docker, así que no se le escapa nada.
# Y como en la PC del cliente puede no haber systemd, lo mantiene vivo el Agente:
# por eso tiene que ser idempotente.
taller
mkdir -p "$T/logs"
echo $$ >"$T/logs/vigilar.pid" # un pid vivo: el vigilante ya corre
correr vigilar
afirmar "si ya está corriendo, no arranca otro" "$(contiene "ya está corriendo" && echo 0 || echo 1)"

taller
mkdir -p "$T/logs"
: >"$T/logs/vigilar.pid" # pidfile viejo (vacío): hay que arrancarlo
correr vigilar
afirmar "arranca el vigilante si no está" "$(contiene "Vigilante arrancado" && echo 0 || echo 1)"
VIGILANTE_PID=$(cat "$T/logs/vigilar.pid" 2>/dev/null)
sleep 2
VIGILANTE_LOG=$(ls "$T"/logs/docker-eventos-*.log 2>/dev/null | head -1)
afirmar "deja su registro en logs/" "$([[ -n $VIGILANTE_LOG && -f $VIGILANTE_LOG ]] && echo 0 || echo 1)"
afirmar "anota el arranque con el estado del engine" "$(grep -q "vigilante arrancado" "$VIGILANTE_LOG" 2>/dev/null && echo 0 || echo 1)"
afirmar "anota cada evento de contenedor" "$(grep -q "contenedor stop: ptnv-postgres" "$VIGILANTE_LOG" 2>/dev/null && echo 0 || echo 1)"
afirmar "con su código de salida (stop limpio vs kill)" "$(grep -q "contenedor die: ptnv-postgres (exit=0)" "$VIGILANTE_LOG" 2>/dev/null && echo 0 || echo 1)"
afirmar "y los start también" "$(grep -q "contenedor start: ptnv-postgres" "$VIGILANTE_LOG" 2>/dev/null && echo 0 || echo 1)"

# ---------------------------------------------------------------------------
titulo "7. El paquete de soporte trae la data del engine"
# `paqueteSoporte` (el Agente) junta TODO lo que deja `diagnostico`, así que aquí
# se comprueba que traiga los archivos y las líneas que hacen falta para decidir
# si fue el engine, un contenedor o la PC.
taller
mkdir -p "$T/logs"
printf '2026-10-08 18:21:18 +0000  contenedor stop: ptnv-postgres (exit=0)\n' >"$T/logs/docker-eventos-2026-10-08.log"
export FAKE_PS='{"Service":"postgres","State":"running","Health":"healthy","Status":"Up 2 minutes"}'
correr diagnostico "$T/soporte"
afirmar "termina bien" "$([[ $codigo == 0 ]] && echo 0 || echo 1)"
SOPORTE="$T/soporte"
for archivo in sistema.txt env-claves.txt docker.txt docker-engine.txt docker-engine.log \
  log-api.txt log-web.txt log-postgres.txt docker-eventos-2026-10-08.log; do
  afirmar "incluye $archivo" "$([[ -f "$SOPORTE/$archivo" ]] && echo 0 || echo 1)"
done
afirmar "una línea por contenedor" "$([[ $(grep -c 'reinicios=' "$SOPORTE/docker-engine.txt") == 3 ]] && echo 0 || echo 1)"
afirmar "y con desde cuándo está arriba el engine" "$(grep -q 'desde cuándo' "$SOPORTE/docker-engine.txt" && echo 0 || echo 1)"
afirmar "el log del engine no va vacío" "$([[ -s "$SOPORTE/docker-engine.log" ]] && echo 0 || echo 1)"
afirmar "y el registro del vigilante viene completo" "$(grep -q 'contenedor stop' "$SOPORTE/docker-eventos-2026-10-08.log" && echo 0 || echo 1)"

# Los campos que DECIDEN el diagnóstico se comprueban en el script, no en el
# archivo: el `docker` de mentira no interpreta `--format`, imprime siempre lo
# mismo, así que mirar el archivo daría una cobertura falsa.
afirmar "el inspect pide el código de salida (stop limpio vs kill)" "$(
  grep -q 'salida={{.State.ExitCode}}' "$RAIZ/operar.sh" && echo 0 || echo 1
)"
afirmar "el inspect pide si fue la memoria (OOM)" "$(
  grep -q 'oom={{.State.OOMKilled}}' "$RAIZ/operar.sh" && echo 0 || echo 1
)"
afirmar "el inspect pide cuándo arrancó y terminó cada contenedor" "$(
  grep -q 'arrancado={{.State.StartedAt}}.*terminado={{.State.FinishedAt}}' "$RAIZ/operar.sh" && echo 0 || echo 1
)"
afirmar "y cuántas veces se reinició" "$(
  grep -q 'reinicios={{.RestartCount}}' "$RAIZ/operar.sh" && echo 0 || echo 1
)"

# ---------------------------------------------------------------------------
printf '\n%s\n' "────────────────────────────────────────"
printf '%d ok, %d falla(s)\n' "$ok" "$fallas"
[[ $fallas == 0 ]] || exit 1
