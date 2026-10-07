// Borra de release/ los instaladores de versiones anteriores (y las carpetas
// sueltas que deja electron-builder) antes de armar la version nueva: asi al
// subir el release no se cuela un archivo viejo. Corre solo desde `pnpm dist:*`.
const fs = require("node:fs");
const path = require("node:path");
const { version } = require("../package.json");

const release = path.join(__dirname, "..", "release");
if (!fs.existsSync(release)) process.exit(0);

// Carpetas de trabajo de electron-builder: se vuelven a crear en cada build.
const SUELTAS = ["mac", "mac-arm64", "win-unpacked", "linux-unpacked", ".icon-icns", ".icon-ico"];
const INSTALADOR = /\.(exe|dmg|AppImage|zip|snap|deb|rpm|blockmap)$/i;
const esDeEstaVersion = (nombre) => nombre.includes(`-${version}.`) || nombre.includes(`-${version}-`);

const borrados = [];
for (const nombre of fs.readdirSync(release)) {
  if (!SUELTAS.includes(nombre) && !(INSTALADOR.test(nombre) && !esDeEstaVersion(nombre))) continue;
  fs.rmSync(path.join(release, nombre), { recursive: true, force: true });
  borrados.push(nombre);
}

console.log(borrados.length ? `Release limpio (quedan solo los archivos de la ${version}):\n  ${borrados.join("\n  ")}` : `Release ya estaba limpio (solo la ${version}).`);
