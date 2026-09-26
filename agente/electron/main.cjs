// Proceso principal del Agente Puerto Nuevo: revisa herramientas, clona el
// repositorio, arma el .env y corre actualizar.sh, pasando cada linea de
// salida a la ventana.
const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { PLATAFORMA, bash, revisarHerramientas, resolverHerramienta, abrirDescarga } = require("./sistema.cjs");
const { leerConfiguracion, guardarConfiguracion } = require("./configuracion.cjs");

const REPO = "https://github.com/maag070208/AXZY_PTNV_SERVERS.git";
const NOMBRE_CARPETA = "AXZY_PTNV_SERVERS";
const SCRIPT = "actualizar.sh";
const URL_SALUD = "http://localhost:4001/api/v1/health";

const archivoConfig = () => path.join(app.getPath("userData"), "config.json");

function leerConfig() {
  try {
    return JSON.parse(fs.readFileSync(archivoConfig(), "utf8"));
  } catch {
    return {};
  }
}

function guardarConfig(cambios) {
  const config = { ...leerConfig(), ...cambios };
  fs.mkdirSync(path.dirname(archivoConfig()), { recursive: true });
  fs.writeFileSync(archivoConfig(), JSON.stringify(config, null, 2));
}

const esRepo = (carpeta) => !!carpeta && fs.existsSync(path.join(carpeta, SCRIPT));
// Instalaciones de antes del Agente: el repo esta, pero sin actualizar.sh todavia.
const esRepoViejo = (carpeta) => fs.existsSync(path.join(carpeta, ".git")) && fs.existsSync(path.join(carpeta, "docker-compose.yml"));

// Carpeta guardada; si no hay, la primera de los lugares de costumbre.
function carpetaActual() {
  const { carpeta } = leerConfig();
  if (esRepo(carpeta)) return carpeta;
  const encontrada = [
    path.join(os.homedir(), NOMBRE_CARPETA),
    ...(PLATAFORMA === "win32" ? [`C:\\Users\\${NOMBRE_CARPETA}`] : []),
  ].find(esRepo);
  if (encontrada) guardarConfig({ carpeta: encontrada });
  return encontrada ?? null;
}

function exigirCarpeta() {
  const carpeta = carpetaActual();
  if (!carpeta) throw new Error(`No encuentro la carpeta ${NOMBRE_CARPETA}.`);
  return carpeta;
}

let ventana = null;
let tarea = null;

const enviar = (canal, dato) => ventana?.webContents.send(canal, dato);

// Corre una tarea larga (una a la vez) mandando su salida linea por linea.
function correrTarea(nombre, args, carpeta, alTerminar) {
  if (tarea) throw new Error("Ya hay una tarea corriendo.");
  const proceso = bash(args, carpeta);
  tarea = nombre;

  let resto = "";
  const leer = (trozo) => {
    const lineas = (resto + trozo.toString("utf8")).split(/\r\n|\r|\n/);
    resto = lineas.pop();
    lineas.forEach((linea) => enviar("linea", linea));
  };
  proceso.stdout.on("data", leer);
  proceso.stderr.on("data", leer);

  let terminada = false;
  const terminar = (codigo, errorArranque) => {
    if (terminada) return;
    terminada = true;
    tarea = null;
    if (resto) enviar("linea", resto);
    if (errorArranque) enviar("linea", `ERROR: no se pudo iniciar (${errorArranque.message}).`);
    const resultado = { tarea: nombre, ok: codigo === 0, fecha: new Date().toISOString() };
    alTerminar?.(resultado);
    enviar("fin", resultado);
    revisarSalud();
  };
  proceso.on("error", (error) => terminar(1, error));
  proceso.on("close", (codigo) => terminar(codigo));
}

function actualizar() {
  correrTarea("actualizar", [`./${SCRIPT}`], exigirCarpeta(), ({ ok, fecha }) => guardarConfig({ ultima: { ok, fecha } }));
}

function clonar(padre) {
  const destino = path.join(padre, NOMBRE_CARPETA);
  if (esRepo(destino)) {
    guardarConfig({ carpeta: destino });
    return { carpeta: destino, yaExistia: true };
  }
  if (fs.existsSync(destino) && fs.readdirSync(destino).length) {
    throw new Error(`Ya existe ${destino} y no es el repositorio de Puerto Nuevo. Elige otra ubicación.`);
  }
  correrTarea("clonar", ["-c", `git clone --progress ${REPO} ${NOMBRE_CARPETA}`], padre, ({ ok }) => {
    if (ok && esRepo(destino)) guardarConfig({ carpeta: destino });
  });
  return { carpeta: destino, yaExistia: false };
}

function respaldar() {
  const carpeta = exigirCarpeta();
  // Instalaciones de antes del Agente: respaldar.sh llega con la siguiente actualizacion.
  if (!fs.existsSync(path.join(carpeta, "respaldar.sh"))) throw new Error("Primero actualiza Puerto Nuevo: esta versión todavía no trae respaldar.sh.");
  correrTarea("respaldar", ["./respaldar.sh"], carpeta);
}

// Los respaldos mas recientes primero (respaldar.sh guarda los ultimos 14).
function listarRespaldos() {
  const carpeta = path.join(exigirCarpeta(), "respaldos");
  if (!fs.existsSync(carpeta)) return [];
  return fs
    .readdirSync(carpeta)
    .filter((nombre) => nombre.endsWith(".dump"))
    .map((nombre) => {
      const info = fs.statSync(path.join(carpeta, nombre));
      return { nombre, fecha: info.mtime.toISOString(), bytes: info.size };
    })
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
}

function abrirSubcarpeta(nombre) {
  const carpeta = exigirCarpeta();
  const destino = path.join(carpeta, nombre);
  shell.openPath(fs.existsSync(destino) ? destino : carpeta);
}

// Trae la version del repo que ya incluye los scripts del Agente.
function traerVersionNueva(carpeta) {
  const pull = 'GIT_TERMINAL_PROMPT=0 git -c safe.directory="$PWD" -c core.fileMode=false pull --ff-only';
  correrTarea("clonar", ["-c", `echo '==> [1/1] Traer la versión nueva de Puerto Nuevo'; ${pull}`], carpeta, ({ ok }) => {
    if (ok && esRepo(carpeta)) guardarConfig({ carpeta });
  });
}

// Recrea los contenedores para que tomen el .env nuevo.
function aplicarConfiguracion() {
  correrTarea("aplicar", ["-c", "echo '==> [1/1] Reiniciar con la configuración nueva'; docker compose up -d"], exigirCarpeta());
}

async function revisarSalud() {
  let enLinea = false;
  try {
    enLinea = (await fetch(URL_SALUD, { signal: AbortSignal.timeout(4000) })).ok;
  } catch {}
  enviar("salud", enLinea);
}

async function elegirCarpeta(titulo) {
  const { canceled, filePaths } = await dialog.showOpenDialog(ventana, { title: titulo, properties: ["openDirectory", "createDirectory"] });
  return canceled ? null : filePaths[0];
}

function crearVentana() {
  ventana = new BrowserWindow({
    width: 820,
    height: 760,
    minWidth: 640,
    minHeight: 600,
    title: "Agente Puerto Nuevo",
    icon: path.join(__dirname, "..", "build", "icon.png"),
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, "preload.cjs") },
  });

  // Cerrar a media tarea dejaria el sistema a medio reiniciar.
  ventana.on("close", (evento) => {
    if (!tarea) return;
    evento.preventDefault();
    dialog.showMessageBox(ventana, {
      type: "warning",
      title: "Tarea en curso",
      message: "Espera a que termine antes de cerrar el Agente.",
    });
  });

  if (process.env.VITE_DEV_SERVER_URL) ventana.loadURL(process.env.VITE_DEV_SERVER_URL);
  else ventana.loadFile(path.join(__dirname, "..", "dist", "index.html"));
}

const manejadores = {
  estado: () => {
    const carpeta = carpetaActual();
    return {
      plataforma: PLATAFORMA,
      carpeta,
      instalado: !!carpeta && fs.existsSync(path.join(carpeta, ".env")),
      ultima: leerConfig().ultima ?? null,
      tarea,
      carpetaSugerida: os.homedir(),
    };
  },
  herramientas: () => revisarHerramientas(),
  resolverHerramienta: (id, estado) => resolverHerramienta(id, estado),
  abrirDescarga: (id, estado) => abrirDescarga(id, estado),
  elegirDestino: () => elegirCarpeta(`Dónde instalar ${NOMBRE_CARPETA}`),
  usarExistente: async () => {
    const carpeta = await elegirCarpeta(`Elige la carpeta ${NOMBRE_CARPETA}`);
    if (!carpeta) return { carpeta: carpetaActual() };
    if (esRepo(carpeta)) {
      guardarConfig({ carpeta });
      return { carpeta };
    }
    if (esRepoViejo(carpeta)) {
      traerVersionNueva(carpeta);
      return { carpeta: carpetaActual(), actualizando: true };
    }
    return { carpeta: carpetaActual(), error: `Esa carpeta no es ${NOMBRE_CARPETA} (no tiene ${SCRIPT} ni docker-compose.yml).` };
  },
  clonar: (padre) => clonar(padre),
  leerConfiguracion: () => leerConfiguracion(exigirCarpeta()),
  guardarConfiguracion: (valores) => guardarConfiguracion(exigirCarpeta(), valores),
  aplicarConfiguracion: () => aplicarConfiguracion(),
  actualizar: () => actualizar(),
  respaldar: () => respaldar(),
  listarRespaldos: () => listarRespaldos(),
  abrirLogs: () => abrirSubcarpeta("logs"),
  abrirRespaldos: () => abrirSubcarpeta("respaldos"),
  revisarSalud: () => revisarSalud(),
};

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (ventana?.isMinimized()) ventana.restore();
    ventana?.focus();
  });

  app.whenReady().then(() => {
    for (const [canal, manejador] of Object.entries(manejadores)) {
      ipcMain.handle(canal, (_evento, ...args) => manejador(...args));
    }
    crearVentana();
    setInterval(revisarSalud, 15000);
  });

  app.on("window-all-closed", () => app.quit());
}
