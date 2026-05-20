# SIGE Platform — Instrucciones para Manus

## Contexto del proyecto

Este proyecto es **SIGE Platform**, un Sistema Integrado de Gestión Empresarial construido con:

- **Frontend:** React 19 + Vite + TypeScript + Tailwind CSS + shadcn/ui
- **Backend:** Express + tRPC + Drizzle ORM
- **Base de datos:** MySQL 8
- **Repositorio:** https://github.com/Alejoss/SigeConsultores
- **Rama principal:** `main` (integración, CI y despliegue a producción)
- **Ramas de trabajo:** `feature/nombre-del-cambio` (efímeras, merge vía PR a `main`)

## Reglas obligatorias antes de cualquier cambio en el código

1. **Leer primero.** Antes de modificar cualquier archivo, leer el archivo `📋INSTRUCCIONESPARAMANUS—DesarrollodeSIGEPlatform.md` del repositorio y entender el contexto completo del cambio solicitado.
2. **Respetar las instrucciones al pie de la letra.** No interpretar ni ampliar el alcance de un cambio sin confirmación explícita del usuario. Si algo no está claro, preguntar antes de actuar.
3. **No romper lo que funciona.** Nunca modificar archivos no relacionados con el cambio solicitado. El principio es: el menor cambio posible para lograr el objetivo.
4. **Confirmar antes de cambios críticos.** Si el cambio afecta el esquema de base de datos, autenticación, rutas principales o lógica de negocio central, pedir confirmación explícita antes de proceder.
5. **Trabajar en ramas.** Todo cambio debe hacerse en una rama nueva (`git checkout -b feature/nombre-del-cambio`) y nunca directamente en `main` sin autorización.
6. **Verificar después de cada cambio.** Confirmar que el servidor sigue corriendo (`pnpm dev` o `node dist/index.js`) y que la funcionalidad afectada sigue operativa antes de reportar el cambio como completado.
7. **No eliminar ni reescribir lógica existente** a menos que el usuario lo solicite explícitamente. Preferir extensión sobre reemplazo.

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

# Correr tests
pnpm test

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
└── scripts/         # Scripts de utilidad (create-superuser, seed-roles)
```
