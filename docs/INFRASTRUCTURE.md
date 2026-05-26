# Infraestructura SIGE Platform

Visión operativa del sistema tal como está definido en este repositorio (Docker en droplet, GitHub Actions, S3). Para despliegue paso a paso ver [DEPLOYMENT.md](./DEPLOYMENT.md).

## Arquitectura lógica

```
┌─────────────────────────────────────────────────────────────────┐
│  Usuarios (navegador)                                            │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTPS (Nginx u otro proxy en el droplet)
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  Droplet (p. ej. DigitalOcean)                                   │
│  ┌─────────────┐    ┌─────────────┐                              │
│  │  Contenedor │    │  Contenedor │                              │
│  │  app (Node)│◄──►│  MySQL 8    │                              │
│  └─────────────┘    └─────────────┘                              │
└──────────────┬───────────────────────────────┬──────────────────┘
               │                               │
               ▼                               ▼
     ┌──────────────────┐           ┌──────────────────┐
     │  OAuth (externo) │           │  Brevo (email)   │
     └──────────────────┘           └──────────────────┘
               │
               ▼
     ┌──────────────────┐
     │  AWS S3          │  ← respaldos SQL (prefix `backups/`) y
     │                  │    archivos de app (prefix `uploads/`)
     └──────────────────┘
```

- **Producción:** MySQL y la app corren en **Docker Compose** (`docker-compose.prod.yml`). La imagen `app` se **construye en GitHub Actions**, se guarda en **GHCR** (`ghcr.io/alejoss/sigeconsultores`) y el droplet la **descarga** con `scripts/deploy-prod.sh` (no compila en el servidor en el flujo habitual).
- **Desarrollo local:** `docker-compose.yml` (MySQL en el host en el puerto 3306; incluye Adminer en 8080 solo para desarrollo).

## Tabla de servicios

| Componente | Rol |
|------------|-----|
| Contenedor `app` | Express + tRPC; sirve estáticos del build Vite en producción |
| Contenedor `mysql` | MySQL 8.0.x, datos de la plataforma |
| Nginx (host) | TLS y reverse proxy hacia `127.0.0.1:3001` (mapeo en `docker-compose.prod.yml`) |
| GitHub Actions | CI (`ci.yml`), build/push de imagen y deploy por SSH en `main` |
| S3 | Respaldos automatizados y almacenamiento de archivos (mismo bucket configurable; ver [FILE_STORAGE.md](./FILE_STORAGE.md)) |
| Proveedor OAuth | Login; URLs y claves en `VITE_APP_ID`, `OAUTH_SERVER_URL`, `VITE_OAUTH_PORTAL_URL` |
| Brevo | Correo transaccional (`BREVO_API_KEY`, etc., según implementación) |

No versionar credenciales: usar `.env.production` en el servidor y secretos de GitHub para CI.

## Base de datos

- En **Docker Compose** de producción, `DATABASE_URL` se define en el YAML apuntando al servicio `mysql`.
- En **local**, `DATABASE_URL` en `.env.local` apunta a tu instancia (p. ej. `localhost:3306`).
- Esquema gestionado con **Drizzle**; sincronización habitual con `pnpm db:push` o, en contenedor, según `RUN_DB_PUSH_ON_STARTUP` en `docker/entrypoint.sh`.

## Respaldos

Resumen en [BACKUP_SYSTEM.md](./BACKUP_SYSTEM.md): cron en el droplet ejecuta `scripts/backup-cron.sh` (mysqldump → gzip → S3). Rotación y bucket: configuración AWS y políticas de ciclo de vida en la cuenta del proyecto.

## Seguridad (recordatorio)

- JWT y cookies de sesión según implementación en `server/_core`.
- **No** incluir claves AWS, JWT ni datos de producción en documentación ni en commits.
- Si una clave llegó a versionarse, rotarla en el proveedor y actualizar secretos.

## Monitoreo y salud

- Contenedores: `docker compose ps`, `docker compose logs -f app`.
- Recursos: `docker stats` en el droplet.
- Endpoints públicos: verificar la URL tras el proxy (login, `/api/trpc/...` según exponga el producto).

## Recuperación

Procedimientos orientativos en [BACKUP_SYSTEM.md](./BACKUP_SYSTEM.md) (restaurar desde S3 con `scripts/restore-db.mjs`). Tiempos RPO/RTO dependen del tamaño de la BD y del procedimiento del equipo.

## Enlaces útiles

- [Drizzle ORM](https://orm.drizzle.team)
- [Documentación del repo (índice)](./README.md)

---

Última revisión de esta página: mayo 2026 (producción única en `main`).
