# GitHub Actions — SIGE Platform

Configuración de CI/CD: integración en `infra/staging-cicd`, producción en `main`, imagen en **GHCR**.

## Workflows

| Workflow | Cuándo corre | Qué hace |
|----------|----------------|----------|
| **CI** | Solo push a `main` (tras merge desde staging) | `pnpm check` + `pnpm build` + tests (unit, client, integración con MySQL) |
| **Deploy Production** | Job de `ci.yml` después de `check-and-build`, `test-unit` y `test-integration` | Llama al workflow reutilizable → build imagen → **GHCR**; deploy al droplet si hay secretos |

**Importante:** no hay CI en `infra/staging-cicd`. La única compuerta es el CI de `main`; el CD **no** corre en paralelo con las pruebas. El job `deploy-production` usa `needs: [check-and-build, test-unit, test-integration]`; si cualquier job falla, GitHub lo omite y **no se despliega**. El workflow reutilizable no admite ejecución manual.

La imagen se publica en:

```text
ghcr.io/alejoss/sigeconsultores:latest
ghcr.io/alejoss/sigeconsultores:<commit-sha>
```

Los nombres van en **minúsculas** (requisito de GHCR).

## Flujo Manus / publicación

1. Manus pushea a **`infra/staging-cicd`** → sin CI ni CD.
2. Manus abre PR **`infra/staging-cicd` → `main`**.
3. **Manus mergea el PR** (ruleset: 0 aprobaciones). **No** espera revisión ni aprobación del equipo.
4. Merge a **`main`** → corre el **único CI** (check + build + tests).
5. Solo si CI = **success** → **Deploy Production**:
   - **needs** — GitHub solo invoca el CD cuando los tres jobs anteriores pasan
   - **build-image** — imagen del mismo SHA que pasó CI
   - **Deploy to droplet** — solo con secretos configurados

`infra/staging-cicd` es la rama de integración; **no dispara CI ni CD**. CI + CD solo ocurren cuando Manus mergea el PR a `main`. Nunca push directo a `main` (salvo bypass admin de emergencia).

Sin secretos: tras CI verde, el CD termina con *Deploy skipped*; la imagen **sí** queda en GHCR.

## Secretos y variables para deploy al droplet

**Lo no sensible está hardcodeado** en `scripts/productionEnvManifest.mjs` (`productionDefaults`: dominio, SES from, S3 region/bucket, MySQL db/user, OAuth URLs públicas, droplet host/path, etc.). El CD ensambla `.env.production` con esos defaults + **Secrets** de GitHub.

No hace falta crear decenas de Actions Variables. Solo mantén **Secrets**.

Ruta: **Settings → Secrets and variables → Actions → Secrets**.

### Secrets que debes tener (y solo estos)

| Secreto | Uso |
|---------|-----|
| `DROPLET_SSH_KEY` | Clave privada SSH del droplet |
| `GHCR_TOKEN` | PAT con `read:packages` + `repo` |
| `MYSQL_ROOT_PASSWORD` | MySQL root |
| `MYSQL_PASSWORD` | MySQL app user |
| `JWT_SECRET` | Firma de sesión |
| `OWNER_OPEN_ID` | opcional |
| `AWS_ACCESS_KEY_ID` | S3 |
| `AWS_SECRET_ACCESS_KEY` | S3 |
| `SES_ACCESS_KEY_ID` | SES |
| `SES_SECRET_ACCESS_KEY` | SES |

Valores: cópialos desde `/opt/sige-app-staging/.env.production` en el droplet (`grep` / editor). Ya tienes `SES_*` y `DROPLET_SSH_KEY` / `GHCR_TOKEN` en muchos casos.

**No** guardes `APP_IMAGE`. El workflow inyecta `ghcr.io/alejoss/sigeconsultores:<sha>`.

Tras el primer deploy en modo **assembled**, puedes borrar el secreto obsoleto `ENV_PRODUCTION`. Mientras falten secrets individuales, el CD puede usar ese blob como fallback (`legacy_blob`).

Overrides opcionales: una Actions Variable con el mismo nombre que una clave en `productionDefaults` sustituye el default (p. ej. cambiar `FRONTEND_URL` sin tocar código).

La clave pública SSH debe estar en `~/.ssh/authorized_keys` del usuario en el droplet.

### Permisos GHCR

**Packages → sigeconsultores → Package settings → Manage Actions access** → conceder acceso al repositorio `SigeConsultores`.

### Permisos del workflow

**Settings → Actions → General → Workflow permissions** → **Read and write permissions** (para push a GHCR con `GITHUB_TOKEN`).

## Qué hace el deploy en el droplet

El job de CD **no** hace `docker build` en el droplet. Hace:

1. En el runner de GitHub: `node scripts/assemble-production-env.mjs` → archivo ensamblado desde Variables/Secrets
2. SCP del archivo al droplet
3. SSH: `git fetch` + `git reset --hard` al commit desplegado
4. Sustituye `.env.production` por el archivo ensamblado
5. Ejecuta `deploy-prod.sh` con `APP_IMAGE=ghcr.io/alejoss/sigeconsultores:<sha>`

Detalle: [DEPLOYMENT.md](./DEPLOYMENT.md).

## Deploy manual con la misma imagen

En el droplet, sin esperar Actions:

```bash
export APP_IMAGE=ghcr.io/alejoss/sigeconsultores:latest
export GHCR_USERNAME=Alejoss
export GHCR_TOKEN=<PAT>
./scripts/deploy-prod.sh
```

## Protección de ramas (ruleset `MainProtection`)

Configurado en GitHub: **Settings → Rules → Rulesets → [MainProtection](https://github.com/Alejoss/SigeConsultores/rules/16887475)** (edición: Settings → Rulesets).

Aplica a **`refs/heads/main`**, enforcement **active**.

| Regla | Qué hace |
|-------|----------|
| **Restrict deletions** | Nadie (salvo bypass) puede borrar `main` |
| **Block force pushes** (`non_fast_forward`) | No se permite `push --force` a `main` |
| **Require a pull request before merging** | Obliga a entrar por PR; **0** aprobaciones — **Manus puede mergear** sin espera humana; merge/squash/rebase permitidos |
| **Require status checks** | **No** — se quitó `check-and-build` porque el CI ya no corre en el PR (solo tras el merge a `main`) |

**Bypass:** rol **Repository admin** puede saltarse el ruleset (p. ej. push directo de emergencia del owner). Manus / colaboradores Write **no** bypassean: deben usar PR `infra/staging-cicd` → `main`.

**Compuerta de producción:** no es un status check del PR. Tras el merge, el workflow **CI** en `main` corre check/build/tests; solo si pasa se dispara el CD. Si CI falla, producción no se actualiza.

| Rama | Comportamiento |
|------|----------------|
| `infra/staging-cicd` | Push libre; sin CI ni CD; sin este ruleset |
| `main` | Ruleset arriba + CI/CD post-merge |

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

Última revisión: septiembre 2026 (defaults baked-in; solo Secrets en GitHub).
