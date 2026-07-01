# Pruebas — SIGE Platform

Guía de la capa de tests con **Vitest**. El CI ejecuta tres jobs: typecheck/build, tests unitarios/cliente (sin BD) e integración (MySQL 8).

## Tipos de test

| Proyecto Vitest | Comando | Requiere MySQL | Qué cubre |
|-----------------|---------|----------------|-----------|
| **unit** | `pnpm test:unit` | No | Lógica de servidor (parsers, RBAC, routers mockeados), utilidades de cliente |
| **client** | `pnpm test:client` | No | Utilidades DOM (localStorage, clipboard); componentes React en `pendingClientTests` pendientes de alineación |
| **integration** | `pnpm test:integration` | Sí | Routers y flujos que leen/escriben en MySQL vía Drizzle |

Comando habitual en desarrollo (sin Docker):

```bash
pnpm test
```

Equivale a `unit` + `client`. Para ejecutar **todo** incluyendo integración:

```bash
pnpm test:all
```

Un solo archivo:

```bash
pnpm test:unit -- server/routers/__tests__/managerAuth.test.ts
pnpm test:integration -- server/__tests__/uniqueConstraintTest.test.ts
```

## Entorno local con MySQL

1. Levantar MySQL (mismo motor que producción):

   ```bash
   docker compose up -d mysql
   ```

2. Configurar `DATABASE_URL` en `.env` o `.env.local` (ver `.env.example`):

   ```text
   DATABASE_URL=mysql://sige:sige@localhost:3306/sige_platform
   ```

3. Sincronizar esquema:

   ```bash
   pnpm db:push
   ```

4. Correr integración:

   ```bash
   pnpm test:integration
   ```

## CI (GitHub Actions)

Workflow **CI** (`.github/workflows/ci.yml`):

| Job | Pasos |
|-----|--------|
| `check-and-build` | `pnpm check`, `pnpm build` |
| `test-unit` | `pnpm test:unit`, `pnpm test:client` |
| `test-integration` | servicio MySQL 8 → `pnpm db:push` → `pnpm test:integration` |

La BD del runner es efímera (`sige_platform_test`); los tests de integración deben crear y limpiar sus propios datos (IDs en rango alto, p. ej. `999xxx`).

## Convenciones

- **Archivos de integración** listados en `vitest.integration.ts` — al añadir un test que use `getDb()` o escriba en MySQL, incluirlo ahí.
- **Helpers:** `server/__tests__/helpers/db.ts` (`describeWithDb`, `isDbAvailable`).
- **No acoplar a datos de producción** (nombres de empresas reales, conteos fijos de clientes). Usar fixtures sintéticos.
- **Routers nuevos:** al menos un test (unit con mocks o integración con caller tRPC).

## Estructura

```text
server/__tests__/           # Tests de servidor (mayoría unit; algunos en vitest.integration.ts)
server/routers/__tests__/   # Tests de routers tRPC
client/src/__tests__/       # Utilidades frontend
client/src/**/__tests__/    # Páginas y componentes
server/__tests__/helpers/   # Env, setup jsdom, helpers de BD
vitest.config.ts            # Proyectos unit / integration / client
vitest.integration.ts       # Lista de tests que requieren MySQL
```

## Solución de problemas

| Síntoma | Causa probable | Acción |
|---------|----------------|--------|
| `Failed to load url @shared/...` | Alias no resuelto | Verificar `vitest.config.ts` (`resolve.alias`) |
| `Database not available` en integración | MySQL apagado o `DATABASE_URL` vacío | `docker compose up -d mysql` + `.env.local` |
| Tests unitarios OK, integración falla en CI | Esquema desactualizado | Ejecutar `pnpm db:push` localmente; revisar migraciones Drizzle |
| `@testing-library/react` no encontrado | Dependencias de dev | `pnpm install` |

Más contexto de CI/CD: [GITHUB_SETUP.md](./GITHUB_SETUP.md).

## Pendiente (componentes)

Estos archivos existen pero están **excluidos** del CI hasta alinear mocks con la UI actual:

- `client/src/components/__tests__/OrganizationChart.test.tsx`
- `client/src/components/__tests__/RecoveryForm.test.tsx`

Listados en `pendingClientTests` dentro de `vitest.workspace.ts`.
