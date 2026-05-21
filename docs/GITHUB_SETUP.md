# GitHub Actions — SIGE Platform

Por qué recibías correos de fallo en cada push a `main`, y cómo dejarlo en verde.

## Qué corre en cada push

| Workflow | Archivo | Qué hace |
|----------|---------|----------|
| **CI** | `.github/workflows/ci.yml` | `pnpm check` + `pnpm build` |
| **Deploy Production** | `.github/workflows/deploy-production.yml` | Build imagen → GHCR; **deploy al droplet solo si hay secretos** |

Antes, **CI** fallaba en `pnpm check` (errores TypeScript) y en `pnpm test` (muchos tests piden MySQL). **Deploy** fallaba al hacer SSH o login GHCR porque los secretos del repositorio no estaban configurados.

## Estado actual (tras el arreglo)

- **CI:** solo verificación de tipos y build (Node 22). Los tests siguen siendo locales (`pnpm test`) hasta montar MySQL en CI.
- **Deploy:** siempre construye y sube la imagen a GHCR. El job **Deploy to droplet** solo corre si existen todos los secretos listados abajo. Si no, el workflow termina en verde y verás el job informativo *Deploy skipped*.

Así dejas de recibir emails de fallo por deploy sin secretos, mientras sigues haciendo deploy manual en el servidor como ahora.

## Secretos para deploy automático (opcional)

En GitHub: **Settings → Secrets and variables → Actions → New repository secret**

| Secreto | Valor |
|---------|--------|
| `DROPLET_HOST` | `167.172.127.47` |
| `DROPLET_USER` | `deploy` |
| `GHCR_USERNAME` | Tu usuario de GitHub |
| `GHCR_TOKEN` | PAT con `read:packages` (y `write:packages` si el servidor hace pull privado) |
| `DROPLET_SSH_KEY` | Clave privada SSH (contenido completo del archivo, una línea con saltos) |
| `DEPLOY_PATH` | `/opt/sige-app-staging` |
| `ENV_PRODUCTION` | Contenido completo de `.env.production` del servidor (incluye `APP_IMAGE` si quieres) |

La clave pública correspondiente debe estar en `~deploy/.ssh/authorized_keys` en el droplet.

### Permisos del paquete GHCR

En GitHub: **Packages → SigeConsultores → Package settings → Manage Actions access** → conceder acceso al repo.

## Deploy manual (lo que usas hoy)

No necesitas los secretos si sigues con build en el droplet. Ver [DEPLOYMENT.md](./DEPLOYMENT.md).

## Dejar de recibir emails de Actions

**GitHub → Settings → Notifications → Actions** → desmarca “Send notifications for failed workflows” o deja solo los del repo que te interesen.

## Activar tests en CI (futuro)

Requiere servicio MySQL en el workflow, `DATABASE_URL`, y `drizzle-kit push` antes de `pnpm test`. Hasta entonces, ejecuta `pnpm test` en local antes de push si tocaste lógica de servidor.
