// El .env de Puerto Nuevo. Los campos salen de .env.example (claves, valores
// por defecto y los comentarios de arriba como ayuda), asi que una variable
// nueva en el repo aparece sola en el formulario.
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const LINEA = /^\s*([A-Za-z0-9_]+)\s*=(.*)$/;
// Se generan solas al instalar si siguen con el valor de ejemplo.
const GENERAR = ["POSTGRES_PASSWORD", "JWT_SECRET"];
// Cambiarla con la base ya creada deja al API sin acceso: el volumen guarda la original.
const FIJA_AL_INSTALAR = "POSTGRES_PASSWORD";

function quitarComillas(valor) {
  const v = valor.trim();
  if (v.length >= 2 && v.startsWith("'") && v.endsWith("'")) return v.slice(1, -1);
  if (v.length >= 2 && v.startsWith('"') && v.endsWith('"')) return v.slice(1, -1).replace(/\\(["\\])/g, "$1").replace(/\$\$/g, "$");
  return v.replace(/\s+#.*$/, "");
}

// Formato que docker compose lee igual que se escribio.
function conComillas(valor) {
  if (!/[\s#$'"\\]/.test(valor)) return valor;
  if (!valor.includes("'")) return `'${valor}'`;
  return `"${valor.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\$/g, "$$$$")}"`;
}

function leerEnv(archivo) {
  const valores = {};
  if (!fs.existsSync(archivo)) return valores;
  for (const linea of fs.readFileSync(archivo, "utf8").split(/\r?\n/)) {
    const m = LINEA.exec(linea);
    if (m) valores[m[1]] = quitarComillas(m[2]);
  }
  return valores;
}

function leerEjemplo(carpeta) {
  const campos = [];
  let comentarios = [];
  for (const linea of fs.readFileSync(path.join(carpeta, ".env.example"), "utf8").split(/\r?\n/)) {
    const m = LINEA.exec(linea);
    if (m) {
      campos.push({ clave: m[1], ejemplo: quitarComillas(m[2]), ayuda: comentarios.join(" ") });
      comentarios = [];
    } else if (linea.trim().startsWith("#")) {
      comentarios.push(linea.replace(/^\s*#\s?/, ""));
    } else {
      comentarios = [];
    }
  }
  return campos;
}

// Campos para el formulario: valor actual del .env, o el de ejemplo (o uno generado).
function leerConfiguracion(carpeta) {
  const archivoEnv = path.join(carpeta, ".env");
  const existe = fs.existsSync(archivoEnv);
  const actuales = leerEnv(archivoEnv);
  return leerEjemplo(carpeta).map(({ clave, ejemplo, ayuda }) => {
    let valor = actuales[clave] ?? ejemplo;
    // Solo en la primera instalacion: con un .env ya en uso, cambiarlas corta sesiones o el acceso a la base.
    if (!existe && GENERAR.includes(clave) && valor === ejemplo) {
      valor = crypto.randomBytes(24).toString("base64url");
    }
    return {
      clave,
      valor,
      ayuda,
      secreto: /PASS|SECRET|KEY/.test(clave),
      soloLectura: existe && clave === FIJA_AL_INSTALAR,
    };
  });
}

// Reescribe .env con el orden y comentarios de .env.example; conserva las
// variables que solo existian en el .env anterior.
function guardarConfiguracion(carpeta, valores) {
  const archivoEnv = path.join(carpeta, ".env");
  const anteriores = leerEnv(archivoEnv);
  if (fs.existsSync(archivoEnv) && FIJA_AL_INSTALAR in anteriores) valores = { ...valores, [FIJA_AL_INSTALAR]: anteriores[FIJA_AL_INSTALAR] };

  const usadas = new Set();
  const lineas = fs
    .readFileSync(path.join(carpeta, ".env.example"), "utf8")
    .split(/\r?\n/)
    .map((linea) => {
      const m = LINEA.exec(linea);
      if (!m) return linea;
      usadas.add(m[1]);
      const valor = valores[m[1]] ?? anteriores[m[1]] ?? quitarComillas(m[2]);
      return `${m[1]}=${conComillas(String(valor).trim())}`;
    });
  const extra = Object.entries(anteriores).filter(([clave]) => !usadas.has(clave));
  if (extra.length) lineas.push("", "# Variables que no estan en .env.example", ...extra.map(([k, v]) => `${k}=${conComillas(v)}`));

  const temporal = `${archivoEnv}.nuevo`;
  fs.writeFileSync(temporal, lineas.join("\n").replace(/\n*$/, "\n"));
  fs.renameSync(temporal, archivoEnv);
}

module.exports = { leerConfiguracion, guardarConfiguracion };
