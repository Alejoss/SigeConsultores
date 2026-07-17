# Despliegue — SIGE Platform

Procedimiento para **DigitalOcean + Docker + GHCR + GitHub Actions**.

En la mayoría de los casos la imagen de la app **ya está construida en GitHub Container Registry (GHCR)**. El droplet solo hace **`docker pull`** y **`compose up`**; no hace falta `docker build` en el servidor salvo emergencia.

## Flujo habitual

```
Cliente / Manus push → infra/staging-cicd   (sin CI, sin deploy)
                        ↓
              Manus abre PR → main
                        ↓
              Manus mergea el PR  (0 aprobaciones; no espera al equipo)
                        ↓
              CI en main (única compuerta)
                        ↓  solo si CI = success
         Deploy Production (workflow reutilizable)
              ├─ build-image → ghcr.io/alejoss/sigeconsultores:<sha>
              └─ deploy-droplet → SSH + deploy-prod.sh (si hay secretos)
```

| Rama | Quién | Qué pasa |
|------|--------|----------|
| **`infra/staging-cicd`** | Cliente / Manus / integración | Push libre; **no** corre CI ni CD |
| **`main`** | Producción | Manus mergea PR → **único CI** → solo entonces CD (GHCR + droplet) |

### Qué rama dispara CI y CD

- **Pushear a `infra/staging-cicd` no dispara CI ni CD.** Es solo la rama de integración.
- **Hay un solo CI:** el que corre al llegar el cambio a `main` (merge del PR `infra/staging-cicd` → `main`).
- **El CD solo corre si ese CI pasa** (`check-and-build`, `test-unit`, `test-integration`). Si CI falla, producción no se actualiza.
- **No se debe pushear directo a `main`.** El ruleset **MainProtection** exige PR. **Manus abre y mergea** ese PR (0 aprobaciones); no deja el merge pendiente del equipo. Detalle: [GITHUB_SETUP.md](./GITHUB_SETUP.md).

Entonces sí: publicar es **que Manus mergee `infra/staging-cicd` hacia `main` vía PR**. Ese merge dispara el único CI; las pruebas son la compuerta del deploy.

**Regla crítica:** CI y CD **no** corren en paralelo. En `ci.yml`, el job `deploy-production` tiene `needs: [check-and-build, test-unit, test-integration]`; GitHub solo llama al workflow reutilizable de CD cuando los tres jobs pasan. Si fallan typecheck, build o tests, **no hay deploy**.

Detalle de Actions y secretos: [GITHUB_SETUP.md](./GITHUB_SETUP.md).

---

## Droplet de producción

| Dato | Valor |
|------|--------|
| IP pública | `167.172.127.47` |
| Ruta del proyecto | `/opt/sige-app-staging` |
| Usuario SSH | `deploy` o `root` |
| App (Docker) | `127.0.0.1:3001` → Nginx en 80/443 |
| Imagen en servidor | Desde **GHCR**, no build local |

Conexión: `ssh deploy@167.172.127.47`

**Volumen MySQL:** el compose usa `mysql_staging_data` (datos históricos en `sige-app-staging_mysql_staging_data`). **No** uses el volumen `mysql_data` (se creó vacío al migrar compose). Comprobar: `docker volume ls | grep mysql`.

---

## Imagen en GHCR

Tras un merge a `main` con **Deploy Production** en verde:

- **Packages** en GitHub (perfil u organización) → paquete `sigeconsultores` (minúsculas)
- Tags típicos: `latest` y el **SHA del commit** (ej. `ghcr.io/alejoss/sigeconsultores:39db234...`)

GHCR exige nombres en **minúsculas**. El workflow ya genera:

```text
ghcr.io/alejoss/sigeconsultores:latest
ghcr.io/alejoss/sigeconsultores:<sha>
```

### Comprobar que la imagen existe

1. **Actions → Deploy Production** → job **build-image** en verde  
2. **GitHub → Packages → sigeconsultores** → ver tags  
3. En el droplet (con token de lectura):

```bash
docker login ghcr.io -u TU_USUARIO
docker pull ghcr.io/alejoss/sigeconsultores:latest
```

---

## Deploy automático (recomendado)

**Trigger:** merge/push a `main` → `ci.yml` (única ejecución de CI) → si pasan todos los jobs, `deploy-production` llama a `.github/workflows/deploy-production.yml`. Este último solo admite `workflow_call`; no existe *Run workflow* para saltarse las pruebas.

| Paso | Dónde | Qué hace |
|------|--------|----------|
| 0 | GitHub Actions (CI) | `pnpm check` + `pnpm build` + tests unitarios e integración — **debe pasar** |
| 1 | GitHub Actions (CI) | `needs` impide invocar el CD si algún job previo no fue `success` |
| 2 | GitHub Actions | `docker build` + push a GHCR del mismo SHA que pasó CI |
| 3 | SSH al droplet | `git reset --hard` al commit + escribe `.env.production` + `deploy-prod.sh` |
| 4 | Droplet | `deploy-prod.sh`: login GHCR, `pull`, `up -d` |

**Secretos** en GitHub (Settings → Secrets → Actions):

| Secreto | Uso |
|---------|-----|
| `DROPLET_HOST` | IP (`167.172.127.47`) |
| `DROPLET_USER` | `deploy` o `root` |
| `DROPLET_SSH_KEY` | Clave privada SSH |
| `DEPLOY_PATH` | `/opt/sige-app-staging` |
| `ENV_PRODUCTION` | Contenido completo de `.env.production` |
| `GHCR_USERNAME` | Usuario GitHub |
| `GHCR_TOKEN` | PAT con `read:packages` |

Sin secretos: el workflow **sigue en verde**, sube la imagen a GHCR y muestra el job *Deploy skipped (configure secrets)*. No actualiza el droplet hasta que configures secretos y hagas **Re-run** del workflow.

Permisos del paquete: **Packages → sigeconsultores → Package settings → Manage Actions access** → acceso al repo.

---

## Deploy manual con imagen GHCR (sin build en el servidor)

Usa `scripts/deploy-prod.sh` cuando quieras desplegar a mano la imagen que ya está en GHCR (o un tag concreto).

```bash
ssh deploy@167.172.127.47
cd /opt/sige-app-staging

# Opcional: actualizar solo compose y script (no hace falta git pull del código de la app)
git fetch origin main
git reset --hard origin/main

chmod +x scripts/deploy-prod.sh
./scripts/deploy-prod.sh
```

En `.env.production` (solo en el servidor, nunca en git) añade también:

```env
APP_IMAGE=ghcr.io/alejoss/sigeconsultores:latest
GHCR_USERNAME=Alejoss
GHCR_TOKEN=<PAT_con_read_packages>
```

`deploy-prod.sh` lee esas tres claves desde `.env.production`; no hace falta `export` en cada deploy.

Qué hace `deploy-prod.sh`:

1. `docker login ghcr.io`
2. `docker compose pull app`
3. `docker compose up -d mysql` y `app`

**No** ejecuta `git pull` del código fuente de la app ni `docker build`. La app corre **dentro de la imagen** descargada.

### Variables en el servidor

- **`.env.production`** — MySQL, JWT, OAuth, AWS, `FRONTEND_URL`, **`APP_IMAGE`**, **`GHCR_USERNAME`**, **`GHCR_TOKEN`** (plantilla: `.env.production.example`)

#### ¿Cambia `APP_IMAGE` en cada build?

| Tag | ¿Cambias `.env.production`? | Comportamiento |
|-----|------------------------------|----------------|
| `:latest` | No | Cada merge a `main` sobrescribe `latest` en GHCR. En el droplet, `pull` trae la imagen nueva aunque el nombre sea el mismo. |
| `:<sha>` | Sí, cuando quieras esa versión | Un tag por commit; útil para rollback o desplegar un commit concreto. |

Recomendación habitual: deja `APP_IMAGE=ghcr.io/alejoss/sigeconsultores:latest` y, tras cada build en GitHub, ejecuta solo `./scripts/deploy-prod.sh`.

Si ejecutas `docker compose` a mano sin `APP_IMAGE` en el env file:

```text
service "app" has neither an image nor a build context specified
```

Siempre usa `--env-file .env.production`.

### Estado y logs

```bash
cd /opt/sige-app-staging
docker compose --env-file .env.production -f docker-compose.prod.yml ps
docker compose --env-file .env.production -f docker-compose.prod.yml logs app --tail 80
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3001/
```

---

## Fallback: build en el droplet (solo emergencia)

Úsalo solo si GHCR no está disponible o el droplet no puede hacer pull (sin red, sin token, prueba local).

Requiere **mucha RAM**; en droplets pequeños baja el stack antes del build:

```bash
cd /opt/sige-app-staging
export APP_IMAGE=sige-prod:local
docker compose --env-file .env.production -f docker-compose.prod.yml down

git fetch origin main
git reset --hard origin/main
docker build -t sige-prod:local .

docker compose --env-file .env.production -f docker-compose.prod.yml up -d
```

Alternativa automatizada (mismo enfoque): `scripts/deploy-droplet-local.sh` con `DOWN_FIRST=1` si hace falta.

---

## Qué incluye el repo

| Artefacto | Uso |
|-----------|-----|
| `Dockerfile` | Definición de la imagen (build en GitHub Actions) |
| `docker-compose.prod.yml` | MySQL + app; app en `127.0.0.1:3001` |
| `scripts/deploy-prod.sh` | **Deploy habitual:** pull GHCR + `compose up` |
| `scripts/deploy-droplet-local.sh` | Fallback: `git` + `docker build` en servidor |
| `.github/workflows/deploy-production.yml` | Workflow reutilizable (`workflow_call`): build GHCR + deploy |
| `.github/workflows/ci.yml` | Único CI: push a `main` (+ CD si pasa) |
| `deploy/nginx/sige.conf.example` | Proxy Nginx → `127.0.0.1:3001` |

---

## Configuración inicial (una vez en el droplet)

### Docker

```bash
sudo apt update
sudo apt install -y ca-certificates curl git
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER"
```

### Repo en el servidor

Necesario para `docker-compose.prod.yml`, scripts, backups y herramientas — **no** para compilar la app en cada deploy si usas GHCR.

```bash
sudo mkdir -p /opt/sige-app-staging
sudo chown -R deploy:deploy /opt/sige-app-staging
cd /opt/sige-app-staging
git clone -b main git@github.com:Alejoss/SigeConsultores.git .
```

### Variables

```bash
cp .env.production.example .env.production
nano .env.production
```

Mínimo: MySQL, `JWT_SECRET`, OAuth, `FRONTEND_URL`, AWS si aplica. `DATABASE_URL` la arma el compose hacia el servicio `mysql`.

### Nginx

Plantilla: `deploy/nginx/sige.conf.example` → proxy a `http://127.0.0.1:3001`.  
`FRONTEND_URL` en `.env.production` debe coincidir con la URL pública.

---

## Operaciones habituales

### Backup antes de migraciones

```bash
cd /opt/sige-app-staging
bash scripts/backup-cron.sh
```

Ver [BACKUP_SYSTEM.md](./BACKUP_SYSTEM.md).

### Crear admin de plataforma

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml exec app \
  node scripts/create-superuser.mjs -- --email admin@tu-dominio.com --password 'TuClaveSegura8+'
```

### Rollback de imagen

Desplegar un tag anterior:

```bash
export APP_IMAGE=ghcr.io/alejoss/sigeconsultores:<sha-anterior>
./scripts/deploy-prod.sh
```

Datos: restaurar desde S3 con `scripts/restore-db.mjs` ([BACKUP_SYSTEM.md](./BACKUP_SYSTEM.md)).

---

## Checklist antes de producción

- CI verde en el PR hacia `main`
- Secretos de GitHub configurados (deploy automático)
- `.env.production` en el servidor al día
- Volumen MySQL correcto (`mysql_staging_data`)
- Backup reciente si hay migración destructiva de esquema

## Migraciones de BD

Con `RUN_DB_PUSH_ON_STARTUP: "true"` (por defecto en compose), el contenedor `app` ejecuta `drizzle-kit push` al arrancar (`docker/entrypoint.sh`). Para producción estable, valorar `false` y aplicar esquema de forma controlada.

## Problemas frecuentes

| Síntoma | Causa | Solución |
|---------|--------|----------|
| `APP_IMAGE` not set | Falta export o línea en `.env` | `export APP_IMAGE=ghcr.io/alejoss/sigeconsultores:latest` |
| `repository name must be lowercase` | Tag GHCR con mayúsculas | Usar `alejoss/sigeconsultores` (workflow ya corregido) |
| BD vacía tras deploy | Volumen `mysql_data` en lugar de `mysql_staging_data` | Ver `docker-compose.prod.yml` y `docker volume ls` |
| 502 en Nginx | App no en 3001 o contenedor caído | `logs app`, `curl http://127.0.0.1:3001/` |
| Deploy skipped en Actions | Faltan secretos | Configurar secretos y Re-run workflow |
| `is not a git clone` / fallo en `git fetch` | `DEPLOY_PATH` incorrecto o PAT sin scope `repo` | Verificar secreto = `/opt/sige-app-staging`; PAT classic con `repo` + `read:packages` |
| `unauthorized` en pull | PAT sin `read:packages` o paquete privado | `GHCR_TOKEN` y permisos del paquete |

---

Última revisión: mayo 2026 (flujo principal: GHCR + `deploy-prod.sh`).
