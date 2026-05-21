# Despliegue — SIGE Platform

Procedimiento para **DigitalOcean + Docker**. La guía prioriza el **deploy manual en el servidor** (comandos en orden). También describe el flujo automático con GitHub Actions.

**Ruta del proyecto en el servidor:** `/opt/sige-app-staging`  
**Rama desplegada:** `main`

### Droplet (DigitalOcean)

| Dato | Valor |
|------|--------|
| IP pública | `167.172.127.47` |
| Hostname (panel DO) | `sige-ubuntu-droplet` |
| Usuario SSH habitual | `deploy` (con sudo) |
| Usuario si entras como admin | `root` |

Conexión: `ssh deploy@167.172.127.47` (o `ssh root@167.172.127.47`).

En este droplet **no existe** `/opt/sige-app`; el clone y los datos viven en `/opt/sige-app-staging` (nombre histórico de staging).

**Variables:** el compose de producción lee **`.env.production`**. Si en el servidor solo tienes `.env.staging`, créalo antes del deploy:

```bash
cd /opt/sige-app-staging
cp .env.staging .env.production   # solo la primera vez; luego edita .env.production
```

**Imagen Docker (`APP_IMAGE`):** el servicio `app` en `docker-compose.prod.yml` usa `image: ${APP_IMAGE}`. Esa variable **no** viene en `.env.staging` / `.env.production` por defecto: debes exportarla en la shell **antes de cualquier** comando `docker compose` (`down`, `up`, `ps`, `logs`), o añadirla a `.env.production` (ver abajo). Si falta, verás:

```text
WARN[0000] The "APP_IMAGE" variable is not set. Defaulting to a blank string.
service "app" has neither an image nor a build context specified: invalid compose project
```

Deploy local en el droplet (build en servidor):

```bash
export APP_IMAGE=sige-prod:local
```

Opcional (evita olvidar el `export` en cada sesión SSH), en `.env.production`:

```bash
echo 'APP_IMAGE=sige-prod:local' >> .env.production
```

Con GHCR, usa el tag del commit o `latest` (sección más abajo).

**Puerto en el droplet:** Nginx en el servidor hace proxy a **`127.0.0.1:3001`** (config histórica de staging). `docker-compose.prod.yml` mapea **`127.0.0.1:3001:3000`** (host 3001 → contenedor 3000). **No cambies Nginx en el servidor** salvo que edites el compose en el repo y quieras otro puerto.

**Volumen MySQL:** en el droplet los datos históricos están en `sige-app-staging_mysql_staging_data` (~480 MB). El compose de producción debe usar el volumen `mysql_staging_data`, **no** `mysql_data` (ese se creó vacío al primer `up` con `docker-compose.prod.yml`). Comprobar: `docker volume ls | grep mysql`.

---

## Deploy ahora (sin GHCR — build en el servidor)

Construye la imagen en el droplet y usa la **secuencia manual** de la sección siguiente.

En **`origin/main` hoy no está** `scripts/deploy-droplet-local.sh` (solo existe como archivo local sin commitear en algunos clones). Si en el servidor ves `cannot open scripts/deploy-droplet-local.sh`, es normal: **no uses ese script** hasta que esté en `main`; copia los comandos de «Comando de deploy en el servidor».

---

## Comando de deploy en el servidor (secuencia manual)

**Esta es la forma que funciona hoy** en `/opt/sige-app-staging` con lo que hay en `main`.

### Droplets con poca RAM (recomendado antes del build)

`docker build` consume mucha memoria. Baja el stack, despliega y al final el `up -d` lo vuelve a levantar:

```bash
ssh deploy@167.172.127.47
cd /opt/sige-app-staging

export APP_IMAGE=sige-prod:local
docker compose --env-file .env.production -f docker-compose.prod.yml down

git fetch origin main
git reset --hard origin/main

docker build -t sige-prod:local .

docker compose --env-file .env.production -f docker-compose.prod.yml up -d mysql
docker compose --env-file .env.production -f docker-compose.prod.yml up -d app

docker image prune -f
```

No uses `docker compose down` sin `-f docker-compose.prod.yml`: el `docker-compose.yml` por defecto del repo es otro stack (desarrollo local).

### Deploy sin bajar el stack (más rápido, más RAM)

```bash
ssh deploy@167.172.127.47
cd /opt/sige-app-staging

git fetch origin main
git reset --hard origin/main

docker build -t sige-prod:local .

export APP_IMAGE=sige-prod:local
docker compose --env-file .env.production -f docker-compose.prod.yml up -d
```

**No edites** archivos del repo en el servidor (scripts, compose, etc.). Solo **`.env.production`** (está en `.gitignore`).

### Ver estado y logs tras el deploy

```bash
cd /opt/sige-app-staging
docker compose --env-file .env.production -f docker-compose.prod.yml ps
docker compose --env-file .env.production -f docker-compose.prod.yml logs app --tail 80
docker compose --env-file .env.production -f docker-compose.prod.yml logs mysql --tail 50
```

En el droplet, la app queda en **`127.0.0.1:3001`** (mapeo del compose). Nginx ya apunta ahí. Comprobar: `curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3001/`. Ver `deploy/nginx/sige.conf.example`.

Si ves **502 Bad Gateway**:

```bash
cd /opt/sige-app-staging
docker compose --env-file .env.production -f docker-compose.prod.yml ps
docker compose --env-file .env.production -f docker-compose.prod.yml logs app --tail 200
sudo tail -n 120 /var/log/nginx/error.log
```

---

## Referencia rápida (paso a paso)

| Paso | Qué hacer |
|------|-----------|
| 1 | SSH al droplet: `ssh deploy@167.172.127.47` (o `ssh root@167.172.127.47`) |
| 2 | `cd /opt/sige-app-staging` |
| 3 | Sincronizar código: `git fetch origin main` y `git reset --hard origin/main` |
| 4 | Build imagen: `docker build -t sige-prod:local .` |
| 5 | `export APP_IMAGE=sige-prod:local` (obligatorio también para `down` / `ps` / `logs`) |
| 6 | Levantar: `docker compose --env-file .env.production -f docker-compose.prod.yml up -d` |
| 7 | Revisar `ps` y `logs app` |

### Solo actualizar código en disco (sin rebuild)

```bash
cd /opt/sige-app-staging
git fetch origin main
git reset --hard origin/main
```

Evita `git pull` si alguna vez se editaron scripts a mano en el servidor; usa `reset --hard`.

### Backup antes de migraciones arriesgadas

```bash
cd /opt/sige-app-staging
bash scripts/backup-cron.sh
```

Requisitos: `AWS_ACCESS_KEY_ID` y `AWS_SECRET_ACCESS_KEY` en `.env.production`; MySQL en marcha. Detalle: [BACKUP_SYSTEM.md](./BACKUP_SYSTEM.md).

### Crear usuario administrador de plataforma

Con el contenedor `app` ya arriba (el compose inyecta la conexión a MySQL):

```bash
cd /opt/sige-app-staging
docker compose --env-file .env.production -f docker-compose.prod.yml exec app node scripts/create-superuser.mjs -- --email admin@tu-dominio.com --password 'TuClaveSegura8+'
```

Antes, el rol `platform_admin` debe existir en la BD (en local: `pnpm run roles:seed`).

---

## Deploy con imagen GHCR (sin build en el servidor)

Si la imagen ya se construyó en GitHub Actions y solo quieres **pull** en el droplet:

```bash
cd /opt/sige-app-staging

export APP_IMAGE=ghcr.io/Alejoss/SigeConsultores:latest
export GHCR_USERNAME=tu_usuario_github
export GHCR_TOKEN=tu_token_lectura_ghcr

chmod +x scripts/deploy-prod.sh
./scripts/deploy-prod.sh
```

O manualmente:

```bash
cd /opt/sige-app-staging
echo "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_USERNAME" --password-stdin
export APP_IMAGE=ghcr.io/Alejoss/SigeConsultores:SHA_DEL_COMMIT
docker compose --env-file .env.production -f docker-compose.prod.yml pull app
docker compose --env-file .env.production -f docker-compose.prod.yml up -d
```

Sustituye `SHA_DEL_COMMIT` por el hash del commit desplegado (el workflow etiqueta cada build con el SHA).

---

## Deploy automático (GitHub Actions)

Configuración de secretos, emails de fallo y comportamiento actual: **[GITHUB_SETUP.md](./GITHUB_SETUP.md)**.

**Push a `main`** dispara `.github/workflows/deploy-production.yml`:

1. Build de imagen Docker y push a GHCR (`latest` + `<sha>`)
2. SSH al droplet: copia `docker-compose.prod.yml` y `scripts/deploy-prod.sh`
3. Escribe `.env.production` desde el secreto `ENV_PRODUCTION`
4. Ejecuta `deploy-prod.sh` (login GHCR, `pull`, `up -d`)

Secretos necesarios en GitHub:

| Secreto | Uso |
|---------|-----|
| `DROPLET_HOST` | IP del servidor (`167.172.127.47`) |
| `DROPLET_USER` | Usuario SSH (ej. `deploy`) |
| `DROPLET_SSH_KEY` | Clave privada SSH |
| `DEPLOY_PATH` | Ruta en servidor (ej. `/opt/sige-app-staging`) |
| `ENV_PRODUCTION` | Contenido completo de `.env.production` |
| `GHCR_USERNAME` | Usuario con lectura de paquetes |
| `GHCR_TOKEN` | Token PAT con `read:packages` |

---

## Configuración inicial (una vez)

### Servidor

```bash
sudo apt update
sudo apt install -y ca-certificates curl git
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER"
```

Cerrar sesión y volver a entrar para aplicar el grupo `docker`.

### Clonar el repo en el servidor

```bash
sudo mkdir -p /opt/sige-app-staging
sudo chown -R deploy:deploy /opt/sige-app-staging
cd /opt/sige-app-staging
git clone -b main git@github.com:Alejoss/SigeConsultores.git .
```

(Deploy key en GitHub: **Settings → Deploy keys**, solo lectura.)

### Variables de entorno

```bash
cd /opt/sige-app-staging
cp .env.production.example .env.production
nano .env.production
```

Mínimo: `MYSQL_ROOT_PASSWORD`, `MYSQL_PASSWORD`, `JWT_SECRET`, OAuth (`VITE_APP_ID`, `OAUTH_SERVER_URL`, `VITE_OAUTH_PORTAL_URL`), `FRONTEND_URL` (URL pública), AWS si usas S3.  
`DATABASE_URL` la arma el compose desde el servicio `mysql`; no hace falta duplicarla salvo override.

### Nginx y HTTPS

Plantilla: `deploy/nginx/sige.conf.example` (proxy a `http://127.0.0.1:3001` en el droplet).  
En `.env.production`, `FRONTEND_URL` debe coincidir con la URL pública (ej. `https://tu-dominio.com`).

---

## Qué incluye el repo

| Artefacto | Uso |
|-----------|-----|
| `Dockerfile` | Imagen de la app (build Vite + servidor Node) |
| `docker-compose.prod.yml` | Producción: `mysql` + `app` publicada en `127.0.0.1:3001` |
| `scripts/deploy-droplet-local.sh` | *(opcional, aún no en `main`)* Automatiza sync + build + `compose up` local |
| `scripts/deploy-prod.sh` | Pull de imagen GHCR y `compose up` |
| `.github/workflows/deploy-production.yml` | Deploy automático en push a `main` |
| `scripts/backup-cron.sh` | Backup MySQL → S3 |

## Ramas

| Rama | Uso |
|------|-----|
| `main` | Integración, CI y despliegue |
| `feature/*` | Cambios vía PR hacia `main` |

No hay entorno staging ni rama `develop` en el repositorio actual.

---

## Checklist antes de desplegar

- `pnpm test` y `pnpm build` pasan (o CI en verde en `main`)
- `pnpm check` sin errores
- Esquema de BD revisado; migraciones probadas en local si aplica
- `.env.production` y secretos de GitHub actualizados
- Backup reciente si hay cambio destructivo de esquema

## Migraciones de base de datos

Con `RUN_DB_PUSH_ON_STARTUP: "true"` (por defecto en `docker-compose.prod.yml`), al arrancar el contenedor `app` se ejecuta `drizzle-kit push` vía `docker/entrypoint.sh`.

Para producción estable, puedes poner `RUN_DB_PUSH_ON_STARTUP=false` en el compose o en `.env.production` y aplicar esquema de forma controlada.

## Problemas frecuentes

### `APP_IMAGE` variable is not set` / `invalid compose project`

Causa: se ejecutó `docker compose -f docker-compose.prod.yml` sin definir `APP_IMAGE`. El compose **no** tiene `build:` en el servicio `app`, solo `image: ${APP_IMAGE}`.

Solución inmediata (deploy con build local en el droplet):

```bash
cd /opt/sige-app-staging
export APP_IMAGE=sige-prod:local
docker compose --env-file .env.production -f docker-compose.prod.yml ps
```

Si aún no existe la imagen, haz build o usa el script:

```bash
export APP_IMAGE=sige-prod:local
docker build -t sige-prod:local .
# Secuencia manual completa en la sección «Comando de deploy en el servidor»
```

### Falta `.env.production`

```bash
cp .env.staging .env.production
# editar valores de producción si hace falta
```

Eso solo arregla las variables de la app/MySQL; **no** sustituye `export APP_IMAGE=...`.

## Rollback

1. **Imagen:** desplegar un tag SHA anterior en GHCR (`APP_IMAGE=ghcr.io/.../SigeConsultores:<sha-anterior>`) o revertir en `main` y volver a ejecutar el workflow / rebuild.
2. **Datos:** restaurar desde S3 con `scripts/restore-db.mjs` ([BACKUP_SYSTEM.md](./BACKUP_SYSTEM.md)).

---

Última revisión: mayo 2026.
