# AXZY PTNV — Cartas Responsivas (Servers)

Repositorio para **desplegar** el sistema completo (API + Web + Base de datos) en la computadora del cliente con **Docker Desktop**.

> ⚠️ Aquí **no se compila código**: este repo baja las imágenes ya publicadas en Docker Hub (`axzydev/axzy_ptnv_api` y `axzydev/axzy_ptnv_web`) y solo las orquesta.

## Servicios

| Servicio | Imagen | Puerto |
|---|---|---|
| PostgreSQL | `postgres:16-alpine` | `5433` |
| API | `axzydev/axzy_ptnv_api:latest` | `4001` |
| Web (nginx) | `axzydev/axzy_ptnv_web:latest` | `8080` |

## Requisitos en la PC del cliente

1. Instalar **Docker Desktop** (Windows / macOS / Linux).
2. Abrir Docker Desktop una vez (debe quedar corriendo).
3. Tener acceso a internet (las imágenes se bajan de Docker Hub la primera vez).

## Instalación (paso a paso)

Abre una terminal (o **Terminal / PowerShell / CMD**) y ejecuta:

```bash
# 1. Clonar el proyecto
git clone git@github.com:maag070208/AXZY_PTNV_SERVERS.git
cd AXZY_PTNV_SERVERS

# 2. (Opcional) crear el .env con tus secretos
cp .env.example .env

# 3. Levantar TODO (baja imágenes, crea BD, corre migraciones + seed automáticamente)
docker compose up -d
```

La primera vez tarda unos minutos (descarga imágenes). Después arranca en segundos.

## Acceso

- **Web**: http://localhost:8080
- **API**: http://localhost:4001
- **BD**: localhost:5433

Credenciales por defecto del seed:

```
admin    / admin123   (ADMIN)
usuario  / user123    (USER)
```

## Actualizar a una nueva versión

Cuando quieras traer la última versión de las imágenes:

```bash
docker compose pull
docker compose up -d   # o: docker compose up -d --force-recreate
```

## Operación básica

```bash
docker compose ps                          # estado de los servicios
docker compose logs -f api                 # logs del API (migraciones/seed/errores)
docker compose restart api                 # reiniciar solo el API
docker compose down                        # detener todo (NO borra la base de datos)
docker compose down -v                     # detener y BORRAR la base de datos (⚠️ pierde datos)
```

## Notas

- La base de datos se guarda en el **volumen** `ptnv_pgdata`, así tus datos no se pierden al hacer `docker compose down`.
- Al iniciar, el API ejecuta automáticamente `prisma migrate deploy` y el **seed** (idempotente) antes de arrancar.
- Cambia `POSTGRES_PASSWORD` y `JWT_SECRET` en `.env` antes de ir a producción.
