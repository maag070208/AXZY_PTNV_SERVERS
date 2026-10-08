// Pruebas del registro de caídas del Agente (`agente/electron/vigilante.cjs`).
//
// Es el instrumento con el que vamos a diagnosticar por qué se cae el servidor
// del cliente: si el formato o la decisión de «¿cambió?» están mal, el próximo
// evento no queda registrado y volvemos a adivinar.
//
//   node --test pruebas/vigilante.test.cjs
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const v = require("../agente/electron/vigilante.cjs");

const RAIZ = path.join(__dirname, "..");
const taller = () => fs.mkdtempSync(path.join(os.tmpdir(), "ptnv-vigilante-"));
/** Fecha local fija: el sello se escribe en hora local, como los logs del shell. */
const FECHA = new Date(2026, 9, 8, 18, 21, 13); // 08/10/2026 18:21:13

test("el sello y el nombre del archivo son los que lee soporte", () => {
  assert.equal(v.sello(new Date(2026, 0, 5, 9, 8, 7)), "2026-01-05 09:08:07");
  assert.equal(path.basename(v.archivoDelDia("/x", FECHA)), "agente-2026-10-08.log");
  assert.equal(v.archivoDelDia("/x", FECHA), path.join("/x", "logs", "agente-2026-10-08.log"));
});

test("la primera revisión no es una transición (todavía no hay con qué comparar)", () => {
  const s = v.crearSeguimiento();
  assert.equal(s.cambio(true), false, "la primera no se anota");
  assert.equal(s.cambio(true), false, "sin cambios, no se anota");
  assert.equal(s.cambio(false), true, "se cayó: se anota");
  assert.equal(s.cambio(false), false, "sigue caído: no se repite");
  assert.equal(s.cambio(true), true, "volvió: se anota");
});

test("cada transición se anota con hora y estado", () => {
  const carpeta = taller();
  v.anotar(carpeta, v.lineaTransicion(false, FECHA));
  v.anotar(carpeta, v.lineaTransicion(true, FECHA));
  assert.deepEqual(fs.readFileSync(v.archivoDelDia(carpeta, FECHA), "utf8").trimEnd().split("\n"), [
    "2026-10-08 18:21:13  SIN RESPUESTA (API o base)",
    "2026-10-08 18:21:13  EN LINEA (API y base responden)",
  ]);
});

test("la foto de Docker distingue «se cayó el engine» de «alguien paró el contenedor»", () => {
  // Engine caído: no hay servicios que reportar.
  assert.equal(v.lineaDocker("apagado", [], FECHA), "2026-10-08 18:21:13  docker=apagado\n");
  // Engine vivo y todo corriendo.
  assert.equal(
    v.lineaDocker("ok", [
      { servicio: "api", estado: "running", salud: "" },
      { servicio: "postgres", estado: "running", salud: "healthy" },
    ], FECHA),
    "2026-10-08 18:21:13  docker=ok  api=running postgres=running/healthy\n"
  );
  // Engine vivo pero el contenedor parado (o arrancando): el caso que buscamos.
  assert.match(
    v.lineaDocker("ok", [{ servicio: "postgres", estado: "exited", salud: "unhealthy" }], FECHA),
    /docker=ok {2}postgres=exited\/unhealthy/
  );
  assert.match(v.lineaDocker("ok", null, FECHA), /docker=ok\n$/);
});

test("anotar agrega líneas y NUNCA lanza (un log no puede tumbar al Agente)", () => {
  const carpeta = taller();
  assert.equal(v.anotar(carpeta, "uno\n"), true);
  assert.equal(v.anotar(carpeta, "dos\n"), true);
  assert.equal(fs.readFileSync(v.archivoDelDia(carpeta, new Date()), "utf8"), "uno\ndos\n");

  // Una carpeta que no existe porque en su lugar hay un archivo: falla en silencio.
  const archivo = path.join(carpeta, "soy-un-archivo");
  fs.writeFileSync(archivo, "");
  assert.equal(v.anotar(archivo, "x\n"), false);
});

test("el Agente anota cada cambio de salud (el cableado no se puede perder)", () => {
  const fuente = fs.readFileSync(path.join(RAIZ, "agente", "electron", "main.cjs"), "utf8");
  assert.match(fuente, /require\("\.\/vigilante\.cjs"\)/, "main.cjs tiene que usar el vigilante");
  assert.match(fuente, /await anotarSalud\(enLinea\)/, "revisarSalud tiene que anotar la transición");
});
