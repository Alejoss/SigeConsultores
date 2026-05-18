# Despliegue manual en servidor (staging)

Guía para el droplet de staging (Ubuntu 22.04/24.04, usuario `deploy` con sudo, Docker instalado). **Abajo** está la configuración inicial (clone, claves, `.env`, Nginx).

En los ejemplos de SSH, `STAGING_DROPLET_IP` es un marcador: sustitúyelo por la IP pública o el hostname de tu droplet.

**Ruta del proyecto en el servidor:** usa siempre la misma carpeta donde clonaste el repo (en esta guía aparece `/opt/sige-app-staging` o `~/sige-app-staging`; sustituye por la tuya).

---

## Referencia rápida (lo más habitual)

### 1. Conectar por SSH (desde tu PC)

PowerShell o terminal **local** (no dentro del servidor):

```bash
ssh deploy@STAGING_DROPLET_IP
```

Sustituye la IP por la pública de tu droplet. La primera vez, confirma el fingerprint con `yes`.

### 2. Ir al directorio del proyecto

```bash
cd /opt/sige-app-staging
```

### 3. Desplegar (recomendado: un solo comando)

En el servidor **no edites** archivos del repo (scripts, compose, etc.). Solo `.env.staging` (está en `.gitignore`). Si editas scripts a mano, `git pull` fallará.

```bash
cd /opt/sige-app-staging
./scripts/deploy-staging-droplet.sh
```

Ese script hace, en orden:

1. `git fetch` + `git reset --hard origin/main` (descarta cambios locales accidentales en archivos versionados)
2. `./scripts/staging-db-migrate.sh` (esquema BD, sin arrancar la API)
3. `docker build` + `compose up -d`

Opciones:

```bash
SKIP_MIGRATE=1 ./scripts/deploy-staging-droplet.sh   # solo código, sin drizzle
SKIP_BUILD=1 ./scripts/deploy-staging-droplet.sh     # sin rebuild de imagen
```

**No uses `gitignore` para scripts de deploy:** deben versionarse en GitHub y bajar con el reset. El problema no es que estén en git, sino editarlos en el droplet.

### 3a. Solo sincronizar código (avanzado)

```bash
git fetch origin main
git reset --hard origin/main
```

### 3b. Backup de MySQL a S3 (antes de migraciones destructivas)

La BD corre en Docker; el script oficial hace `docker compose exec mysql mysqldump` y sube a S3. Detalle: [BACKUP_SYSTEM.md](./BACKUP_SYSTEM.md).

```bash
cd /opt/sige-app-staging
bash scripts/backup-cron.sh
```

Requisitos: `AWS_ACCESS_KEY_ID` y `AWS_SECRET_ACCESS_KEY` en `.env.staging`; contenedor `mysql` arriba (el script lo inicia si hace falta). Cron diario (opcional): `sudo bash scripts/setup-backup-cron.sh /opt/sige-app-staging`.

### 3c. (Opcional) Bajar el stack antes del build

Para liberar RAM antes de `docker build`, baja staging con **exactamente los mismos** flags que usas en el `up`:

```bash
docker compose --env-file .env.staging -f docker-compose.staging.yml down
```

**No uses** `docker compose down` a secas: el repo tiene un `docker-compose.yml` distinto (MySQL local + Adminer). Compose tomaría ese archivo por defecto y **no** apagaría los contenedores `sige-app-staging-`*, dejando `app` arriba y la red “en uso” con mensajes confusos.

Si quedó un contenedor huérfano: `docker stop sige-app-staging-app-1 && docker rm sige-app-staging-app-1` y vuelve a ejecutar el `down` de arriba.

### 4. Build y levantar contenedor

Si no usaste el script del paso 3, tras actualizar el repo la app dentro de Docker **no** se actualiza sola: hay que reconstruir imagen y recrear el contenedor `app`.

```bash
cd /opt/sige-app-staging
./scripts/staging-db-migrate.sh
docker build -t sige-staging:local .
docker compose --env-file .env.staging -f docker-compose.staging.yml up -d
```

URL de staging (ejemplo con IP): `http://STAGING_DROPLET_IP/` (sustituye por la IP o dominio real)

### 5. Ver estado y logs

```bash
docker compose --env-file .env.staging -f docker-compose.staging.yml ps
docker compose --env-file .env.staging -f docker-compose.staging.yml logs -f app
docker compose --env-file .env.staging -f docker-compose.staging.yml logs app --tail 100
```

Si ves **502 Bad Gateway** en Nginx, usa este bloque (copiar/pegar):

```bash
cd /opt/sige-app-staging

# Estado de contenedores
docker compose --env-file .env.staging -f docker-compose.staging.yml ps

# Logs de la app (principal para 502)
docker compose --env-file .env.staging -f docker-compose.staging.yml logs app --tail 200

# Logs de MySQL (por si la app no levanta por DB)
docker compose --env-file .env.staging -f docker-compose.staging.yml logs mysql --tail 120

# Logs de Nginx
sudo tail -n 120 /var/log/nginx/error.log
sudo tail -n 120 /var/log/nginx/access.log
```

La app escucha en el droplet en **127.0.0.1:3001** (detrás suele ir Nginx en 80/443).

### 6. Actualizar solo el código en disco

Preferir siempre `./scripts/deploy-staging-droplet.sh`. Si solo necesitas sincronizar el repo:

```bash
cd /opt/sige-app-staging
git fetch origin main
git reset --hard origin/main
```

Evita `git pull` en el servidor si alguna vez se editaron scripts a mano: usa `reset --hard` como arriba.

### 7. Crear o actualizar usuario administrador (platform admin)

Antes, en la base de datos debe existir el rol `platform_admin` (si falla el script: `pnpm run roles:seed` en un entorno con DB configurada).

**Con el repo en el host** (`pnpm install` hecho):

```bash
cd /opt/sige-app-staging
pnpm run admin:create -- --email admin@tu-dominio.com --password 'TuClaveSegura8+'
```

**Dentro del contenedor `app`** (Compose ya inyecta la conexión a MySQL):

```bash
cd /opt/sige-app-staging
docker compose --env-file .env.staging -f docker-compose.staging.yml exec app node scripts/create-superuser.mjs -- --email admin@tu-dominio.com --password 'TuClaveSegura8+'
```

No hay credenciales fijas en el repo: son el `--email` y `--password` que indiques.

---

## Configuración inicial (una vez)

### A) Clave SSH para GitHub (Deploy Key)

En el servidor, como `deploy`:

```bash
ssh-keygen -t ed25519 -C "staging-deploy-key" -f ~/.ssh/id_ed25519 -N ""
chmod 700 ~/.ssh
chmod 600 ~/.ssh/id_ed25519 ~/.ssh/id_ed25519.pub
cat ~/.ssh/id_ed25519.pub
```

Copia la línea que empieza por `ssh-ed25519`. En GitHub: **Repositorio → Settings → Deploy keys → Add deploy key** (solo lectura, sin write).

Probar:

```bash
ssh -T git@github.com
```

### B) Carpeta del proyecto y clonado

Con Deploy Key (SSH):

```bash
mkdir -p ~/sige-app-staging
cd ~/sige-app-staging
git clone -b develop git@github.com:Alejoss/SigeConsultores.git .
```

Si no usas `develop`, cambia la rama (ej. `infra/staging-cicd`):

```bash
git clone -b infra/staging-cicd git@github.com:Alejoss/SigeConsultores.git .
```

**Ruta bajo `/opt`** (recomendada en muchos equipos). La ruta absoluta es `/opt/sige-app-staging` (empieza por `/`). Si `mkdir` falla por permisos:

```bash
sudo mkdir -p /opt/sige-app-staging && sudo chown -R deploy:deploy /opt/sige-app-staging
cd /opt/sige-app-staging
git clone -b develop git@github.com:Alejoss/SigeConsultores.git .
```

#### Clonar con HTTPS + PAT (token en archivo)

Ruta típica del archivo con el PAT: `/opt/sige-app-staging/github-pat-staging.txt` — **solo el token**, una línea. Está en `.gitignore`; no lo subas con `git add`.

```bash
mkdir -p /opt/sige-app-staging
nano /opt/sige-app-staging/github-pat-staging.txt
chmod 600 /opt/sige-app-staging/github-pat-staging.txt

PAT="$(tr -d ' \n\r\t' < /opt/sige-app-staging/github-pat-staging.txt)"
TMP="$(mktemp -d)"
git clone -b main "https://TU_USUARIO_GITHUB:${PAT}@github.com/Alejoss/SigeConsultores.git" "$TMP/sige-app"
shopt -s dotglob
mv "$TMP/sige-app"/* /opt/sige-app-staging/
mv "$TMP/sige-app/.git" /opt/sige-app-staging/ 2>/dev/null || true
shopt -u dotglob
rm -rf "$TMP"
unset PAT
```

Lista ramas remotas (mismo PAT) si no sabes el nombre de la rama:

```bash
PAT="$(tr -d ' \n\r\t' < /opt/sige-app-staging/github-pat-staging.txt)"
git ls-remote --heads "https://TU_USUARIO_GITHUB:${PAT}@github.com/Alejoss/SigeConsultores.git"
unset PAT
```

**No hagas** `git add` de `github-pat-staging.txt`.

### C) Variables de entorno

```bash
cd /opt/sige-app-staging
cp .env.staging.example .env.staging
nano .env.staging
```

Completa al menos: `MYSQL_ROOT_PASSWORD`, `MYSQL_PASSWORD`, `JWT_SECRET`, `VITE_APP_ID`, `OAUTH_SERVER_URL`, `FRONTEND_URL` (URL pública de staging cuando exista).

Para herramientas en el host (`pnpm run admin:create`, etc.) puedes usar `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE` y, con el compose actual, `MYSQL_HOST=127.0.0.1`, `MYSQL_PORT=3307` en lugar de escribir `DATABASE_URL` a mano.

---

## Nginx sin dominio (solo IP, HTTP)

URL de prueba: `http://TU_IP_PUBLICA/` (puerto 80).

```bash
sudo apt update
sudo apt install -y nginx
sudo ufw allow 'Nginx Full'
sudo ufw allow OpenSSH
sudo ufw reload
```

Sitio (proxy a **3001**). Plantilla en el repo: `deploy/nginx/sige-staging-by-ip.conf.example`.

```bash
sudo nano /etc/nginx/sites-available/sige-staging
```

Pega el contenido del ejemplo del repo. Luego:

```bash
sudo ln -sf /etc/nginx/sites-available/sige-staging /etc/nginx/sites-enabled/sige-staging
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

En `.env.staging` (y si aplica `cp .env.staging .env`):

```env
FRONTEND_URL=http://TU_IP_PUBLICA
```

Reinicia la app:

```bash
cd /opt/sige-app-staging
docker compose --env-file .env.staging -f docker-compose.staging.yml up -d
```

**OAuth:** en el proveedor debe existir la redirect `**http://TU_IP_PUBLICA/api/oauth/callback`**.

---

## Conectar otra vez más tarde (solo SSH + carpeta)

Desde tu PC:

```bash
ssh deploy@STAGING_DROPLET_IP
cd /opt/sige-app-staging
```

---

## Resumen de secretos GitHub Actions (staging)

Solo si usas el workflow de deploy automático al hacer **push** a la rama configurada. En el entorno **staging** de GitHub pueden figurar, entre otros:

- `DROPLET_HOST_STAGING`, `DROPLET_USER_STAGING`, `DROPLET_SSH_KEY_STAGING`, `DEPLOY_PATH_STAGING`
- `ENV_STAGING` (contenido de `.env.staging`)

Si el workflow descarga imagen desde GHCR, también `GHCR_USERNAME_STAGING` y `GHCR_TOKEN_STAGING`. Si despliegas solo con **build en el droplet** (paso 4), esos dos no hacen falta en tu flujo manual.