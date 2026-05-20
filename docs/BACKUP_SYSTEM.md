# Sistema de Respaldos Automáticos - SIGE Platform

Índice general de documentación: [README.md](./README.md).

## Descripción General

Respaldo diario automatizado de la base de datos MySQL (contenedor Docker en el droplet de producción) hacia AWS S3 (`/opt/sige-app-staging`, `.env.production`).

- Frecuencia: diaria a las 2:00 AM UTC (cron job en el droplet)
- Destino: `s3://sige-backups/backups/`
- Retención: 30 días (S3 Lifecycle Policy)
- Compresión: gzip (~90 % de reducción)

## Arquitectura

```
┌─────────────────────────────────────────────────────┐
│  DigitalOcean Droplet                               │
│                                                     │
│  cron (2:00 AM UTC)                                 │
│       │                                             │
│       ▼                                             │
│  scripts/backup-cron.sh                             │
│       │                                             │
│       ├── docker compose exec mysql mysqldump       │
│       │       (streaming, sin archivo temporal)     │
│       ├── gzip -9                                   │
│       └── aws s3 cp → s3://sige-backups/backups/    │
│                                                     │
│  ┌──────────┐                                       │
│  │  MySQL   │  (contenedor Docker, docker-compose)  │
│  └──────────┘                                       │
└─────────────────────────────────────────────────────┘
                          │
                          ▼
              ┌──────────────────────┐
              │  AWS S3              │
              │  Bucket: sige-backups│
              │  Region: us-east-2   │
              │  Prefix: backups/    │
              └──────────────────────┘
```

## Archivos

| Archivo | Propósito |
|---|---|
| `scripts/backup-cron.sh` | Script de respaldo (mysqldump → gzip → S3 streaming) |
| `scripts/setup-backup-cron.sh` | Instalación única: registra cron job e instala AWS CLI |
| `scripts/restore-db.mjs` | Restauración desde S3 (listar y restaurar backups) |
| `scripts/backup-db.mjs` | Respaldo manual standalone (alternativa Node.js) |

## Setup inicial (una sola vez en el droplet)

```bash
sudo bash scripts/setup-backup-cron.sh /opt/sige-app-staging
```

Esto:
1. Instala AWS CLI si no está presente
2. Crea el cron job en `/etc/cron.d/sige-backup`
3. Configura logs en `/var/log/sige-backup.log`

### Variables de entorno requeridas

En `.env.production` (el mismo archivo que usa `docker compose --env-file`):

```bash
MYSQL_ROOT_PASSWORD=...   # usado por el contenedor mysql (compose env_file)
MYSQL_DATABASE=...        # idem
AWS_ACCESS_KEY_ID=AKIA... # solo en el host, para `aws s3 cp`
AWS_SECRET_ACCESS_KEY=...
AWS_S3_REGION=us-east-2       # opcional, default: us-east-2
AWS_S3_BUCKET=sige-backups    # opcional, default: sige-backups
```

`backup-cron.sh` **no hace `source` del .env completo** (valores con `()`, `$`, etc. romperían bash). El dump usa las variables **dentro del contenedor** `mysql`; en el host solo lee claves `AWS_*`.

## Operaciones comunes

### Ejecutar backup manual

**Primera vez en el droplet:** instala AWS CLI y (opcional) el cron:

```bash
sudo bash scripts/setup-backup-cron.sh /opt/sige-app-staging
```

Luego, desde la raíz del clone (MySQL debe estar arriba o el script lo levanta):

```bash
cd /opt/sige-app-staging
bash scripts/backup-cron.sh
```

Sin `setup-backup-cron.sh`, verás `aws: command not found`: el dump en Docker puede funcionar pero **no se sube nada a S3**.

### Ver logs del backup automático

```bash
tail -f /var/log/sige-backup.log
```

### Listar backups disponibles en S3

```bash
node scripts/restore-db.mjs --list
```

### Restaurar base de datos

```bash
# Restaurar un backup específico
node scripts/restore-db.mjs --backup sige-backup-2026-05-12T0200Z.sql.gz --force

# Restaurar datos de una empresa específica
node scripts/restore-db.mjs --backup sige-backup-2026-05-12T0200Z.sql.gz --company 60001
```

## Verificación

### Confirmar que el cron está activo

```bash
cat /etc/cron.d/sige-backup
```

### Verificar último backup en S3

```bash
aws s3 ls s3://sige-backups/backups/ --region us-east-2 | tail -3
```

### Probar backup sin esperar al cron

```bash
bash /opt/sige-app-staging/scripts/backup-cron.sh
# Debe imprimir: [timestamp] Backup complete: s3://sige-backups/backups/sige-backup-...sql.gz
```

## Recuperación ante desastres

| Escenario | RPO | RTO | Procedimiento |
|---|---|---|---|
| Datos borrados | 24 h | 15-30 min | `restore-db.mjs --backup <file>` |
| BD corrupta | 24 h | 30-45 min | `restore-db.mjs --backup <file> --force` |
| Droplet caído | 24 h | 1-2 h | Crear nuevo droplet, restaurar desde S3 |

## Troubleshooting

### Backup no se ejecutó

```bash
# Verificar que cron está corriendo
systemctl status cron

# Revisar logs
tail -50 /var/log/sige-backup.log

# Verificar que el contenedor MySQL está arriba
docker compose --env-file /opt/sige-app-staging/.env.production -f /opt/sige-app-staging/docker-compose.prod.yml ps mysql
```

### Error "aws: command not found"

```bash
sudo apt-get install -y awscli
```

### Error "syntax error near unexpected token" al ejecutar backup-cron.sh

Causa antigua: `source .env` en bash. Versión actual: solo lee `AWS_*` y el dump va por `docker compose exec mysql`. Actualiza el repo (`git reset --hard origin/main`) y vuelve a ejecutar.

### Error "Access Denied" en S3

Verificar credenciales AWS en el `.env` del entorno:
```bash
grep AWS_ /opt/sige-app-staging/.env.production
```

El usuario IAM (`sige-s3-backup`) debe tener permisos `s3:PutObject` y `s3:GetObject` sobre `arn:aws:s3:::sige-backups/*`.
