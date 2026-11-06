# Presentación pública de ISGE 360

## Estado y alcance

Preparada y validada localmente. No se publica por crear estos archivos: requiere autorización del usuario y el flujo normal staging → PR → main → CI → CD.

Destino definitivo: **https://isge360.com/presentacion**. Express redirige esta carpeta a `/presentacion/`. El QR debe apuntar a la dirección del dominio, no al MP4 de Manus ni a la URL temporal de revisión.

La página pública muestra el video de 30 segundos, las responsabilidades de Gerencia, Responsable SIG y Jefes de Proceso, y los contactos autorizados de Esteban Román. Las pantallas del video corresponden a Masa Viva, empresa ficticia. No solicita login, no carga datos empresariales, no crea sesiones, no usa tRPC, no envía correos, no modifica roles y no agrega seguimiento comercial.

## Archivos y mantenimiento

- Fuentes: `marketing/presentacion/`.
- Archivos estáticos preparados: `client/public/presentacion/`.
- Video, logo y portada: `client/public/presentacion/media/`.
- Subtítulos opcionales: `presentation-es.vtt`.
- Tarjeta de contacto: `esteban-roman.vcf`.

Se mantienen intactos `App.tsx`, los routers, el esquema de base de datos, los permisos y la infraestructura. El build normal de la aplicación copia la carpeta pública, y el servidor estático existente la sirve sin autenticación. No hay migración.

Para recompilar tras modificar el contenido de la página:

```bash
pnpm exec vite build --config marketing/presentacion/vite.config.ts
pnpm check
pnpm build
```

La compilación conserva `media/`. Se deben retirar únicamente los JS/CSS generados que ya no estén referenciados por el nuevo `index.html`, nunca archivos de la plataforma ni medios originales. Versionar fuentes y resultado actualizado en el mismo commit.

El video de la versión definitiva se sirve bajo el propio dominio; no depende de enlaces firmados o temporales de Manus. Se puede sustituir el MP4 y actualizar la página, conservando `/presentacion/` y el QR impreso. El subtitulado debe actualizarse si cambia la narración.

La fuente tipográfica se solicita a Google Fonts; si no está disponible, la página usa Arial. La reproducción y los contactos no dependen de esa fuente.

## Validación antes de imprimir

Después del despliegue autorizado, verificar en el dominio: carga sin sesión, MP4 reproducible en celular, soporte de solicitudes Range/HTTP 206, contactos y tarjeta descargable. Solo después generar/verificar el QR definitivo. Un QR estático no vence por sí mismo; la continuidad depende de conservar dominio, HTTPS, hosting y ruta.
