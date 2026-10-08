// Registro de caídas y recuperaciones del servidor en `logs/agente-<fecha>.log`.
//
// Va aparte del aviso al usuario: deja constancia de CUÁNDO dejó de responder el
// sistema y CÓMO estaba Docker en ese momento (¿se cayó el engine, o alguien paró
// el contenedor?). El log de Postgres solo dice "me pararon": en el cliente
// (08/10/2026) hubo cuatro paradas en 33 minutos y ninguna quedó registrada en
// ningún lado.
//
// Sin dependencias de Electron a propósito: así esto se prueba solo (pruebas/).
const fs = require("node:fs");
const path = require("node:path");

const dos = (n) => String(n).padStart(2, "0");

/** Sello local `AAAA-MM-DD HH:mm:ss` (el mismo formato que los logs del shell). */
function sello(fecha = new Date()) {
  return (
    `${fecha.getFullYear()}-${dos(fecha.getMonth() + 1)}-${dos(fecha.getDate())} ` +
    `${dos(fecha.getHours())}:${dos(fecha.getMinutes())}:${dos(fecha.getSeconds())}`
  );
}

/** Ruta del log del día: `<carpeta>/logs/agente-AAAA-MM-DD.log`. */
function archivoDelDia(carpeta, fecha = new Date()) {
  return path.join(carpeta, "logs", `agente-${sello(fecha).slice(0, 10)}.log`);
}

/**
 * Agrega una línea al log del día (crea `logs/` si hace falta). Nunca lanza: un
 * log que falla no puede tumbar al Agente. Devuelve si alcanzó a escribirse.
 */
function anotar(carpeta, texto, fecha = new Date()) {
  try {
    const destino = archivoDelDia(carpeta, fecha);
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.appendFileSync(destino, texto);
    return true;
  } catch {
    return false;
  }
}

/** Línea de la transición: el sistema dejó de responder o volvió. */
function lineaTransicion(enLinea, fecha = new Date()) {
  const estado = enLinea ? "EN LINEA (API y base responden)" : "SIN RESPUESTA (API o base)";
  return `${sello(fecha)}  ${estado}\n`;
}

/**
 * Línea con la foto de Docker que acompaña a la transición. Es la que distingue
 * "se cayó el engine" (`docker=apagado`) de "alguien paró el contenedor"
 * (`docker=ok` con el servicio caído).
 */
function lineaDocker(docker, servicios, fecha = new Date()) {
  const lista = (servicios ?? [])
    .map((s) => `${s.servicio}=${s.estado}${s.salud ? `/${s.salud}` : ""}`)
    .join(" ");
  return `${sello(fecha)}  ${lista ? `docker=${docker}  ${lista}` : `docker=${docker}`}\n`;
}

/**
 * Sigue el estado del sistema y dice cuándo CAMBIA. La primera revisión no es
 * una transición: todavía no hay nada con qué comparar.
 */
function crearSeguimiento() {
  let ultima = null;
  return {
    /** `true` solo si cambió respecto de la revisión anterior. */
    cambio(enLinea) {
      if (enLinea === ultima) return false;
      const primera = ultima === null;
      ultima = enLinea;
      return !primera;
    },
  };
}

module.exports = { sello, archivoDelDia, anotar, lineaTransicion, lineaDocker, crearSeguimiento };
