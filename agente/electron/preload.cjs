const { contextBridge, ipcRenderer } = require("electron");

// Los mismos nombres que `manejadores` en main.cjs.
const CANALES = [
  "estado",
  "herramientas",
  "resolverHerramienta",
  "abrirDescarga",
  "elegirDestino",
  "usarExistente",
  "clonar",
  "leerConfiguracion",
  "guardarConfiguracion",
  "aplicarConfiguracion",
  "actualizar",
  "respaldar",
  "listarRespaldos",
  "abrirLogs",
  "abrirRespaldos",
  "revisarSalud",
];

const escuchar = (canal) => (callback) => {
  const manejador = (_evento, dato) => callback(dato);
  ipcRenderer.on(canal, manejador);
  return () => ipcRenderer.removeListener(canal, manejador);
};

contextBridge.exposeInMainWorld("agente", {
  ...Object.fromEntries(CANALES.map((canal) => [canal, (...args) => ipcRenderer.invoke(canal, ...args)])),
  onLinea: escuchar("linea"),
  onFin: escuchar("fin"),
  onSalud: escuchar("salud"),
});
