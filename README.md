# SIGE Platform — Sistema Integrado de Gestión Empresarial

Plataforma para mapear y caracterizar procesos, riesgos, FODA, cumplimiento e indicadores, con API type-safe (tRPC) y frontend React.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Stack

| Capa | Tecnología |
|------|------------|
| Frontend | React 19, Tailwind 4, shadcn/ui, Wouter, TanStack Query |
| API | Express 4, tRPC 11, superjson |
| Datos | Drizzle ORM, MySQL 8 (local/Docker o remoto vía `DATABASE_URL`) |
| Runtime local / CI | Node.js **20**, **pnpm** (ver `package.json` → `packageManager`) |
| Imagen de producción | Node 20 Alpine (`Dockerfile`) |

Servicios externos habituales: proveedor OAuth, Brevo (correo), AWS S3 (respaldos y archivos). Detalle en [docs/INFRASTRUCTURE.md](docs/INFRASTRUCTURE.md).

## Requisitos

- Node.js 20+
- pnpm 10+ (el repo fija versión en `packageManager`)
- MySQL 8 accesible (o solo Docker para desarrollo con `docker-compose.yml`)

## Instalación rápida (desarrollo)

```bash
git clone git@github.com:Alejoss/SigeConsultores.git
cd sige-app
pnpm install
cp .env.example .env.local
# Editar .env.local: OAuth, JWT_SECRET, DATABASE_URL, etc.
```

Base de datos local con Docker (MySQL + Adminer opcional):

```bash
docker compose up -d mysql
# Opcional: Adminer en http://localhost:8080 (solo compose por defecto del repo)
pnpm db:push
pnpm dev
```

La app en desarrollo suele quedar en **http://localhost:3000** (Express sirve Vite en middleware).

## Variables de entorno

Plantillas:

- **Local:** [.env.example](.env.example) → copiar a `.env` o `.env.local`
- **Staging (compose en servidor):** [.env.staging.example](.env.staging.example)
- **Producción (compose en servidor):** [.env.production.example](.env.production.example)

El servidor carga `.env` y luego `.env.local` con prioridad (ver `server/_core/loadEnv`). Para OAuth, al menos `VITE_APP_ID`, `OAUTH_SERVER_URL` y `JWT_SECRET` son necesarios para arrancar (`validateOAuthConfig`).

S3 y correo: ver comentarios en `.env.example` y [docs/FILE_STORAGE.md](docs/FILE_STORAGE.md).

## Estructura del repo

```
sige-app/
├── client/                 # Frontend (Vite, React)
├── server/
│   ├── _core/              # Express, tRPC, auth, Vite/static
│   ├── routers/            # Routers tRPC por dominio
│   ├── routers.ts          # appRouter
│   └── db.ts               # Acceso Drizzle / consultas
├── shared/                 # Tipos y utilidades compartidas
├── drizzle/                # Esquema y metadatos Drizzle
├── scripts/                # Utilidades (deploy, backup, admin, etc.)
├── deploy/nginx/           # Ejemplos de sitio Nginx
├── docker-compose*.yml     # local / staging / producción
├── Dockerfile
└── docs/                   # Índice: docs/README.md
```

## Comandos (package.json)

| Comando | Descripción |
|---------|-------------|
| `pnpm dev` | Servidor de desarrollo (tsx watch) |
| `pnpm build` | Cliente Vite + bundle del servidor a `dist/` |
| `pnpm start` | Producción: `node dist/index.js` |
| `pnpm check` | Typecheck (`tsc --noEmit`) |
| `pnpm test` | Tests (Vitest) |
| `pnpm format` | Prettier |
| `pnpm db:push` | Sincroniza esquema con la BD (drizzle-kit push) |
| `pnpm db:studio` | Drizzle Studio (requiere `DATABASE_URL` o `MYSQL_*`) |
| `pnpm admin:create` | Crear superusuario (`-- --email ... --password ...`) |
| `pnpm roles:seed` | Sembrar roles de plataforma |

Tests en un archivo: `pnpm test -- server/__tests__/archivo.test.ts`.

## Producción y staging (Docker)

- **Build:** `Dockerfile` multi-stage (pnpm install, build, imagen mínima con `node dist/index.js`).
- **Compose:** `docker-compose.prod.yml` y `docker-compose.staging.yml` levantan **MySQL** + **app**. La app recibe `DATABASE_URL` desde el compose; en el arranque del contenedor puede ejecutarse `drizzle-kit push` si `RUN_DB_PUSH_ON_STARTUP=true` (ver `docker/entrypoint.sh`).
- **Despliegue automático:** GitHub Actions (`.github/workflows/deploy-production.yml`, `deploy-staging.yml`).

Guías: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md), [docs/MANUAL_DEPLOY_STAGING.md](docs/MANUAL_DEPLOY_STAGING.md), [docs/BACKUP_SYSTEM.md](docs/BACKUP_SYSTEM.md).

## Documentación

- **Índice de docs:** [docs/README.md](docs/README.md)
- **Infra y servicios:** [docs/INFRASTRUCTURE.md](docs/INFRASTRUCTURE.md)
- **Despliegue:** [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)
- **Respaldos:** [docs/BACKUP_SYSTEM.md](docs/BACKUP_SYSTEM.md)
- **Archivos en S3:** [docs/FILE_STORAGE.md](docs/FILE_STORAGE.md)

## Contribución y licencia

Ramas habituales: features desde `develop`; producción desde `main` según el flujo del equipo. MIT — ver [LICENSE](LICENSE).

## Contacto

Issues en GitHub (repositorio privado) o canal acordado por el equipo.
