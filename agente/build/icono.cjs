// Genera los iconos desde build/icon.svg con el Electron del proyecto:
//   build/icon.png (1024): electron-builder saca de ahi el .ico, .icns y los PNG de Linux.
//   build/bandeja*.png (64): icono junto al reloj; con punto verde o rojo segun el sistema.
// Uso: pnpm icono
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const SVG = fs.readFileSync(path.join(__dirname, "icon.svg"), "utf8");
const punto = (color) => `<circle cx="400" cy="400" r="104" fill="${color}" stroke="#ffffff" stroke-width="28"/></svg>`;

const ICONOS = [
  { archivo: "icon.png", lado: 1024, svg: SVG },
  { archivo: "bandeja.png", lado: 64, svg: SVG },
  { archivo: "bandeja-ok.png", lado: 64, svg: SVG.replace("</svg>", punto("#22c55e")) },
  { archivo: "bandeja-falla.png", lado: 64, svg: SVG.replace("</svg>", punto("#ef4444")) },
];

// En modo offscreen la imagen llega con el evento "paint" (capturePage no termina).
function renderizar({ archivo, lado, svg }) {
  return new Promise((resolve) => {
    const ventana = new BrowserWindow({
      width: lado,
      height: lado,
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: "#00000000",
      webPreferences: { offscreen: true },
    });
    ventana.webContents.on("paint", (_evento, _zona, imagen) => {
      if (imagen.getSize().width < lado) return;
      fs.writeFileSync(path.join(__dirname, archivo), imagen.resize({ width: lado, height: lado, quality: "best" }).toPNG());
      ventana.destroy();
      resolve();
    });
    const conTamano = svg.replace("<svg ", `<svg width="${lado}" height="${lado}" `);
    ventana.loadURL(`data:text/html,${encodeURIComponent(`<body style="margin:0;background:transparent">${conTamano}</body>`)}`);
  });
}

// Se cierra una ventana por icono: sin esto Electron sale al cerrar la primera.
app.on("window-all-closed", () => {});

app.whenReady().then(async () => {
  setTimeout(() => {
    console.error("No se pudieron generar los iconos.");
    app.exit(1);
  }, 30000);
  for (const icono of ICONOS) await renderizar(icono);
  app.quit();
});
