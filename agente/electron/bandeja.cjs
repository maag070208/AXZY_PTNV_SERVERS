// Icono junto al reloj, avisos del sistema y arranque con la sesion.
const { app, Menu, Notification, Tray, nativeImage } = require("electron");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ICONOS = path.join(__dirname, "..", "build");
const TEXTO = { null: "Revisando Puerto Nuevo…", true: "● Puerto Nuevo en línea", false: "● Puerto Nuevo no responde" };
const ARCHIVO = { null: "bandeja.png", true: "bandeja-ok.png", false: "bandeja-falla.png" };

// 16px con su version 2x, para que no se vea borroso en pantallas de alta densidad.
function icono(archivo) {
  const original = nativeImage.createFromPath(path.join(ICONOS, archivo));
  const imagen = original.resize({ width: 16, height: 16, quality: "best" });
  imagen.addRepresentation({ scaleFactor: 2, buffer: original.resize({ width: 32, height: 32, quality: "best" }).toPNG() });
  return imagen;
}

// acciones: { abrir, abrirWeb, reiniciar, salir }
function crearBandeja(acciones) {
  const bandeja = new Tray(icono(ARCHIVO.null));
  let salud = null;

  const pintar = () => {
    bandeja.setImage(icono(ARCHIVO[salud]));
    bandeja.setToolTip(`Agente Puerto Nuevo — ${TEXTO[salud].replace("● ", "")}`);
    bandeja.setContextMenu(
      Menu.buildFromTemplate([
        { label: TEXTO[salud], enabled: false },
        { type: "separator" },
        { label: "Abrir el Agente", click: acciones.abrir },
        { label: "Abrir Puerto Nuevo en el navegador", click: acciones.abrirWeb },
        { label: "Reiniciar los servidores", click: acciones.reiniciar },
        { type: "separator" },
        { label: "Arrancar al iniciar sesión", type: "checkbox", checked: inicioAutomatico(), click: (item) => cambiarInicioAutomatico(item.checked) },
        { label: "Salir del Agente", click: acciones.salir },
      ]),
    );
  };

  // En Windows y Linux el clic abre la ventana; en macOS el clic abre el menu.
  if (process.platform !== "darwin") bandeja.on("click", acciones.abrir);
  pintar();

  return {
    ponerSalud(nueva) {
      if (nueva === salud) return;
      salud = nueva;
      pintar();
    },
  };
}

function notificar(titulo, cuerpo, alHacerClic) {
  if (!Notification.isSupported()) return;
  const aviso = new Notification({ title: titulo, body: cuerpo, icon: path.join(ICONOS, "icon.png") });
  if (alHacerClic) aviso.on("click", alHacerClic);
  aviso.show();
}

// --- Arranque con la sesion ------------------------------------------------
// Windows y macOS lo resuelve Electron; Linux usa ~/.config/autostart.
const ARGUMENTO_OCULTO = "--oculto";
const escritorioLinux = () => path.join(os.homedir(), ".config", "autostart", "agente-puerto-nuevo.desktop");
const ejecutable = () => process.env.APPIMAGE || process.execPath;

function inicioAutomatico() {
  if (process.platform === "linux") return fs.existsSync(escritorioLinux());
  return app.getLoginItemSettings({ args: [ARGUMENTO_OCULTO] }).openAtLogin;
}

function cambiarInicioAutomatico(activar) {
  if (process.platform === "linux") {
    if (!activar) return fs.rmSync(escritorioLinux(), { force: true });
    fs.mkdirSync(path.dirname(escritorioLinux()), { recursive: true });
    fs.writeFileSync(
      escritorioLinux(),
      ["[Desktop Entry]", "Type=Application", "Name=Agente Puerto Nuevo", `Exec="${ejecutable()}" ${ARGUMENTO_OCULTO}`, "X-GNOME-Autostart-enabled=true", ""].join("\n"),
    );
    return;
  }
  app.setLoginItemSettings({ openAtLogin: activar, path: ejecutable(), args: [ARGUMENTO_OCULTO] });
}

// Arranco solo al iniciar sesion: se queda en la bandeja sin abrir la ventana.
function arrancoConLaSesion() {
  if (process.argv.includes(ARGUMENTO_OCULTO)) return true;
  return process.platform === "darwin" && app.getLoginItemSettings().wasOpenedAtLogin;
}

module.exports = { crearBandeja, notificar, inicioAutomatico, cambiarInicioAutomatico, arrancoConLaSesion };
