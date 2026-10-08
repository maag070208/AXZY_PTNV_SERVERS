// Lo que el Agente muestra del servidor: servicios, espacio, relojes, acceso
// desde la red y el paquete para soporte. Los datos de Docker los da operar.sh.
const { app } = require("electron");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { zipSync } = require("fflate");
const { PLATAFORMA, correr } = require("./sistema.cjs");

const PUERTO_WEB = 8080;
const OPERAR = "operar.sh";

function exigirOperar(carpeta) {
  // Instalaciones de antes: operar.sh llega con la siguiente actualizacion.
  if (!fs.existsSync(path.join(carpeta, OPERAR))) throw new Error("Primero actualiza Puerto Nuevo: esta versión todavía no trae operar.sh.");
}

// Lineas "PREFIJO dato" de operar.sh.
function porPrefijo(salida, prefijo) {
  return salida
    .split(/\r?\n/)
    .filter((linea) => linea.startsWith(`${prefijo} `))
    .map((linea) => linea.slice(prefijo.length + 1).trim());
}

// compose escribe un JSON por linea o un arreglo, segun su version.
function leerJson(lineas) {
  return lineas.flatMap((linea) => {
    try {
      const dato = JSON.parse(linea);
      return Array.isArray(dato) ? dato : [dato];
    } catch {
      return [];
    }
  });
}

function espacioLibre(carpeta) {
  try {
    const { bsize, blocks, bavail } = fs.statfsSync(carpeta);
    return { total: bsize * blocks, libre: bsize * bavail };
  } catch {
    return null;
  }
}

async function estadoServidor(carpeta) {
  exigirOperar(carpeta);
  const { salida } = await correr([`./${OPERAR}`, "estado"], carpeta);
  const docker = porPrefijo(salida, "DOCKER")[0] ?? "desconocido";
  const servicios = leerJson(porPrefijo(salida, "SERVICIOS")).map((s) => ({
    servicio: s.Service,
    estado: s.State,
    salud: s.Health || "",
    detalle: s.Status,
  }));
  const usoDocker = leerJson(porPrefijo(salida, "DF")).map((d) => ({ tipo: d.Type, tamano: d.Size, recuperable: d.Reclaimable }));
  return { docker, servicios, usoDocker, disco: espacioLibre(carpeta) };
}

function responde(host, puerto, ms = 3000) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port: puerto, timeout: ms });
    const fin = (ok) => {
      socket.destroy();
      resolve(ok);
    };
    socket.once("connect", () => fin(true));
    socket.once("timeout", () => fin(false));
    socket.once("error", () => fin(false));
  });
}

// Prisma guarda las fechas en UTC sin zona: se marcan como UTC para que no se lean como hora local.
const utc = (fecha) => (fecha && !/[zZ]|[+-]\d\d:?\d\d$/.test(fecha) ? `${fecha}Z` : fecha);

async function relojes(carpeta) {
  exigirOperar(carpeta);
  const { codigo, salida } = await correr([`./${OPERAR}`, "relojes"], carpeta);
  const json = porPrefijo(salida, "RELOJES")[0];
  if (codigo !== 0 || !json) throw new Error(salida.match(/ERROR: (.*)/)?.[1] ?? "No se pudieron leer los relojes de la base.");
  const lista = JSON.parse(json);
  return Promise.all(
    lista.map(async (r) => {
      let enRed = null;
      if (r.url) {
        const url = new URL(r.url);
        enRed = await responde(url.hostname, Number(url.port) || (url.protocol === "https:" ? 443 : 80));
      }
      const intentos = (r.intentos ?? []).map((e) => ({
        ok: e.ok,
        disparo: e.trigger,
        fin: utc(e.finishedAt),
        leidas: e.readCount,
        nuevas: e.newCount,
        error: e.error,
      }));
      return { ...r, sincronizado: utc(r.sincronizado), ultima: utc(r.ultima), enRed, intentos };
    }),
  );
}

// Adaptadores virtuales (WSL, Docker, VPN de Hyper-V) que no sirven para otras PCs.
const VIRTUAL = /vEthernet|WSL|docker|br-|veth|vmnet|VirtualBox|utun|bridge|Loopback/i;

// Direcciones con las que otras PCs de la red abririan la web, y si de verdad responden ahi.
async function direcciones() {
  const lista = Object.entries(os.networkInterfaces()).flatMap(([interfaz, datos]) =>
    (datos ?? [])
      .filter((d) => d.family === "IPv4" && !d.internal && !d.address.startsWith("169.254.") && !VIRTUAL.test(interfaz))
      .map((d) => ({ interfaz, ip: d.address, url: `http://${d.address}:${PUERTO_WEB}` })),
  );
  return Promise.all(
    lista.map(async (d) => {
      let accesible = false;
      try {
        accesible = (await fetch(`${d.url}/api/v1/health`, { signal: AbortSignal.timeout(3000) })).ok;
      } catch {}
      return { ...d, accesible };
    }),
  );
}

// Junta en un .zip lo que soporte necesita (operar.sh diagnostico + datos del Agente).
async function paqueteSoporte(carpeta, extra) {
  exigirOperar(carpeta);
  const sello = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19);
  const relativa = `soporte/diagnostico-${sello}`;
  const temporal = path.join(carpeta, relativa);
  await correr([`./${OPERAR}`, "diagnostico", relativa], carpeta);

  const archivos = {};
  const raiz = `Puerto-Nuevo-soporte-${sello}`;
  if (fs.existsSync(temporal)) {
    for (const nombre of fs.readdirSync(temporal)) archivos[`${raiz}/${nombre}`] = fs.readFileSync(path.join(temporal, nombre));
    fs.rmSync(temporal, { recursive: true, force: true });
  }
  const logs = path.join(carpeta, "logs");
  if (fs.existsSync(logs)) {
    const recientes = fs
      .readdirSync(logs)
      .filter((n) => n.endsWith(".log"))
      .map((n) => ({ n, t: fs.statSync(path.join(logs, n)).mtimeMs }))
      .sort((a, b) => b.t - a.t)
      .slice(0, 10);
    for (const { n } of recientes) archivos[`${raiz}/logs/${n}`] = fs.readFileSync(path.join(logs, n));
  }
  const agente = {
    agente: app.getVersion(),
    plataforma: PLATAFORMA,
    sistema: `${os.type()} ${os.release()} (${os.arch()})`,
    carpeta,
    disco: espacioLibre(carpeta),
    ...extra,
  };
  archivos[`${raiz}/agente.json`] = Buffer.from(JSON.stringify(agente, null, 2));

  const destino = path.join(carpeta, "soporte", `${raiz}.zip`);
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, zipSync(archivos, { level: 6 }));
  return destino;
}

module.exports = { OPERAR, exigirOperar, estadoServidor, relojes, direcciones, paqueteSoporte };
