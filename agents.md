# SIGE Platform — Instrucciones para Manus

## Contexto del proyecto

Este proyecto es **SIGE Platform**, un Sistema Integrado de Gestión Empresarial construido con:

- **Frontend:** React 19 + Vite + TypeScript + Tailwind CSS + shadcn/ui
- **Backend:** Express + tRPC + Drizzle ORM
- **Base de datos:** MySQL 8
- **Repositorio:** https://github.com/Alejoss/SigeConsultores
- **Rama de integración:** `infra/staging-cicd` (aquí van los pushes de trabajo; **sin CI ni CD**)
- **Rama de producción:** `main` (único lugar donde corre CI; si pasa, se dispara CD)

## Lectura obligatoria (antes de cualquier cambio)

No basta con “leer la documentación” de forma genérica. Completa esta cadena **en orden**:

1. **Esta guía** (`agents.md`) — reglas de alcance y verificación.
2. **[docs/GUIA_MANUS.md](docs/GUIA_MANUS.md)** — punto de entrada operativo: Git, checklist y lista de docs obligatorios.
3. Desde GUIA_MANUS, leer **todos** los documentos operativos enlazados, en especial:
   - [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — **quién dispara CI/CD** (solo merge a `main`)
   - [docs/GITHUB_SETUP.md](docs/GITHUB_SETUP.md) — workflows y secretos
   - [docs/TESTING.md](docs/TESTING.md) — pruebas y esquema de BD
   - [docs/INFRASTRUCTURE.md](docs/INFRASTRUCTURE.md), [docs/BACKUP_SYSTEM.md](docs/BACKUP_SYSTEM.md), [docs/FILE_STORAGE.md](docs/FILE_STORAGE.md)

Al empezar, confirma que leíste esa cadena. Si algo no está claro, pregunta **antes** de pushear o mergear.

## Flujo Git / CI / CD (resumen)

```text
Push → infra/staging-cicd     (sin CI, sin deploy)
              ↓
PR → merge a main
              ↓
CI en main (única compuerta: check + build + tests)
              ↓  solo si CI = success
         Deploy Production (CD)
```

- **Nunca** pushear directo a `main` sin autorización explícita.
- Staging es integración; **producción solo se actualiza** cuando el cambio llega a `main` y el CI pasa.

## Reglas obligatorias antes de cualquier cambio en el código

1. **Leer primero.** Completar la cadena de lectura de la sección anterior.
2. **Respetar las instrucciones al pie de la letra.** No ampliar el alcance sin confirmación explícita. Si algo no está claro, preguntar antes de actuar.
3. **No romper lo que funciona.** No modificar archivos no relacionados. Menor cambio posible.
4. **Confirmar antes de cambios críticos.** Esquema de BD, autenticación, rutas principales o lógica de negocio central → pedir confirmación antes.
5. **Actualizar las pruebas.** Tras cambios funcionales (sobre todo `drizzle/schema.ts`), actualizar tests y verificar con `pnpm test` / `pnpm test:integration` (ver [docs/TESTING.md](docs/TESTING.md)).
6. **Trabajar vía staging.** Push a `infra/staging-cicd` (o `feature/*` que luego integre a staging). Publicar con PR `infra/staging-cicd` → `main`. Detalle: [docs/GUIA_MANUS.md](docs/GUIA_MANUS.md).
7. **Verificar después de cada cambio.** Servidor operativo (`pnpm dev` o `node dist/index.js`), funcionalidad afectada OK, pruebas relevantes en verde.
8. **No eliminar ni reescribir lógica existente** salvo petición explícita. Preferir extensión sobre reemplazo.
9. **Tras merge a `main`:** revisar Actions. Si CI falla, **no hay CD**; corregir en staging y volver a mergear. Leer logs de CI antes de declarar el trabajo terminado.

## Entorno de desarrollo local

| Componente | Detalle |
|------------|---------|
| Repositorio local | `/home/ubuntu/sige-app` |
| MySQL | `127.0.0.1:3306` (Docker `docker compose up -d mysql`), base `sige_platform` |
| Servidor | `http://localhost:3000` |
| Variables de entorno | `/home/ubuntu/sige-app/.env.local` y `/home/ubuntu/.env.local` |
| Admin de la plataforma | `sige@admin.com` |

## Comandos frecuentes

```bash
# Instalar dependencias
pnpm install

# Desarrollo con hot reload
pnpm dev

# Build de producción
pnpm build

# Iniciar servidor de producción
pnpm start

# Aplicar cambios de esquema a la BD
pnpm db:push

# Crear administrador
pnpm admin:create -- --email admin@empresa.com --password 'Password123!' --name 'Nombre'

# Sembrar roles
pnpm roles:seed

# Correr tests (unit + client)
pnpm test

# Tests de integración (MySQL) — obligatorio tras cambios de esquema o routers
pnpm test:integration

# Verificar tipos TypeScript
pnpm check
```

## Autenticación en APIs tRPC (guardar / leer datos SIGE)

| Procedimiento | Quién puede usarlo |
|---------------|-------------------|
| `companyProcedure` | Usuario OAuth, **gerente** o **jefe de proceso** (estándar para CRUD de módulos) |
| `protectedProcedure` | Solo usuario OAuth de plataforma |
| `adminProcedure` | Solo `role === admin` |
| `publicProcedure` | Sin sesión (formularios públicos, tokens de invitación) |

- **Regla:** todo endpoint que guarde o liste datos de empresa/proceso debe usar `companyProcedure`, no `protectedProcedure`.
- **Cliente:** resolver contexto con `getCompanyIdFromSession()` / `getProcessIdFromSession()` desde `client/src/lib/sessionScope.ts`.
- **Servidor:** validación opcional de alcance en `server/_core/sessionScope.ts` (`assertCompanyAccess`, `assertProcessAccess`).
- El redirect a `/login` ocurre cuando la API devuelve el mensaje `Please login (10001)` (ver `client/src/main.tsx`).

## Estructura del proyecto

```
sige-app/
├── client/          # Frontend React
│   └── src/
│       ├── components/
│       ├── pages/
│       └── hooks/
├── server/          # Backend Express + tRPC
│   ├── _core/       # Configuración central (env, auth, db)
│   ├── routers/     # Routers tRPC
│   └── __tests__/   # Tests del servidor
├── drizzle/         # Esquema de base de datos
│   └── schema.ts
├── shared/          # Tipos y constantes compartidos
├── docs/            # Documentación operativa (entrada: GUIA_MANUS.md)
└── scripts/         # Scripts de utilidad (create-superuser, seed-roles)
```

## Documentación vinculada

| Documento | Uso |
|-----------|-----|
| [docs/GUIA_MANUS.md](docs/GUIA_MANUS.md) | Flujo Git, checklist, lectura obligatoria |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | CI solo en `main` → CD si pasa |
| [docs/TESTING.md](docs/TESTING.md) | Cómo escribir y ejecutar pruebas |
| [docs/README.md](docs/README.md) | Índice completo |
| [README.md](README.md) | Instalación y comandos del repo |
