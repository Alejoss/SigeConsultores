# Documentación SIGE Platform

Índice de guías del repositorio. La entrada principal para desarrollo e instalación local es el [README](../README.md) en la raíz.

## Lectura para Manus / agentes (orden obligatorio)

1. [agents.md](../agents.md) — reglas de alcance, auth y verificación.
2. [GUIA_MANUS.md](./GUIA_MANUS.md) — **punto de entrada operativo:** Git, checklist; enlaza todos los docs que debes leer antes de codear.
3. Los documentos operativos listados en GUIA_MANUS, en especial [DEPLOYMENT.md](./DEPLOYMENT.md) (CI solo en `main` → CD si pasa).

> Push a `infra/staging-cicd` **no** corre CI ni CD. Publicar = merge a `main` → CI → CD solo si CI es verde.

## Documentos operativos

| Documento | Contenido |
|-----------|-----------|
| [GUIA_MANUS.md](./GUIA_MANUS.md) | **Cliente / Manus:** lectura obligatoria, Git, ramas, checklist |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Quién dispara CI/CD, GHCR, deploy automático y manual |
| [GITHUB_SETUP.md](./GITHUB_SETUP.md) | Workflows, secretos de Actions, permisos GHCR |
| [TESTING.md](./TESTING.md) | Vitest: unit, integración (MySQL); actualizar tests al cambiar esquema |
| [INFRASTRUCTURE.md](./INFRASTRUCTURE.md) | Arquitectura de servicios (droplet, contenedores, S3, correo, OAuth) |
| [BACKUP_SYSTEM.md](./BACKUP_SYSTEM.md) | Respaldos diarios a S3, cron, restauración |
| [FILE_STORAGE.md](./FILE_STORAGE.md) | Subidas a S3, prefijos `uploads/`, URLs firmadas |

Documentos de producto / estrategia (no operativos de despliegue):

- [ARQUITECTURA_INTEGRIDAD_DATOS.md](./ARQUITECTURA_INTEGRIDAD_DATOS.md)
- [ESTRATEGIA_IA_PLATAFORMA_SIGE.md](./ESTRATEGIA_IA_PLATAFORMA_SIGE.md)
- [SOLICITUD_LEGAL_PROTECCION_PLATAFORMA.md](./SOLICITUD_LEGAL_PROTECCION_PLATAFORMA.md)

Archivos de ejemplo de variables de entorno en la raíz del repo: `.env.example`, `.env.production.example`.

Ejemplo de Nginx: `deploy/nginx/sige.conf.example`.
