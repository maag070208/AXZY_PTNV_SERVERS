# AXZY PTNV — Cartas Responsivas (Servers)

Repositorio para **desplegar** el sistema completo (API + Web + Base de datos) en la computadora del cliente con **Docker Desktop**.

> ⚠️ Aquí **no se compila código**: este repo baja las imágenes ya publicadas en Docker Hub (`axzydev/axzy_ptnv_api` y `axzydev/axzy_ptnv_web`) y solo las orquesta.

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

Edítalo (macOS: `nano .env` o `open -e .env`; Windows: `notepad .env`) y completa los valores.

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

La primera vez baja las imágenes, crea la base de datos y corre las **migraciones + seed automáticamente**. Espera unos segundos y verifica:

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

## 7. Actualizar a la última versión (siempre que haya actualizaciones)

Este repo trae **dos cosas** que se actualizan por separado:

1. **La configuración/scripts** (`docker-compose.yml`, `.env.example`, `README.md`) → con `git`.
2. **Las imágenes** del API y la Web (compiladas en CI y publicadas en Docker Hub) → con `docker compose`.

### Comandos para actualizar TODO

```bash
cd AXZY_PTNV_SERVERS

# 1. Trae los últimos cambios de este repositorio (config/scripts)
git pull

# 2. Baja las últimas imágenes publicadas (API + Web)
docker compose pull

# 3. Recrea los contenedores con las versiones nuevas
docker compose up -d

# 4. Verifica que todo quedó arriba
docker compose ps
```

Si algo no cambió (por ejemplo, el contenedor web sigue con la imagen vieja), fuerza la recreación:

```bash
docker compose up -d --force-recreate
```

> ⚠️ `git pull` **no toca tu `.env`**. Si el `.env.example` trae variables nuevas, cópialas a tu `.env` con sus valores (ver la tabla del paso 4) y corre `docker compose up -d` para que el API las tome.

---

## 8. Operación básica (para el día a día)

```bash
docker compose ps                          # estado de los servicios
docker compose logs -f api                 # logs del API en vivo (Ctrl+C para salir)
docker compose logs api                    # últimas líneas de log del API
docker compose logs -f web                 # logs de la web (nginx)
docker compose restart api                 # reiniciar solo el API (aplica migraciones/seed de nuevo)
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
2. En la web, **Configuración → Relojes checadores**, da de alta cada reloj con su dirección (ej. `https://192.168.1.135`) y marca si cuenta para entradas/salidas.

Los relojes, sus checadas y los vínculos con los empleados viven en la base de datos, no en las imágenes: una instalación nueva empieza sin relojes. Al dar de alta un reloj se descarga su historial en segundo plano (puede tardar si tiene muchos eventos).

### El realtime de tickets no llega en vivo

1. Verifica que `.env` tenga `ABLY_API_KEY` poblada (paso 4).
2. Aplica: `docker compose up -d` para que el API la tome.
3. Confirma que la key es **la misma** que la web trae incrustada.

### "Docker daemon is not running" / "Engine stopped"

- Abre **Docker Desktop** y espera a que diga "Engine running".
- Luego: `docker compose up -d`.

---

## 10. Notas

- La base de datos se guarda en el **volumen** `ptnv_pgdata`: tus datos no se pierden con `docker compose down`, solo con `docker compose down -v`.
- Al iniciar, el API ejecuta automáticamente `prisma migrate deploy` y el **seed** (idempotente) antes de arrancar.
- Cambia SIEMPRE `POSTGRES_PASSWORD` y `JWT_SECRET` en `.env` antes de ir a producción.
