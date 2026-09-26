# Agente Puerto Nuevo

App de escritorio (Electron + [AXZY UI System](https://www.npmjs.com/package/@axzydev/axzy_ui_system)) para instalar, actualizar y respaldar Puerto Nuevo con clics, en Windows, macOS y Linux.

## Qué hace

- **Primera vez (asistente):**
  1. Revisa Git, Docker, Docker Compose y curl (en Windows, además WSL). Para cada uno que falte dice qué descargar, o abre una terminal con el comando de instalación listo.
  2. Descarga este repositorio (`git clone`) o usa uno que ya exista.
  3. Arma el `.env` desde `.env.example`, con `POSTGRES_PASSWORD` y `JWT_SECRET` generados.
  4. Instala (corre `actualizar.sh`).
- **Después (panel):** Actualizar, Respaldar, estado de las herramientas y del sistema (`/api/v1/health`), y editar el `.env`.

La lógica vive en los scripts del repo (`actualizar.sh`, `respaldar.sh`, `comun.sh`), no en la app: con cada `git pull` llega la versión nueva de los pasos sin reinstalar el Agente. La app lee las líneas `==> [n/total] Título` para mostrar el avance, y `ERROR:` / `AVISO:` para los mensajes.

En Windows todo corre dentro de WSL (`wsl.exe --cd <carpeta> --exec bash …`); en macOS y Linux, con bash directo.

## Desarrollo

```bash
pnpm install
pnpm app          # compila la interfaz y abre el Agente
pnpm icono        # regenera build/icon.png desde build/icon.svg
```

## Instaladores

Se construyen desde macOS, sin Wine. Quedan en `release/`:

```bash
pnpm dist:win     # Agente-Puerto-Nuevo-Setup-<versión>.exe (x64): instala y crea el acceso directo "Actualizar Puerto Nuevo"
pnpm dist:mac     # Agente-Puerto-Nuevo-<versión>-arm64.dmg y -x64.dmg
pnpm dist:linux   # Agente-Puerto-Nuevo-<versión>.AppImage (x64)
```

No están firmados para distribución:

- **Windows:** la primera vez sale "Windows protegió su PC" → *Más información* → *Ejecutar de todas formas*.
- **macOS:** clic derecho → *Abrir*. No está notarizado.
- **Linux:** `chmod +x` al `.AppImage`.
