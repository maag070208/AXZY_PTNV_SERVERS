// Todo lo que depende del sistema operativo: como correr bash (en Windows,
// dentro de WSL), que herramientas hay y como instalar las que faltan.
const { shell } = require("electron");
const { spawn, spawnSync } = require("node:child_process");
const os = require("node:os");

const PLATAFORMA = process.platform; // "win32" | "darwin" | "linux"
const ES_WINDOWS = PLATAFORMA === "win32";

// Las apps de macOS arrancan con un PATH minimo: sin esto no se ve Docker ni Homebrew.
function entorno() {
  const env = { ...process.env, WSL_UTF8: "1" }; // WSL_UTF8: wsl.exe escribe UTF-16 si no.
  if (PLATAFORMA === "darwin") {
    env.PATH = [env.PATH, "/usr/local/bin", "/opt/homebrew/bin", "/Applications/Docker.app/Contents/Resources/bin"].join(":");
  }
  return env;
}

// Proceso bash en `carpeta` (en Windows, dentro de WSL). --exec evita que wsl.exe
// pase la linea por otro shell y cambie las comillas.
function bash(args, carpeta) {
  const opciones = { cwd: carpeta, env: entorno(), stdio: ["ignore", "pipe", "pipe"], windowsHide: true };
  return ES_WINDOWS
    ? spawn("wsl.exe", ["--cd", carpeta, "--exec", "bash", ...args], opciones)
    : spawn("bash", args, opciones);
}

function correr(args, carpeta) {
  return new Promise((resolve) => {
    let salida = "";
    const proceso = bash(args, carpeta);
    proceso.stdout.on("data", (trozo) => (salida += trozo));
    proceso.stderr.on("data", (trozo) => (salida += trozo));
    proceso.on("error", (error) => resolve({ codigo: -1, salida: error.message }));
    proceso.on("close", (codigo) => resolve({ codigo, salida }));
  });
}

const SONDA = `
echo "git=$(git --version 2>/dev/null | head -n1)"
echo "curl=$(curl --version 2>/dev/null | head -n1 | cut -d' ' -f1-2)"
echo "docker=$(docker --version 2>/dev/null)"
echo "compose=$(docker compose version --short 2>/dev/null)"
info=$(docker info 2>&1) && echo docker_estado=ok || {
  grep -qi 'permission denied' <<<"$info" && echo docker_estado=permiso || echo docker_estado=apagado
}
`;

const URL = {
  wsl: "https://learn.microsoft.com/es-mx/windows/wsl/install",
  git: { darwin: "https://git-scm.com/download/mac", linux: "https://git-scm.com/download/linux", win32: "https://learn.microsoft.com/es-mx/windows/wsl/tutorials/wsl-git" },
  docker: {
    darwin: "https://www.docker.com/products/docker-desktop/",
    linux: "https://docs.docker.com/engine/install/",
    win32: "https://docs.docker.com/engine/install/ubuntu/",
  },
};

const APT = (paquetes) => `sudo apt-get update && sudo apt-get install -y ${paquetes}`;
const INSTALAR_DOCKER = "curl -fsSL https://get.docker.com | sudo sh && sudo usermod -aG docker $USER";

// Como resolver cada herramienta que falta: texto para la persona, pagina de
// descarga y, si se puede, el comando que se abre en una terminal.
const AYUDA = {
  wsl: {
    falta: {
      texto: "Windows necesita WSL (Linux dentro de Windows). Se abre PowerShell como administrador con 'wsl --install'; al terminar reinicia la computadora y crea tu usuario de Ubuntu.",
      url: URL.wsl,
      comando: "wsl --install",
      admin: true,
    },
  },
  git: {
    falta: {
      darwin: { texto: "Se instalan las herramientas de desarrollador de Apple (incluyen Git).", comando: "xcode-select --install" },
      linux: { texto: "Instala Git con el gestor de paquetes (se pide tu contraseña).", comando: APT("git") },
      win32: { texto: "Instala Git dentro de WSL (se pide la contraseña de tu usuario de Ubuntu).", comando: APT("git") },
    },
  },
  curl: {
    falta: {
      darwin: { texto: "macOS ya trae curl; si falta, reinstala las herramientas de desarrollador.", comando: "xcode-select --install" },
      linux: { texto: "Instala curl (se pide tu contraseña).", comando: APT("curl") },
      win32: { texto: "Instala curl dentro de WSL.", comando: APT("curl") },
    },
  },
  docker: {
    falta: {
      darwin: { texto: "Descarga e instala Docker Desktop para Mac (elige Apple Silicon o Intel según tu equipo). Ábrelo una vez y acepta los términos." },
      linux: { texto: "Instala Docker Engine con el script oficial (se pide tu contraseña). Después cierra sesión y vuelve a entrar.", comando: INSTALAR_DOCKER },
      win32: {
        texto: "Instala Docker Engine dentro de WSL con el script oficial (se pide tu contraseña). Al terminar corre 'wsl --shutdown' en PowerShell y vuelve a revisar.",
        comando: INSTALAR_DOCKER,
      },
    },
    apagado: {
      darwin: { texto: "Docker Desktop está instalado pero cerrado. Se abre y hay que esperar a que diga 'Engine running'.", abrirDocker: true },
      linux: { texto: "Docker está instalado pero apagado.", comando: "sudo systemctl enable --now docker" },
      win32: { texto: "Docker está instalado en WSL pero apagado.", comando: "sudo service docker start" },
    },
    permiso: {
      darwin: { texto: "Tu usuario no tiene permiso para usar Docker. Reinicia Docker Desktop." },
      linux: { texto: "Tu usuario no tiene permiso para usar Docker. Después cierra sesión y vuelve a entrar.", comando: "sudo usermod -aG docker $USER" },
      win32: {
        texto: "Tu usuario de WSL no tiene permiso para usar Docker. Después corre 'wsl --shutdown' en PowerShell y vuelve a revisar.",
        comando: "sudo usermod -aG docker $USER",
      },
    },
  },
};
AYUDA.compose = {
  falta: {
    darwin: AYUDA.docker.falta.darwin,
    linux: { texto: "Falta el plugin 'docker compose'.", comando: APT("docker-compose-plugin") },
    win32: { texto: "Falta el plugin 'docker compose' dentro de WSL.", comando: APT("docker-compose-plugin") },
  },
};

function ayudaPara(id, estado) {
  const porEstado = AYUDA[id]?.[estado];
  if (!porEstado) return null;
  const ayuda = porEstado[PLATAFORMA] ?? porEstado;
  const url = typeof URL[id] === "string" ? URL[id] : URL[id]?.[PLATAFORMA];
  return { url, ...ayuda };
}

function wslListo() {
  const resultado = spawnSync("wsl.exe", ["--exec", "true"], { env: entorno(), windowsHide: true, timeout: 60000 });
  return resultado.status === 0;
}

// Lista de herramientas con su estado: "ok" | "falta" | "apagado" | "permiso".
async function revisarHerramientas() {
  const lista = [];
  const agregar = (id, nombre, estado, detalle = "") => lista.push({ id, nombre, estado, detalle, ayuda: estado === "ok" ? null : ayudaPara(id, estado) });

  if (ES_WINDOWS) {
    const listo = wslListo();
    agregar("wsl", "WSL (Linux en Windows)", listo ? "ok" : "falta");
    if (!listo) {
      for (const [id, nombre] of [["git", "Git"], ["docker", "Docker"], ["compose", "Docker Compose"], ["curl", "curl"]]) {
        agregar(id, nombre, "falta", "Primero instala WSL");
        lista.at(-1).ayuda = null;
      }
      return lista;
    }
  }

  const { salida } = await correr(["-c", SONDA], os.homedir());
  const valor = (clave) => (salida.match(new RegExp(`^${clave}=(.*)$`, "m"))?.[1] ?? "").trim();
  const docker = valor("docker");
  agregar("git", "Git", valor("git") ? "ok" : "falta", valor("git").replace(/^git version /, ""));
  agregar("docker", "Docker", docker ? valor("docker_estado") || "apagado" : "falta", docker.replace(/^Docker version /, "").split(",")[0]);
  agregar("compose", "Docker Compose", valor("compose") ? "ok" : "falta", valor("compose"));
  agregar("curl", "curl", valor("curl") ? "ok" : "falta", valor("curl").replace(/^curl /, ""));
  return lista;
}

const conPausa = (comando) => `${comando}; echo; read -p 'Listo. Presiona Enter para cerrar esta ventana...'`;
const comillasAppleScript = (texto) => `"${texto.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

// Abre una terminal visible con el comando: ahi la persona ve lo que pasa y
// escribe su contraseña si se la piden.
function abrirTerminal(comando, { admin } = {}) {
  const lanzar = (programa, args) => {
    const proceso = spawn(programa, args, { detached: true, stdio: "ignore", env: entorno() });
    proceso.on("error", () => {});
    proceso.unref();
  };

  if (ES_WINDOWS && admin) {
    // Pide permisos de administrador (UAC) y deja PowerShell abierto.
    lanzar("powershell.exe", ["-NoProfile", "-Command", `Start-Process powershell -Verb RunAs -ArgumentList '-NoExit','-Command','${comando}'`]);
    return { ok: true };
  }
  if (ES_WINDOWS) {
    // detached: Windows le da su propia ventana de consola.
    lanzar("wsl.exe", ["--cd", "~", "--exec", "bash", "-c", conPausa(comando)]);
    return { ok: true };
  }
  if (PLATAFORMA === "darwin") {
    lanzar("osascript", ["-e", `tell application "Terminal" to do script ${comillasAppleScript(conPausa(comando))}`, "-e", 'tell application "Terminal" to activate']);
    return { ok: true };
  }
  const terminales = [
    ["x-terminal-emulator", ["-e"]],
    ["gnome-terminal", ["--"]],
    ["konsole", ["-e"]],
    ["xfce4-terminal", ["-x"]],
    ["xterm", ["-e"]],
  ];
  const encontrada = terminales.find(([programa]) => spawnSync("sh", ["-c", `command -v ${programa}`]).status === 0);
  if (!encontrada) return { ok: false, error: "No encontré una terminal. Copia el comando y córrelo en una." };
  lanzar(encontrada[0], [...encontrada[1], "bash", "-c", conPausa(comando)]);
  return { ok: true };
}

// Accion del boton "Instalar"/"Arrancar" de una herramienta.
function resolverHerramienta(id, estado) {
  const ayuda = ayudaPara(id, estado);
  if (!ayuda) return { ok: false, error: "No hay una acción automática para esto." };
  if (ayuda.abrirDocker) {
    spawn("open", ["-a", "Docker"], { detached: true, stdio: "ignore" }).unref();
    return { ok: true };
  }
  if (ayuda.comando) return abrirTerminal(ayuda.comando, { admin: ayuda.admin });
  if (ayuda.url) {
    shell.openExternal(ayuda.url);
    return { ok: true };
  }
  return { ok: false, error: "No hay una acción automática para esto." };
}

function abrirDescarga(id, estado) {
  const url = ayudaPara(id, estado)?.url;
  if (url) shell.openExternal(url);
}

module.exports = { PLATAFORMA, bash, correr, revisarHerramientas, resolverHerramienta, abrirDescarga };
