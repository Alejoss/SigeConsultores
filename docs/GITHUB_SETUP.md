# GitHub Actions — SIGE Platform

Configuración de CI/CD: integración en `infra/staging-cicd`, producción en `main`, imagen en **GHCR**.

## Workflows

| Workflow | Cuándo corre | Qué hace |
|----------|----------------|----------|
| **CI** | Push/PR a `infra/staging-cicd` o `main` | `pnpm check` + `pnpm build` + tests (unit, client, integración con MySQL) |
| **Deploy Production** | Push a `main` (y manual *Run workflow*) | Build imagen → **GHCR**; deploy al droplet si hay secretos |

La imagen se publica en:

```text
ghcr.io/alejoss/sigeconsultores:latest
ghcr.io/alejoss/sigeconsultores:<commit-sha>
```

Los nombres van en **minúsculas** (requisito de GHCR).

## Flujo del equipo

1. Cliente pushea a **`infra/staging-cicd`** → CI corre (no bloquea el push).
2. PR **`infra/staging-cicd` → `main`** → revisión y merge (ruleset en `main`).
3. Merge a **`main`** → **Deploy Production**:
   - **build-image** — siempre (si el workflow pasa)
   - **Deploy to droplet** — solo con secretos configurados

Sin secretos: el workflow termina en verde con *Deploy skipped*; la imagen **sí** queda en GHCR.

## Secretos y variables para deploy al droplet

### Variables (visibles, editables — no sensibles)

**Settings → Secrets and variables → Actions → Variables → New repository variable**

| Variable | Valor |
|----------|--------|
| `DROPLET_HOST` | `167.172.127.47` |
| `DROPLET_USER` | `root` |
| `DEPLOY_PATH` | `/opt/sige-app-staging` |
| `GHCR_USERNAME` | `Alejoss` |

Las **variables** se pueden ver y editar después de crearlas (a diferencia de los secretos). Úsalas para paths, IPs y usuarios.

### Secretos (no visibles después de guardar)

**Settings → Secrets and variables → Actions → Secrets → New repository secret**

| Secreto | Valor |
|---------|--------|
| `DROPLET_SSH_KEY` | Clave privada SSH (archivo completo, con `BEGIN`/`END`) |
| `ENV_PRODUCTION` | Contenido completo de `.env.production` del servidor |
| `GHCR_TOKEN` | PAT classic con `read:packages` y **`repo`** (pull GHCR + `git fetch` en repo privado) |

Si ya tenías `DROPLET_HOST`, `DROPLET_USER`, `DEPLOY_PATH` o `GHCR_USERNAME` como secretos, créalos como **variables** y borra los secretos duplicados cuando migres. El workflow acepta variable o secreto (prioriza variable).

La clave pública SSH debe estar en `~/.ssh/authorized_keys` del usuario en el droplet.

`ENV_PRODUCTION` no debe incluir `APP_IMAGE`: el workflow la pasa como `ghcr.io/alejoss/sigeconsultores:<sha>` al ejecutar `deploy-prod.sh`.

### Permisos GHCR

**Packages → sigeconsultores → Package settings → Manage Actions access** → conceder acceso al repositorio `SigeConsultores`.

### Permisos del workflow

**Settings → Actions → General → Workflow permissions** → **Read and write permissions** (para push a GHCR con `GITHUB_TOKEN`).

## Qué hace el deploy en el droplet

El job SSH **no** hace `docker build`. Solo:

1. `git fetch` + `git reset --hard` al commit desplegado (usa `GHCR_USERNAME` + `GHCR_TOKEN` con scope `repo` para repos privados)
2. Escribe `.env.production` desde `ENV_PRODUCTION`
3. Ejecuta `deploy-prod.sh` con `APP_IMAGE=ghcr.io/alejoss/sigeconsultores:<sha>` (el script prioriza esa variable sobre la del archivo)

Detalle: [DEPLOYMENT.md](./DEPLOYMENT.md).

## Deploy manual con la misma imagen

En el droplet, sin esperar Actions:

```bash
export APP_IMAGE=ghcr.io/alejoss/sigeconsultores:latest
export GHCR_USERNAME=Alejoss
export GHCR_TOKEN=<PAT>
./scripts/deploy-prod.sh
```

## Protección de ramas

| Rama | Reglas típicas |
|------|----------------|
| `infra/staging-cicd` | Sin bloqueo de push; CI informativo |
| `main` | PR + CI; **Repository admin** en bypass para push directo del owner |

## CI: tests

| Job | Qué corre |
|-----|-----------|
| `check-and-build` | Typecheck + build |
| `test-unit` | `pnpm test:unit` + `pnpm test:client` (sin MySQL) |
| `test-integration` | MySQL 8 en el runner → `pnpm db:push` → `pnpm test:integration` |

Guía completa: [TESTING.md](./TESTING.md).

## Dejar de recibir emails de Actions

**GitHub → Settings → Notifications → Actions** → ajustar notificaciones de fallos.

---

Última revisión: julio 2026.
