# Correo transaccional — Amazon SES

La plataforma envía invitaciones, confirmaciones, reset de contraseña y alertas de cronograma con **Amazon SES** (API `SendEmail`, no SMTP ni Brevo).

Detalle de arquitectura: [INFRASTRUCTURE.md](./INFRASTRUCTURE.md). Variables de ejemplo: [`.env.production.example`](../.env.production.example).

## Región y dominio

| Dato | Valor |
|------|--------|
| Identidad verificada | `isge360.com` |
| Región SES | `us-west-2` (Oregon) — las identidades son **por región** |
| Región S3 | `us-east-2` (Ohio) — no mezclar con SES |
| Remitente | `noreply@isge360.com` (cualquier `@isge360.com` vale una vez verificado el dominio) |
| Nombre visible | `ISGE 360` |

S3 y SES usan **IAM users distintos**. No sustituyas `AWS_ACCESS_KEY_ID` (S3) por las keys de SES.

## Variables de entorno

En `.env.local` (dev) y `.env.production` (droplet):

```dotenv
AWS_SES_REGION=us-west-2
SES_FROM_EMAIL=noreply@isge360.com
SES_FROM_NAME=ISGE 360
SES_ACCESS_KEY_ID=
SES_SECRET_ACCESS_KEY=
```

`AWS_S3_REGION=us-east-2` debe seguir existiendo. Si `AWS_REGION=us-west-2` quedó puesto para SES, no pasa nada mientras `AWS_S3_REGION` apunte a Ohio (respaldos y uploads).

El código lee `SES_*` y, si faltan, cae a `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`. En producción conviene el par `SES_*` del usuario IAM dedicado.

No hace falta host SMTP, puerto ni `BREVO_*`.

## IAM

Usuario de aplicación (p. ej. `ISGE360`), sin consola, con access keys de tipo **Application running outside AWS** (el droplet no está en EC2).

Política mínima: `ses:SendEmail` y `ses:SendRawEmail` con `ses:FromAddress` `*@isge360.com`. `AmazonSESFullAccess` funciona en MVP y es más amplia de lo necesario.

## Sandbox vs producción

Cuentas nuevas de SES empiezan en **sandbox** (por región):

- Solo se envía **hacia** identidades verificadas (p. ej. un Gmail de prueba).
- Tope 200 correos / 24 h y 1 por segundo.

Para clientes reales: SES → Account dashboard → **Request production access**, tipo **Transactional**, URL `https://isge360.com`. AWS apunta a una primera respuesta en 24 h (no es un SLA).

Hasta que el dashboard deje de decir *sandbox*, un envío a un destinatario no verificado falla aunque el `.env` esté bien.

## Comprobar que DNS sigue bien

SES → Identities → `isge360.com` debe estar **Verified**. DKIM Easy (RSA 2048) y MAIL FROM (`no-reply.isge360.com`) se publican en Route 53 con **Publish DNS records to Route53**. DMARC inicial: `p=none`.

## Qué envía la app

Implementación: `server/_core/emailService.ts`.

- Invitación y confirmación de gerente
- Invitación y confirmación de jefe de proceso
- Invitación de acceso
- Reset de contraseña (espera la respuesta de SES)
- Alertas de cronograma semanal

Los enlaces de esos correos usan `FRONTEND_URL` / `VITE_FRONTEND_URL` (`https://isge360.com` en producción).

## Logs

Busca `[EmailService]` en `docker compose logs app`. Si faltan keys o `SES_FROM_EMAIL`, el diagnóstico no imprime secretos. `MessageId` de SES aparece cuando el envío se acepta.

## Verificación local (opcional)

Con las mismas variables y el dominio verificado, un envío de prueba (reset de contraseña a un buzón verificado en sandbox) confirma la integración sin SMTP.
