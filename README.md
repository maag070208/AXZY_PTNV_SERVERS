# AXZY PTNV — Cartas Responsivas (Servers)

Repositorio para **desplegar** el sistema completo (API + Web + Base de datos) en la computadora del cliente con **Docker Desktop**.

> ⚠️ Aquí **no se compila código**: este repo baja las imágenes ya publicadas en Docker Hub (`axzydev/axzy_ptnv_api` y `axzydev/axzy_ptnv_web`) y solo las orquesta.

> 🖱️ **Lo más fácil: el Agente Puerto Nuevo** (Windows, macOS y Linux). Es una app con ícono que revisa si tienes Git y Docker (y WSL en Windows) y te dice qué descargar si falta algo, descarga este repositorio, arma el `.env`, instala, actualiza y respalda con un clic. Instaladores: `Agente-Puerto-Nuevo-Setup-<versión>.exe` (Windows), `.dmg` (macOS) y `.AppImage` (Linux); ver [agente/README.md](agente/README.md). Los pasos 2 a 5 de abajo son lo mismo, a mano.

---

## 1. Servicios

| Servicio | Imagen | Puerto interno | Puerto público |
|---|---|---|---|
| PostgreSQL | `postgres:16-alpine` | `5432` | `5433` |
| API | `axzydev/axzy_ptnv_api:latest` | `4001` | `4001` |
| Web (nginx) | `axzydev/axzy_ptnv_web:latest` | `80` | `8080` |

> El dato importante es el **puerto público** (el que usas en el navegador). Los puertos internos no los uses.

La web consulta al API a través del nginx interno (`/api/` → `http://api:4001/api/`). No tienes que configurar IPs ni puertos del API en esta máquina.

---

## 2. Requisitos en la PC del cliente

1. Instalar **Docker Desktop** (Windows / macOS / Linux).
2. Abrir **Docker Desktop** una vez (debe quedar corriendo — el ícono no debe tener el indicador "Docker is not running" / "Engine stopped").
3. Tener acceso a internet (las imágenes se bajan de Docker Hub la primera vez, tarda unos minutos).

Verifica que Docker quede listo con:

```bash
docker info
```

Si devuelve la versión del servidor, ya puedes continuar.

---

## 3. Bajar el repositorio (solo la primera vez)

Abre una **terminal** (macOS/Linux: **Terminal**; Windows: **PowerShell** o **CMD**) y ejecuta:

**Con SSH** (recomendado si configuraste tu llave SSH de GitHub):

```bash
git clone git@github.com:maag070208/AXZY_PTNV_SERVERS.git
cd AXZY_PTNV_SERVERS
```

**Con HTTPS** (sin configurar llaves, pide usuario/token de GitHub):

```bash
git clone https://github.com/maag070208/AXZY_PTNV_SERVERS.git
cd AXZY_PTNV_SERVERS
```

Si ya habías clonado antes, entra a la carpeta sin volver a clonar:

```bash
cd AXZY_PTNV_SERVERS
```

---

## 4. Crear el archivo `.env` (una vez, al instalarse)

El archivo `.env` guarda las contraseñas/secretos del sistema **y NO se sube a git**.

```bash
cp .env.example .env
```

Edítalo (macOS: `nano .env` o `open -e .env`; Windows: `notepad .env`) y completa los valores. Con el Agente también se puede: **Ajustes → Configuración**, en el **formulario** (campo por campo, con la ayuda de `.env.example`, y un botón para agregar variables nuevas) o en **Archivo** (el `.env` completo tal cual, para verlo y corregirlo línea por línea).

### Variables del `.env`

| Variable | Qué es | Valor sugerido |
|---|---|---|
| `POSTGRES_PASSWORD` | Contraseña de la base de datos | **Cámbiala** de `cartas_dev_pwd` por una contraseña propia/fuerte |
| `JWT_SECRET` | Secreto con el que se firman los tokens de sesión | **Cámbialo** de `cambia_este_secreto_en_produccion` por una cadena larga y aleatoria |
| `ABLY_API_KEY` | Key de Ably para el **realtime** de notificaciones de tickets | La misma key que ya usas en desarrollo (`ABLY_API_KEY` de `api/.env` o `VITE_ABLY_KEY` de `web/.env` — es el **mismo valor**) |
| `CHECADOR_USER` / `CHECADOR_PASS` | Usuario y contraseña de los **relojes checadores** (los mismos para todos). El sistema solo lee de los relojes | Los del reloj. Si la contraseña lleva `$`, `#` o espacios, ponla entre comillas simples. Si la cambias en los relojes, cámbiala aquí también |
| `ACCESS_REPORT_TIMEZONE` | Zona horaria de los reportes de entradas/salidas | `America/Tijuana` (hora del Pacífico, la de los relojes). Vacía = `America/Mexico_City` |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_BUCKET_NAME` / `AWS_REGION` | Bucket de S3 para los archivos (evidencias de tickets, fotos y documentos del personal) | Los de tu cuenta de AWS. Sin ellos las subidas fallan; lo demás funciona |

> ⚠️ **Importante**: usa SIEMPRE la misma `ABLY_API_KEY` que está en la web ya publicada. La web la trae incrustada desde la imagen; si pones una key distinta aquí, el API recibirá los eventos pero la web no los mostrará (no matchearán).

Si no pones `ABLY_API_KEY`, el API **arranca igual** pero el realtime de tickets fallará en runtime (el login y el resto del sistema funcionan).

---

## 5. Levantar el sistema

```bash
docker compose up -d
```

Al arrancar, el API aplica las **migraciones pendientes** y nada más: **el seed NO corre solo** (ver «¿La actualización toca mis datos?»). En una **instalación nueva** (base vacía) hay que cargar los datos iniciales UNA vez, a mano:

```bash
docker compose exec api npx prisma db seed
```

Espera unos segundos y verifica:

```bash
docker compose ps
```

Deberías ver las 3 filas (`ptnv-postgres`, `ptnv-api`, `ptnv-web`) en estado **Up** (y el API `Up ... (healthy)`).

Si algo quedó arrancando, dale 10-15 segundos y vuelve a checar:

```bash
docker compose ps
```

---

## 6. Acceso

| Qué | URL | Credencial (seed) |
|---|---|---|
| **Web** | http://localhost:8080 | `admin` / `admin123` (ADMIN) — `usuario` / `user123` (USER) |
| **API** | http://localhost:4001 | con token JWT |
| **BD** | localhost:5433 | `cartas` / tu `POSTGRES_PASSWORD` |

---

## 7. Actualizar a la última versión

**Con el Agente:** botón **Actualizar ahora**. Muestra cada paso y al final dice si quedó bien o dónde se detuvo.

**Sin el Agente (Windows):** doble clic en `Actualizar.cmd` (en la carpeta `AXZY_PTNV_SERVERS`). Se abre una ventana, entra a WSL y hace lo mismo; al final dice **LISTO** o **ERROR**. En macOS/Linux: `bash ./actualizar.sh`.

Los pasos (`actualizar.sh`):

1. Revisa que Docker responda (en Windows, dentro de WSL; si no, intenta arrancarlo).
2. Trae la configuración nueva de este repositorio (`git pull`).
3. Respalda la base de datos en `respaldos/` (ver «Respaldar la base de datos»).
4. Baja las imágenes nuevas del API y la web (`docker compose pull`) y dice cuál trae versión nueva.
5. Aplica las migraciones (`npx prisma migrate deploy`). **Si fallan, se detiene aquí y el sistema sigue con la versión anterior.**
6. Reinicia los servidores con la versión nueva y espera a que `/api/v1/health` responda 200 (directo en el API `:4001` y a través de la web `:8080`).
7. Borra las imágenes viejas.

Si algo falla, se detiene en ese paso y deja el detalle en `logs/` (manda ese archivo a soporte).

**¿`Actualizar.cmd` en el escritorio?** Clic derecho → *Enviar a* → *Escritorio (crear acceso directo)*. Si en lugar de eso **copias** el archivo a otro lado, ábrelo con clic derecho → *Editar* y pon la ruta de la carpeta en `CARPETA` (sirve `C:\Users\...\AXZY_PTNV_SERVERS` o `/mnt/c/Users/.../AXZY_PTNV_SERVERS`).

> ⚠️ `git pull` **no toca tu `.env`**. Si la configuración nueva trae variables, la actualización lo avisa (`AVISO: faltan en .env: …`): agrégalas con sus valores (tabla del paso 4, o en el Agente → Ajustes → Configuración: aparecen solas en el formulario) y vuelve a correrla.

### Actualización automática (opcional)

Para que se actualice sola todos los días a las 3:00 am, una sola vez en PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File programar-actualizacion.ps1
```

- Otra hora: agrega `-Hora 04:30`.
- Quitarla: `Unregister-ScheduledTask -TaskName "Puerto Nuevo - Actualizar" -Confirm:$false`.
- Corre dentro de WSL con el usuario que la programó y solo con su sesión abierta. Si Docker en WSL necesita `sudo` para arrancar, la automática no puede meter la contraseña: deja Docker arrancando solo o agrega tu usuario al grupo `docker`. Si a esa hora la PC estaba apagada, corre en cuanto se prenda. Cada corrida deja su resultado en `logs\`.

> ⚠️ Con la actualización automática, lo que se publique como `latest` en Docker Hub llega al servidor esa misma noche.

### Respaldar la base de datos

**Con el Agente:** tarjeta *Respaldos* → **Respaldar ahora**. Sin el Agente: `bash ./respaldar.sh` (en Windows, dentro de WSL). La actualización también saca uno antes de tocar nada.

- Quedan en `respaldos/cartas-AAAAMMDD-HHMMSS.dump`; se guardan los últimos 14.
- **No incluyen las checadas de los relojes** (`time_clock_punches`): son la mayor parte de la base y se pueden volver a bajar de los relojes. La tabla va vacía; lo demás (incluidos los relojes dados de alta y los vínculos con empleados) va completo.

### Restaurar un respaldo (soporte)

En la carpeta `AXZY_PTNV_SERVERS` (en Windows, dentro de WSL):

```bash
docker compose stop api
docker cp respaldos/cartas-AAAAMMDD-HHMMSS.dump ptnv-postgres:/tmp/r.dump
docker exec ptnv-postgres pg_restore -U cartas -d cartas --clean --if-exists /tmp/r.dump
# El respaldo no trae checadas: con el cursor en 0 el worker las vuelve a bajar todas.
docker exec ptnv-postgres psql -U cartas -d cartas -c 'UPDATE time_clocks SET "lastSerialNo" = 0;'
docker compose start api
```

- Volver a bajar todo el historial de los relojes tarda. Si solo hacen falta unos días, en lugar del `UPDATE` usa la web: **Control de acceso → Reloj checador**, elige el rango de fechas y **Importar de los relojes**.
- Al arrancar, el API vuelve a aplicar las migraciones de su versión. Si el problema fue la versión nueva, restaurar no basta: hay que regresar también las imágenes a una versión publicada con etiqueta `v…` (en `docker-compose.yml`, en lugar de `latest`).

### A mano (si no se puede usar el script)

```bash
git pull
docker compose pull
docker compose up -d
docker compose ps
```

---

## 8. Operación básica (para el día a día)

**Con el Agente** (vive junto al reloj, en la bandeja del sistema, y arranca al iniciar sesión):

- El ícono se pone **verde** o **rojo** según responda el API. Si deja de responder, avisa con una notificación; si la computadora se acaba de prender, primero intenta levantar los servidores solo.
- **Inicio:** actualizar, abrir la web, y las direcciones para otras PCs y celulares (con QR), marcando cuáles responden.
- **Servidores:** estado de API, web y base; reiniciar cada uno o todos; logs en vivo; espacio en disco y «Liberar espacio».
- **Relojes:** cada reloj checador con sus checadas guardadas, la última checada, cuándo se sincronizó y si el servidor lo alcanza en la red.
- **Ajustes → Mandar a soporte:** arma un `.zip` con logs, estado y versiones (sin las contraseñas del `.env`) en `soporte/`.

Cerrar la ventana solo la esconde; para cerrar el Agente: ícono de la bandeja → *Salir del Agente*.

**Sin el Agente** (en Windows, dentro de WSL):

```bash
bash ./operar.sh reiniciar api             # o web, postgres, todo; espera a que responda
bash ./operar.sh logs api                  # log en vivo (Ctrl+C para salir)
bash ./operar.sh limpiar                   # borra imágenes viejas de Docker (no toca la base)
bash ./operar.sh diagnostico soporte/hoy   # lo que soporte necesita, en soporte/hoy
```

O directo con Docker:

```bash
docker compose ps                          # estado de los servicios
docker compose logs -f api                 # logs del API en vivo (Ctrl+C para salir)
docker compose logs api                    # últimas líneas de log del API
docker compose logs -f web                 # logs de la web (nginx)
docker compose restart api                 # reiniciar solo el API (reaplica migraciones; NO toca tus datos)
docker compose restart web                 # reiniciar solo la web
docker compose down                        # detener todo (NO borra la base de datos)
docker compose down -v                     # detener y BORRAR la base de datos (⚠️ pierde TODOS los datos)
```

---

## 9. Problemas comunes

### El API no llega a "healthy" / la web no carga

```bash
docker compose logs -f api
```

- Si el log termina con un error de conexión a `postgres`, espera 10 s más (la BD aún está arrancando) y revisa de nuevo.
- Si el API quedó arriba pero no "healthy", suele ser normal los primeros segundos; `docker compose restart api` frecuentemente lo resuelve.

### Puerto ocupado (postgres/web/api)

```bash
lsof -i :8080 -i :4001 -i :5433   # macOS/Linux
netstat -ano | findstr "8080 4001 5433"   # Windows
```

Si otro programa usa esos puertos, detenlo o cambia el mapeo en `docker-compose.yml`.

### Relojes checadores: "La API no tiene el usuario de los relojes"

1. Pon `CHECADOR_USER` y `CHECADOR_PASS` en `.env` (paso 4) y corre `docker compose up -d`.
   Si el mensaje sigue saliendo, es que la actualización no se aplicó: el API lee
   esas credenciales (acepta también los nombres nuevos `TIME_CLOCK_USER` /
   `TIME_CLOCK_PASS`) y hay que bajar la imagen nueva.
2. En la web, **Configuración → Relojes checadores**, da de alta cada reloj con su dirección (ej. `https://192.168.1.135`) y marca si cuenta para entradas/salidas.

### El reloj no conecta: cómo saber por qué

El mensaje de la web ya distingue los dos casos (`rechazó el usuario y la
contraseña` vs `No se pudo conectar`), y este comando lo confirma desde el
contenedor del API (cambia la IP por la del reloj; está en **Configuración →
Relojes checadores**):

```bash
docker compose exec api node -e "fetch('https://192.168.1.135/ISAPI/System/deviceInfo').then(r=>console.log('HTTP', r.status)).catch(e=>console.log('ERROR', e.message))"
```

- `HTTP 401` → **la red está bien** y el reloj está pidiendo credenciales: revisa
  `CHECADOR_USER` / `CHECADOR_PASS` en `.env`.
- `HTTP 200` → la red y el reloj responden; si la web falla, revisa que la URL
  del reloj (con su `https://` o `http://`) sea la misma.
- `ERROR ... ECONNREFUSED` / `ETIMEDOUT` / `EHOSTUNREACH` → **no hay camino al
  reloj**: IP o puerto equivocados, el reloj en otra red, o el equipo apagado.
  Comprueba desde el Windows: `curl https://192.168.1.135/ISAPI/System/deviceInfo`.
- Si el reloj usa un certificado autofirmado en `https`, el sistema lo acepta;
  lo que no se puede es dejar la URL con `http://` si el equipo solo atiende `https`.

Para ver la URL con la que está dado de alta cada reloj:

```bash
docker compose exec postgres psql -U cartas -d cartas -c 'SELECT "serialNumber", url, "countsAttendance" FROM time_clocks;'
```

Los relojes, sus checadas y los vínculos con los empleados viven en la base de datos, no en las imágenes: una instalación nueva empieza sin relojes. Al dar de alta un reloj se descarga su historial en segundo plano (puede tardar si tiene muchos eventos).

### El realtime de tickets no llega en vivo

1. Verifica que `.env` tenga `ABLY_API_KEY` poblada (paso 4).
2. Aplica: `docker compose up -d` para que el API la tome.
3. Confirma que la key es **la misma** que la web trae incrustada.

### "Docker daemon is not running" / "Engine stopped"

- En WSL: `sudo service docker start` (la actualización lo intenta sola). Con Docker Desktop: ábrelo y espera a que diga "Engine running".
- Luego: `docker compose up -d`.

---

## 10. ¿La actualización toca mis datos?

**No borra ni reemplaza nada.** Lo que corre al actualizar es:

1. **Respaldo completo** de la base en `respaldos/` (paso 3 de `actualizar.sh`).
2. **`prisma migrate deploy`**: aplica los cambios de estructura. Las migraciones
   de este sistema **solo agregan** tablas, columnas e índices, o **convierten**
   una columna conservando sus valores (p. ej. el rol pasó de lista fija a
   catálogo). Ninguna borra datos del cliente.
3. **Reinicio** con la versión nueva.

Si una migración **no puede** aplicarse porque los datos actuales no cumplen una
regla nueva (por ejemplo, dos equipos con el mismo número de serie), se detiene
**antes** de reiniciar: el sistema sigue funcionando con la versión anterior y el
detalle queda en `logs/`. El respaldo está intacto; se corrige el dato y se
vuelve a correr.

**El seed NO se ejecuta al arrancar ni al actualizar.** Es el único comando que
puede reemplazar datos (carga el respaldo de `prisma/seed-data/`), así que es
manual y deliberado:

```bash
docker compose exec api npx prisma db seed     # solo instalación NUEVA (base vacía)
npm run cutover                                # corte deliberado: REEMPLAZA los datos
```

Si algún día corres el seed en una base que ya tiene datos, **no toca nada**: lo
detecta y lo dice (`Seed omitido: la BD ya tiene N usuarios`). Para cuadrar el
inventario a mano existe `npm run inventory:reconcile`, que es explícito.

> Regla: **si el sistema ya tiene datos del cliente, nunca corras el seed ni el
> cutover.** Para actualizar solo se necesitan las migraciones, que es lo que
> hace `Actualizar.cmd`.

### Cuadrar el inventario (una sola vez, opcional)

El inventario trae avisos heredados del sistema anterior (renglones de entrada
sin sus piezas ligadas). No afectan las existencias: es la trazabilidad del
kardex. Se cuadran con un comando, **explícito y de una sola vez**:

```bash
docker compose exec -e INVENTORY_RECONCILE_REMOTE=1 api node dist/prisma/reconcile-inventory.js
```

Es idempotente (correrlo otra vez no cambia nada) y solo liga piezas y ajusta
saldos cuando de verdad no cuadran. Se pide `INVENTORY_RECONCILE_REMOTE=1` a
propósito: el comando **escribe** en el inventario, así que nunca corre solo.

---

## 11. Notas

- La base de datos se guarda en el **volumen** `ptnv_pgdata`: tus datos no se pierden con `docker compose down`, solo con `docker compose down -v`.
- Al iniciar, el API ejecuta automáticamente `prisma migrate deploy` y arranca. **El seed no corre automáticamente**: se corre a mano y solo en una instalación nueva (base vacía) o en un corte deliberado.
- Cambia SIEMPRE `POSTGRES_PASSWORD` y `JWT_SECRET` en `.env` antes de ir a producción.
