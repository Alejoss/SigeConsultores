# Despliegue — SIGE Platform

Procedimiento de referencia para **DigitalOcean + Docker + GitHub Actions** (imagen en GHCR, compose en el droplet).

## Qué incluye el repo

| Artefacto | Uso |
|-----------|-----|
| `Dockerfile` | Imagen de la app (build Vite + bundle del servidor) |
| `docker-compose.prod.yml` | Producción: `mysql` + `app` (app en `127.0.0.1:3000` → host) |
| `docker-compose.staging.yml` | Staging: mismo patrón; app publicada típicamente en `127.0.0.1:3001` |
| `scripts/deploy-prod.sh` | Pull de imagen y `compose up` en el servidor de producción |
| `scripts/deploy-staging.sh` | Igual para staging |
| `.github/workflows/ci.yml` | PR/push a `main`: typecheck, tests, build |
| `.github/workflows/deploy-production.yml` | Push a `main`: build, push a GHCR, SSH y `deploy-prod.sh` |
| `.github/workflows/deploy-staging.yml` | Push a `develop` (y entorno `staging`): build, push, SSH y `deploy-staging.sh` |
| `deploy/nginx/sige.conf.example` | Ejemplo de reverse proxy + TLS hacia el puerto local de la app |

Staging manual o troubleshooting: [MANUAL_DEPLOY_STAGING.md](./MANUAL_DEPLOY_STAGING.md).

## 1) Servidor (una vez)

```bash
sudo apt update
sudo apt install -y ca-certificates curl git
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER"
```

Cerrar sesión y volver a entrar para aplicar el grupo `docker`.

## 2) Variables en el droplet

Usar [.env.production.example](../.env.production.example) como referencia y crear **`.env.production`** en `DEPLOY_PATH` (valores reales, no commitear).

Mínimo habitual: credenciales MySQL, `JWT_SECRET`, OAuth (`VITE_APP_ID`, `OAUTH_SERVER_URL`, `VITE_OAUTH_PORTAL_URL` si aplica), `FRONTEND_URL`, claves AWS si usas S3. En compose de prod, `DATABASE_URL` la arma el YAML desde el servicio `mysql`; no hace falta duplicarla en el `.env` salvo que quieras sobreescribirla.

## 3) Secretos en GitHub (Actions)

**Producción (ejemplos de nombres; deben coincidir con el workflow):**

- `DROPLET_HOST`, `DROPLET_USER`, `DROPLET_SSH_KEY`
- `DEPLOY_PATH` (ej. `/opt/sige-app`)
- `ENV_PRODUCTION`: contenido completo de `.env.production` (multilínea)
- `GHCR_USERNAME`, `GHCR_TOKEN` (lectura de paquetes GHCR)

**Staging** (workflow usa entorno `staging`):

- `DROPLET_HOST_STAGING`, `DROPLET_USER_STAGING`, `DROPLET_SSH_KEY_STAGING`
- `DEPLOY_PATH_STAGING`
- `ENV_STAGING`
- `GHCR_USERNAME_STAGING`, `GHCR_TOKEN_STAGING`

## 4) Flujo automático

- **Push a `main`:** build de imagen, tags `latest` y `<sha>`, copia de `docker-compose.prod.yml` + `scripts/deploy-prod.sh`, SSH y ejecución del script (pull + `up -d`).
- **Push a `develop`:** análogo con imagen `staging-*` y `docker-compose.staging.yml` + `deploy-staging.sh`.

## 5) Nginx y HTTPS

La app escucha solo en localhost del droplet. Nginx termina TLS y hace proxy a ese puerto. Ver `deploy/nginx/sige.conf.example` y la guía de staging para IP sin dominio.

## Checklist antes de desplegar

- `pnpm test` y `pnpm build` pasan localmente (o en CI verde).
- `pnpm check` sin errores.
- Esquema de BD revisado; si aplica, probado `pnpm db:push` contra un entorno de prueba.
- Variables y secretos en GitHub / servidor actualizados.
- Backup reciente si hay migración destructiva ([BACKUP_SYSTEM.md](./BACKUP_SYSTEM.md)).

## Migraciones de base de datos

El proyecto usa **Drizzle** con script `pnpm db:push` (drizzle-kit push). En el contenedor, el arranque puede ejecutar `db:push` según `RUN_DB_PUSH_ON_STARTUP` (ver `docker/entrypoint.sh`). Para producción estable, valorar desactivar el push en cada reinicio y aplicar cambios de esquema de forma controlada.

Generación de migraciones SQL versionadas: si el equipo adopta `drizzle-kit generate`, añadir script en `package.json` y documentar el flujo aquí.

## Rollback (orientativo)

1. **Solo código / imagen:** desplegar un tag SHA anterior de la imagen en GHCR (cambiar `APP_IMAGE` en el deploy o revertir el commit que disparó el pipeline y volver a ejecutar el workflow).
2. **Datos dañados:** restaurar desde S3 con `scripts/restore-db.mjs` (ver [BACKUP_SYSTEM.md](./BACKUP_SYSTEM.md)).

## Post-despliegue

- `docker compose -f docker-compose.prod.yml ps`
- `docker compose logs -f app --tail=200`
- Probar login y una ruta crítica de negocio tras el proxy público.

## Dependencias y auditoría

```bash
pnpm audit
```

Tras actualizar dependencias, ejecutar tests y build.

---

Última revisión: mayo 2026.
