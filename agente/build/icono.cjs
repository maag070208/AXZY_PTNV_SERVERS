// Genera build/icon.png (1024x1024) desde build/icon.svg con el Electron del
// proyecto; electron-builder saca de ahi el .ico, .icns y los PNG de Linux.
// Uso: pnpm icono
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const LADO = 1024;

app.whenReady().then(() => {
  const svg = fs.readFileSync(path.join(__dirname, "icon.svg"), "utf8").replace("<svg ", `<svg width="${LADO}" height="${LADO}" `);
  const ventana = new BrowserWindow({
    width: LADO,
    height: LADO,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    webPreferences: { offscreen: true, zoomFactor: 1 },
  });
  // En modo offscreen la imagen llega con el evento "paint" (capturePage no termina).
  ventana.webContents.on("paint", (_evento, _zona, imagen) => {
    const { width } = imagen.getSize();
    if (width < LADO) return;
    fs.writeFileSync(path.join(__dirname, "icon.png"), imagen.resize({ width: LADO, height: LADO }).toPNG());
    app.quit();
  });
  ventana.loadURL(`data:text/html,${encodeURIComponent(`<body style="margin:0;background:transparent">${svg}</body>`)}`);
  setTimeout(() => {
    console.error("No se pudo generar el icono.");
    app.exit(1);
  }, 20000);
});
