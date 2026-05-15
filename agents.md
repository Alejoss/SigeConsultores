# SIGE Platform — Instrucciones para Manus

## Contexto del proyecto

Este proyecto es **SIGE Platform**, un Sistema Integrado de Gestión Empresarial construido con:

- **Frontend:** React 19 + Vite + TypeScript + Tailwind CSS + shadcn/ui
- **Backend:** Express + tRPC + Drizzle ORM
- **Base de datos:** MySQL 8
- **Repositorio:** https://github.com/Alejoss/SigeConsultores
- **Rama principal de desarrollo:** `develop`
- **Rama de producción:** `main`

## Reglas obligatorias antes de cualquier cambio en el código

1. **Leer primero.** Antes de modificar cualquier archivo, leer el archivo `📋INSTRUCCIONESPARAMANUS—DesarrollodeSIGEPlatform.md` del repositorio y entender el contexto completo del cambio solicitado.
2. **Respetar las instrucciones al pie de la letra.** No interpretar ni ampliar el alcance de un cambio sin confirmación explícita del usuario. Si algo no está claro, preguntar antes de actuar.
3. **No romper lo que funciona.** Nunca modificar archivos no relacionados con el cambio solicitado. El principio es: el menor cambio posible para lograr el objetivo.
4. **Confirmar antes de cambios críticos.** Si el cambio afecta el esquema de base de datos, autenticación, rutas principales o lógica de negocio central, pedir confirmación explícita antes de proceder.
5. **Trabajar en ramas.** Todo cambio debe hacerse en una rama nueva (`git checkout -b feature/nombre-del-cambio`) y nunca directamente en `main` o `develop` sin autorización.
6. **Verificar después de cada cambio.** Confirmar que el servidor sigue corriendo (`pnpm dev` o `node dist/index.js`) y que la funcionalidad afectada sigue operativa antes de reportar el cambio como completado.
7. **No eliminar ni reescribir lógica existente** a menos que el usuario lo solicite explícitamente. Preferir extensión sobre reemplazo.

## Entorno de desarrollo local

| Componente | Detalle |
|------------|---------|
| Repositorio local | `/home/ubuntu/sige-app` |
| MySQL | `127.0.0.1:3307`, usuario: `sige`, base: `sige_platform_staging` |
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
