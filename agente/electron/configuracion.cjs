// El .env de Puerto Nuevo. El formulario sale de .env.example (claves, valores
// por defecto y los comentarios de arriba como ayuda) más las variables que
// alguien haya agregado al .env a mano, asi que una variable nueva en el repo
// aparece sola. La vista «Archivo» muestra el .env tal cual, para verlo,
// editarlo y agregar variables nuevas a mano.
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const LINEA = /^\s*([A-Za-z0-9_]+)\s*=(.*)$/;
const CLAVE = /^[A-Za-z_][A-Za-z0-9_]*$/;
// Se generan solas al instalar si siguen con el valor de ejemplo.
const GENERAR = ["POSTGRES_PASSWORD", "JWT_SECRET"];
// Cambiarla con la base ya creada deja al API sin acceso: el volumen guarda la original.
const FIJA_AL_INSTALAR = "POSTGRES_PASSWORD";

const esSecreto = (clave) => /PASS|PWD|SECRET|KEY|TOKEN/.test(clave);

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

// Mientras no exista el .env, los valores generados se guardan en memoria para
// que el formulario y la vista del archivo muestren los mismos.
const generados = new Map();

function valorGenerado(carpeta, clave) {
  const porCarpeta = generados.get(carpeta) ?? {};
  porCarpeta[clave] ??= crypto.randomBytes(24).toString("base64url");
  generados.set(carpeta, porCarpeta);
  return porCarpeta[clave];
}

// Campos para el formulario: valor actual del .env, o el de ejemplo (o uno generado).
function leerConfiguracion(carpeta) {
  const archivoEnv = path.join(carpeta, ".env");
  const existe = fs.existsSync(archivoEnv);
  const actuales = leerEnv(archivoEnv);
  const campos = leerEjemplo(carpeta).map(({ clave, ejemplo, ayuda }) => {
    let valor = actuales[clave] ?? ejemplo;
    // Solo en la primera instalacion: con un .env ya en uso, cambiarlas corta sesiones o el acceso a la base.
    if (!existe && GENERAR.includes(clave) && valor === ejemplo) valor = valorGenerado(carpeta, clave);
    return {
      clave,
      valor,
      ayuda,
      secreto: esSecreto(clave),
      soloLectura: existe && clave === FIJA_AL_INSTALAR,
    };
  });
  // Variables que solo viven en el .env (las agregó alguien a mano): también se editan aquí.
  const delEjemplo = new Set(campos.map((c) => c.clave));
  for (const [clave, valor] of Object.entries(actuales)) {
    if (delEjemplo.has(clave)) continue;
    campos.push({ clave, valor, ayuda: "", secreto: esSecreto(clave), soloLectura: false, adicional: true });
  }
  return campos;
}

// .env nuevo, con el orden y los comentarios de .env.example.
function armarDesdeEjemplo(carpeta, valores) {
  const lineas = fs
    .readFileSync(path.join(carpeta, ".env.example"), "utf8")
    .split(/\r?\n/)
    .map((linea) => {
      const m = LINEA.exec(linea);
      if (!m) return linea;
      const valor = valores[m[1]] ?? quitarComillas(m[2]);
      return `${m[1]}=${conComillas(String(valor).trim())}`;
    });
  return terminar(lineas, valores);
}

// Con un .env ya en uso: cambia solo las claves que llegan y deja el resto del
// archivo (comentarios, orden y variables propias) tal como estaba. Las claves
// que no existian se agregan al final.
function parchear(texto, valores) {
  const puestas = new Set();
  const lineas = texto.split(/\r?\n/).map((linea) => {
    const m = LINEA.exec(linea);
    if (!m || !(m[1] in valores)) return linea;
    puestas.add(m[1]);
    return `${m[1]}=${conComillas(String(valores[m[1]] ?? "").trim())}`;
  });
  const faltantes = Object.fromEntries(Object.entries(valores).filter(([clave]) => !puestas.has(clave)));
  return terminar(lineas, faltantes);
}

function terminar(lineas, valores) {
  const usadas = new Set(lineas.map((linea) => LINEA.exec(linea)?.[1]).filter(Boolean));
  for (const [clave, valor] of Object.entries(valores)) {
    if (!usadas.has(clave)) lineas.push(`${clave}=${conComillas(String(valor ?? "").trim())}`);
  }
  return lineas.join("\n").replace(/\n*$/, "\n");
}

// Se escribe aparte y se renombra: si algo falla, el .env anterior queda intacto.
function escribirEnv(carpeta, texto) {
  const archivoEnv = path.join(carpeta, ".env");
  const temporal = `${archivoEnv}.nuevo`;
  fs.writeFileSync(temporal, texto);
  fs.renameSync(temporal, archivoEnv);
  generados.delete(carpeta); // ya hay archivo: los generados en memoria sobran
}

// Guarda lo del formulario (y las variables nuevas que se agreguen ahi).
function guardarConfiguracion(carpeta, valores) {
  const limpios = {};
  for (const [clave, valor] of Object.entries(valores ?? {})) {
    if (!CLAVE.test(clave)) throw new Error(`«${clave}» no sirve como nombre de variable: usa letras, números y _ , y empieza con letra.`);
    limpios[clave] = valor;
  }

  const archivoEnv = path.join(carpeta, ".env");
  if (!fs.existsSync(archivoEnv)) {
    escribirEnv(carpeta, armarDesdeEjemplo(carpeta, limpios));
    return;
  }
  const anteriores = leerEnv(archivoEnv);
  // Se cambie como se cambie, la base ya creada guarda la contrasena original.
  if (FIJA_AL_INSTALAR in anteriores) limpios[FIJA_AL_INSTALAR] = anteriores[FIJA_AL_INSTALAR];
  escribirEnv(carpeta, parchear(fs.readFileSync(archivoEnv, "utf8"), limpios));
}

// El .env tal cual, para verlo y editarlo como archivo. Sin .env todavia
// (primera instalacion) se muestra lo que se crearia.
function leerArchivoEnv(carpeta) {
  const archivoEnv = path.join(carpeta, ".env");
  if (fs.existsSync(archivoEnv)) return { existe: true, ruta: archivoEnv, texto: fs.readFileSync(archivoEnv, "utf8") };
  const valores = Object.fromEntries(leerConfiguracion(carpeta).map((c) => [c.clave, c.valor]));
  return { existe: false, ruta: archivoEnv, texto: armarDesdeEjemplo(carpeta, valores) };
}

// Guarda el archivo editado a mano. Antes de escribir revisa que cada linea
// tenga la forma CLAVE=valor (o sea un comentario), y deja el anterior en
// .env.bak por si hay que volver atras.
function guardarArchivoEnv(carpeta, texto) {
  const lineas = String(texto ?? "").replace(/\r\n/g, "\n").split("\n");
  const raras = lineas.filter((linea) => linea.trim() && !linea.trim().startsWith("#") && !LINEA.test(linea));
  if (raras.length) throw new Error(`Estas líneas no tienen la forma CLAVE=valor:\n${raras.slice(0, 3).join("\n")}`);

  const archivoEnv = path.join(carpeta, ".env");
  if (fs.existsSync(archivoEnv)) fs.copyFileSync(archivoEnv, `${archivoEnv}.bak`);
  escribirEnv(carpeta, lineas.join("\n").replace(/\n*$/, "\n"));
}

module.exports = { leerConfiguracion, guardarConfiguracion, leerArchivoEnv, guardarArchivoEnv };
