// Proceso principal del Agente Puerto Nuevo: revisa herramientas, clona el
// repositorio, arma el .env, corre los scripts del repo pasando cada linea de
// salida a la ventana, y vigila desde la bandeja que el sistema responda.
const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { PLATAFORMA, bash, correr, revisarHerramientas, resolverHerramienta, abrirDescarga } = require("./sistema.cjs");
const { leerConfiguracion, guardarConfiguracion, leerArchivoEnv, guardarArchivoEnv } = require("./configuracion.cjs");
const { OPERAR, exigirOperar, estadoServidor, relojes, direcciones, paqueteSoporte } = require("./servidor.cjs");
const { crearBandeja, notificar, cambiarInicioAutomatico, arrancoConLaSesion } = require("./bandeja.cjs");

const REPO = "https://github.com/maag070208/AXZY_PTNV_SERVERS.git";
const NOMBRE_CARPETA = "AXZY_PTNV_SERVERS";
const SCRIPT = "actualizar.sh";
// /health solo dice que el proceso vive: NO toca la base de datos. Con la base
// caída devuelve 200 igual, así que el Agente mostraba "en línea", no avisaba y
// no intentaba levantar nada mientras el cliente veía 502 en todas las pantallas
// (cliente, 08/10/2026). /health/ready hace un SELECT 1 y responde 503 si la base
// no está; existe desde el 26/09/2026, así que toda imagen del API lo trae.
const URL_SALUD = "http://localhost:4001/api/v1/health/ready";
const URL_WEB = "http://localhost:8080";
const APP_ID = "dev.axzy.puertonuevo.agente"; // el mismo appId de electron-builder: Windows lo pide para los avisos
const SERVICIOS = ["api", "web", "postgres"];
// Revisiones seguidas sin respuesta (cada 15 s) antes de avisar: evita avisos por un parpadeo.
const FALLAS_PARA_AVISAR = 2;

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
let bandeja = null;
let tarea = null;
let saliendo = false;

const enviar = (canal, dato) => {
  if (ventana && !ventana.isDestroyed()) ventana.webContents.send(canal, dato);
};

// Corre una tarea larga (una a la vez) mandando su salida linea por linea.
function correrTarea(nombre, args, carpeta, alTerminar) {
  if (tarea) throw new Error("Ya hay una tarea corriendo.");
  const proceso = bash(args, carpeta);
  tarea = nombre;
  enviar("inicio", nombre); // tambien las que arrancan desde la bandeja o al iniciar sesion

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
    fallasSeguidas = 0; // la tarea pudo reiniciar servidores: se vuelve a contar desde cero
    revisarSalud();
  };
  proceso.on("error", (error) => terminar(1, error));
  proceso.on("close", (codigo) => terminar(codigo));
}

// El repositorio de los scripts es del SISTEMA, no del cliente. Si el servidor
// quedo con archivos modificados a mano (o con finales de linea de Windows),
// `git pull` se niega a traer lo nuevo y la actualizacion se detiene en el paso 1
// (le paso al cliente el 07/10/2026). El instalador del Agente SI se puede
// reemplazar sin depender de ese pull, asi que la reparacion vive aqui: se
// revierten esos archivos, se aparta lo que estorbe y se trae lo nuevo ANTES de
// correr el script (que hara lo mismo, ya sin nada que hacer). No toca .env,
// logs/, respaldos/ ni soporte/: estan en .gitignore, git no los ve.
const GIT = 'git -c safe.directory="$PWD" -c core.fileMode=false';

function correrEnRepo(carpeta, comando) {
  return correr(["-c", `export GIT_TERMINAL_PROMPT=0; ${comando}`], carpeta);
}

async function prepararRepo(carpeta) {
  try {
    const estado = await correrEnRepo(carpeta, `${GIT} status --porcelain | wc -l`);
    const pendientes = Number.parseInt((estado.salida || "").trim(), 10) || 0;
    if (pendientes > 0) {
      enviar("linea", `AVISO: ${pendientes} archivo(s) del repositorio con cambios locales; se revierten para poder actualizar.`);
      await correrEnRepo(carpeta, `mkdir -p logs && ${GIT} diff > "logs/cambios-locales-$(date +%Y%m%d-%H%M%S).patch"`);
      await correrEnRepo(carpeta, `${GIT} checkout -- .`);
    }

    let pull = await correrEnRepo(carpeta, `${GIT} pull --ff-only`);
    if (pull.codigo !== 0 && /untracked working tree files would be overwritten/i.test(pull.salida)) {
      enviar("linea", "AVISO: hay archivos sin rastrear que estorban al actualizar; se apartan con git stash.");
      await correrEnRepo(carpeta, `${GIT} stash push -u -m "agente: antes de actualizar"`);
      pull = await correrEnRepo(carpeta, `${GIT} pull --ff-only`);
    }
    if (pull.codigo !== 0) {
      // No se corta aqui: el script lo reporta con su propio paso y su detalle.
      enviar("linea", "AVISO: no se pudo traer la configuración nueva (git pull); sigue el script.");
    }
  } catch (error) {
    enviar("linea", `AVISO: no se pudo revisar el repositorio (${error.message}).`);
  }
}

async function actualizar() {
  const carpeta = exigirCarpeta();
  await prepararRepo(carpeta);
  correrTarea("actualizar", [`./${SCRIPT}`], carpeta, ({ ok, fecha }) => guardarConfig({ ultima: { ok, fecha } }));
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

function reiniciar(servicio) {
  if (![...SERVICIOS, "todo"].includes(servicio)) throw new Error(`Servicio desconocido: ${servicio}`);
  const carpeta = exigirCarpeta();
  exigirOperar(carpeta);
  correrTarea("reiniciar", [`./${OPERAR}`, "reiniciar", servicio], carpeta);
}

function limpiar() {
  const carpeta = exigirCarpeta();
  exigirOperar(carpeta);
  correrTarea("limpiar", [`./${OPERAR}`, "limpiar"], carpeta);
}

// Log en vivo de un servicio; va aparte de las tareas (no bloquea actualizar).
let procesoLogs = null;
function verLogs(servicio) {
  if (!SERVICIOS.includes(servicio)) throw new Error(`Servicio desconocido: ${servicio}`);
  detenerLogs();
  const carpeta = exigirCarpeta();
  exigirOperar(carpeta);
  const proceso = bash([`./${OPERAR}`, "logs", servicio], carpeta);
  procesoLogs = proceso;
  // Se mandan en tandas: al abrir llegan cientos de lineas de golpe.
  let resto = "";
  let pendientes = [];
  const vaciar = () => {
    if (pendientes.length && procesoLogs === proceso) enviar("logs", pendientes);
    pendientes = [];
  };
  const intervalo = setInterval(vaciar, 250);
  const leer = (trozo) => {
    const lineas = (resto + trozo.toString("utf8")).split(/\r\n|\r|\n/);
    resto = lineas.pop();
    pendientes.push(...lineas);
  };
  proceso.stdout.on("data", leer);
  proceso.stderr.on("data", leer);
  proceso.on("close", () => {
    vaciar();
    clearInterval(intervalo);
    if (procesoLogs === proceso) procesoLogs = null;
  });
  proceso.on("error", () => {});
}

function detenerLogs() {
  procesoLogs?.kill();
  procesoLogs = null;
}

const instalado = () => {
  const carpeta = carpetaActual();
  return !!carpeta && fs.existsSync(path.join(carpeta, ".env"));
};

function mostrarVentana() {
  if (!ventana || ventana.isDestroyed()) return crearVentana(true);
  if (ventana.isMinimized()) ventana.restore();
  ventana.show();
  ventana.focus();
}

// Si el sistema deja de responder se avisa una vez; al volver, otro aviso. Si el
// Agente arranco con la sesion (la PC se acaba de prender), primero intenta levantarlo.
let fallasSeguidas = 0;
let avisado = false;
let intentoArrancar = false;
const conSesion = { valor: false };

// Registro de caídas y recuperaciones: el formato y la decisión de "¿cambió?"
// viven en vigilante.cjs, que no depende de Electron y por eso se prueba solo.
const { anotar, lineaDocker, lineaTransicion, crearSeguimiento } = require("./vigilante.cjs");

const seguimientoSalud = crearSeguimiento();
/** Una sola foto de Docker en vuelo: `correr` no tiene timeout y un docker
 *  trabado dejaría procesos acumulándose. Si no cabe, la transición ya quedó
 *  anotada y no se pierde el dato que importa. */
let fotoEnCurso = false;
async function anotarSalud(enLinea) {
  if (!seguimientoSalud.cambio(enLinea)) return;
  const carpeta = carpetaActual();
  if (!carpeta) return;

  // La transición se anota PRIMERO y sin depender de Docker.
  anotar(carpeta, lineaTransicion(enLinea));

  if (fotoEnCurso) return;
  fotoEnCurso = true;
  try {
    const { docker, servicios } = await estadoServidor(carpeta);
    anotar(carpeta, lineaDocker(docker, servicios));
  } catch {
  } finally {
    fotoEnCurso = false;
  }
}

// El vigilante (los eventos de Docker) tiene que estar corriendo SIEMPRE, no solo
// mientras alguien mira la pantalla: es lo que deja el rastro de quién para los
// contenedores, y una caída de 5 segundos se le escapa al sondeo de la salud. Se
// asegura al arrancar y cada 10 minutos, porque WSL puede reiniciarse y llevárselo.
const VIGILANTE_MS = 10 * 60 * 1000;
let ultimoVigilante = 0;
async function asegurarVigilante() {
  if (Date.now() - ultimoVigilante < VIGILANTE_MS) return;
  ultimoVigilante = Date.now();
  const carpeta = carpetaActual();
  if (!carpeta) return;
  try {
    await correr([`./${OPERAR}`, "vigilar"], carpeta);
  } catch {
  }
}

async function revisarSalud() {
  // El vigilante de eventos se asegura aquí: es el latido que ya corre solo.
  void asegurarVigilante();
  let enLinea = false;
  try {
    enLinea = (await fetch(URL_SALUD, { signal: AbortSignal.timeout(4000) })).ok;
  } catch {}
  enviar("salud", enLinea);
  bandeja?.ponerSalud(enLinea);
  await anotarSalud(enLinea);

  if (enLinea) {
    if (avisado) notificar("Puerto Nuevo volvió a responder", "El sistema ya está en línea.");
    fallasSeguidas = 0;
    avisado = false;
    return;
  }
  fallasSeguidas += 1;
  if (avisado || tarea || fallasSeguidas < FALLAS_PARA_AVISAR || !instalado()) return;
  avisado = true;
  if (conSesion.valor && !intentoArrancar) {
    intentoArrancar = true;
    try {
      reiniciar("todo");
      notificar("Arrancando Puerto Nuevo", "La computadora se acaba de prender: estoy levantando los servidores.", mostrarVentana);
      return;
    } catch {}
  }
  notificar("Puerto Nuevo no responde", "Abre el Agente para ver qué pasa y reiniciar los servidores.", mostrarVentana);
}

function abrirWeb(url = URL_WEB) {
  // Solo la web de Puerto Nuevo (localhost o una IP de la red, puerto 8080).
  if (!/^http:\/\/(localhost|\d{1,3}(\.\d{1,3}){3}):8080\/?$/.test(url)) throw new Error("Dirección no permitida.");
  shell.openExternal(url);
}

function salir() {
  if (tarea) {
    const eleccion = dialog.showMessageBoxSync(ventana, {
      type: "warning",
      buttons: ["Esperar", "Salir de todos modos"],
      defaultId: 0,
      cancelId: 0,
      title: "Tarea en curso",
      message: "Hay una tarea corriendo. Si sales ahora, el sistema puede quedar a medio reiniciar.",
    });
    if (eleccion === 0) return;
  }
  saliendo = true;
  app.quit();
}

async function elegirCarpeta(titulo) {
  const { canceled, filePaths } = await dialog.showOpenDialog(ventana, { title: titulo, properties: ["openDirectory", "createDirectory"] });
  return canceled ? null : filePaths[0];
}

function crearVentana(visible) {
  ventana = new BrowserWindow({
    show: visible,
    width: 820,
    height: 760,
    minWidth: 640,
    minHeight: 600,
    title: "Agente Puerto Nuevo",
    icon: path.join(__dirname, "..", "build", "icon.png"),
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, "preload.cjs") },
  });

  ventana.on("closed", () => (ventana = null));
  // Cerrar la ventana la esconde: el Agente sigue vigilando desde la bandeja.
  ventana.on("close", (evento) => {
    if (saliendo) return;
    evento.preventDefault();
    ventana.hide();
    detenerLogs();
  });

  if (process.env.VITE_DEV_SERVER_URL) ventana.loadURL(process.env.VITE_DEV_SERVER_URL);
  else ventana.loadFile(path.join(__dirname, "..", "dist", "index.html"));
}

// --- Terminal: comandos sueltos dentro de WSL, en la carpeta del repositorio ---
// Es la consola del servidor para soporte: `docker compose ps`, `git status`,
// `./respaldar.sh`... Corre con `bash -lc` (el PATH y el perfil del usuario, como
// si lo escribieras en WSL) y su salida se manda tal cual a la ventana.
let terminal = null;

function terminalCorrer(comando) {
  if (terminal) throw new Error("Ya hay un comando corriendo.");
  const texto = String(comando ?? "").trim();
  if (!texto) return;
  const proceso = bash(["-lc", texto], exigirCarpeta());
  terminal = { proceso, texto };
  enviar("termInicio", { comando: texto });
  const leer = (trozo) => enviar("termSalida", trozo.toString("utf8"));
  proceso.stdout.on("data", leer);
  proceso.stderr.on("data", leer);
  const terminar = (codigo, error) => {
    if (!terminal) return;
    terminal = null;
    if (error) enviar("termSalida", `\n${error.message}\n`);
    enviar("termFin", { comando: texto, codigo: codigo ?? -1 });
  };
  proceso.on("error", (error) => terminar(-1, error));
  proceso.on("close", (codigo) => terminar(codigo));
}

function terminalDetener() {
  if (!terminal) return;
  const { proceso, texto } = terminal;
  terminal = null;
  proceso.kill(); // corta la salida en la ventana
  enviar("termSalida", "\n^C detenido\n");
  enviar("termFin", { comando: texto, codigo: 130 });
  // wsl.exe muere, pero el comando de adentro puede seguir (p. ej. `logs -f`):
  // se remata por su texto, que es lo que ve `pkill -f`. Sin acentos ni comillas.
  correr(["-lc", `pkill -f -- ${JSON.stringify(texto)} >/dev/null 2>&1; true`], carpetaActual() ?? undefined);
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
  terminalCorrer: (comando) => terminalCorrer(comando),
  terminalDetener: () => terminalDetener(),
  clonar: (padre) => clonar(padre),
  leerConfiguracion: () => leerConfiguracion(exigirCarpeta()),
  guardarConfiguracion: (valores) => guardarConfiguracion(exigirCarpeta(), valores),
  leerEnv: () => leerArchivoEnv(exigirCarpeta()),
  guardarEnv: (texto) => guardarArchivoEnv(exigirCarpeta(), texto),
  aplicarConfiguracion: () => aplicarConfiguracion(),
  actualizar: () => actualizar(),
  respaldar: () => respaldar(),
  listarRespaldos: () => listarRespaldos(),
  abrirLogs: () => abrirSubcarpeta("logs"),
  abrirRespaldos: () => abrirSubcarpeta("respaldos"),
  revisarSalud: () => revisarSalud(),
  estadoServidor: () => estadoServidor(exigirCarpeta()),
  relojes: () => relojes(exigirCarpeta()),
  direcciones: () => direcciones(),
  abrirWeb: (url) => abrirWeb(url),
  reiniciar: (servicio) => reiniciar(servicio),
  limpiar: () => limpiar(),
  verLogs: (servicio) => verLogs(servicio),
  detenerLogs: () => detenerLogs(),
  paqueteSoporte: async () => {
    const zip = await paqueteSoporte(exigirCarpeta(), { ultima: leerConfig().ultima ?? null, herramientas: await revisarHerramientas() });
    shell.showItemInFolder(zip);
    return zip;
  },
};

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", mostrarVentana);
  app.on("before-quit", () => (saliendo = true));

  app.whenReady().then(() => {
    if (PLATAFORMA === "win32") app.setAppUserModelId(APP_ID);
    for (const [canal, manejador] of Object.entries(manejadores)) {
      ipcMain.handle(canal, (_evento, ...args) => manejador(...args));
    }
    // Instalado, arranca con la sesion desde la primera vez (se quita en el menu de la bandeja).
    if (app.isPackaged && leerConfig().inicioAutomatico === undefined) {
      cambiarInicioAutomatico(true);
      guardarConfig({ inicioAutomatico: true });
    }
    conSesion.valor = arrancoConLaSesion();
    crearVentana(!conSesion.valor);
    bandeja = crearBandeja({
      abrir: mostrarVentana,
      abrirWeb: () => abrirWeb(),
      reiniciar: () => {
        mostrarVentana();
        try {
          reiniciar("todo");
        } catch (error) {
          dialog.showErrorBox("No se pudo reiniciar", error.message);
        }
      },
      salir,
    });
    revisarSalud();
    setInterval(revisarSalud, 15000);
  });

  // La ventana se esconde en lugar de cerrarse; solo "Salir" cierra el Agente.
  app.on("window-all-closed", () => {});
}
