# Documentación SIGE Platform

Índice de guías del repositorio. La entrada principal para desarrollo e instalación local es el [README](../README.md) en la raíz.

| Documento | Contenido |
|-----------|-----------|
| [GUIA_MANUS.md](./GUIA_MANUS.md) | **Cliente / Manus:** Git, ramas, sync con `main`, push a staging |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | GHCR, deploy automático y manual (`deploy-prod.sh`), fallback build local |
| [GITHUB_SETUP.md](./GITHUB_SETUP.md) | Workflows, secretos de Actions, permisos GHCR |
| [TESTING.md](./TESTING.md) | Vitest: unit, integración (MySQL), CI |
| [INFRASTRUCTURE.md](./INFRASTRUCTURE.md) | Arquitectura de servicios (droplet, contenedores, S3, correo, OAuth) |
| [BACKUP_SYSTEM.md](./BACKUP_SYSTEM.md) | Respaldos diarios a S3, cron, restauración |
| [FILE_STORAGE.md](./FILE_STORAGE.md) | Subidas a S3, prefijos `uploads/`, URLs firmadas |

Documentos de producto / estrategia (no operativos de despliegue):

- [ARQUITECTURA_INTEGRIDAD_DATOS.md](./ARQUITECTURA_INTEGRIDAD_DATOS.md)
- [ESTRATEGIA_IA_PLATAFORMA_SIGE.md](./ESTRATEGIA_IA_PLATAFORMA_SIGE.md)
- [SOLICITUD_LEGAL_PROTECCION_PLATAFORMA.md](./SOLICITUD_LEGAL_PROTECCION_PLATAFORMA.md)

Archivos de ejemplo de variables de entorno en la raíz del repo: `.env.example`, `.env.production.example`.

Ejemplo de Nginx: `deploy/nginx/sige.conf.example`.
