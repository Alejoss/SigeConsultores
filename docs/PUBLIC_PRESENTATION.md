# Presentación pública de ISGE 360

## Estado y alcance

Actualización comercial aprobada el 8 de noviembre de 2026: introducción de servicios, video de 40 segundos y nuevo orden de lectura. Se publica por PR de staging a main, con CI/CD y comprobación posterior del dominio; no modifica la plataforma empresarial ni su información.

Destino definitivo: **https://isge360.com/presentacion**. Express redirige esta carpeta a `/presentacion/`. El QR debe apuntar a la dirección del dominio, no al MP4 de Manus ni a la URL temporal de revisión.

La página pública mostrará, en este orden:

1. **Situaciones habituales**, inmediatamente después del logo y antes del hero, con el encabezado «¿Diriges tu empresa o pasas demasiado tiempo tratando de averiguar qué está pasando en ella?», el subtítulo «¿Te identificas con alguna de estas situaciones?» y tres situaciones de gestión. Este bloque no repite el logo o el texto de marca, ni incluye un enlace a la autoevaluación.
2. **Transición aprobada:** «No se trata de trabajar más, sino de conectar la estrategia, los sistemas de gestión y el trabajo de cada área.»
3. **Hero ya existente**, con el lema, el video de 40 segundos y sus controles internos.
4. **Frase aprobada tras `p-lead`:** «Para lograrlo, ISGE 360 combina asesoría personalizada y una plataforma que facilita la gestión de tus sistemas, alineados con la estrategia de tu empresa.»
5. **Flujo de gestión:** estrategia → procesos → resultados.
6. Responsabilidades de Gerencia, Responsable SIG y Jefes de Proceso.
7. Servicios.
8. Autoevaluación.
9. Contacto autorizado de Esteban Román.

La introducción narrada está dentro del video de 40 segundos y no se duplica como una segunda narración fuera de él. Las pantallas del video corresponden a Masa Viva, empresa ficticia. La página no solicita login, no carga datos empresariales, no crea sesiones, no usa tRPC, no envía correos, no modifica roles y no agrega seguimiento comercial.

Los componentes de situaciones y flujo se exportan como `ManagementSituations` y `ManagementFlow` desde `ManagementContext.tsx`. El export default de `ManagementContext` se conserva como wrapper por compatibilidad; la página utiliza los componentes nombrados y no renderiza el wrapper como bloque duplicado.

La autoevaluación consta de seis preguntas, con Sí (2 puntos), Parcialmente (1) y No (0). Solo presenta resultado al completar las seis: 0–4 gestión fragmentada, 5–8 en proceso de integración, 9–12 integrada. Es orientativa, no una auditoría, certificación ni porcentaje de cumplimiento normativo. Muestra fortalezas declaradas y oportunidades vinculadas a las respuestas; un puntaje alto no oculta respuestas negativas o parciales.

Las respuestas existen únicamente en memoria del navegador y desaparecen al recargar o salir. No hay base de datos, formularios de contacto ni envío automático. «Contactarme con ISGE 360 sobre mi resultado» solo abre un borrador de WhatsApp dirigido al contacto autorizado; el visitante decide si lo envía.

El hero mantiene sus botones internos para reproducir el video y saltar a la autoevaluación. No hay solicitud de demostración en el encabezado ni en el bloque inicial. Los controles accesibles están aislados en `assessmentControls.tsx`; no cargan la aplicación empresarial. La autoevaluación permanece después de servicios y antes de contacto.

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

Esta versión referencia `media/presentacion-20261108.mp4` para evitar cachés del video anterior. La ruta existente `media/presentacion.mp4` también contiene el mismo nuevo video de 40 segundos, manteniendo la compatibilidad de enlaces previos. Ambos archivos deben actualizarse juntos cuando se sustituya el video.

La fuente tipográfica se solicita a Google Fonts; si no está disponible, la página usa Arial. La reproducción y los contactos no dependen de esa fuente.

## Validación antes de imprimir

Después de una publicación autorizada, verificar en el dominio: carga sin sesión, MP4 reproducible en celular, soporte de solicitudes Range/HTTP 206, contactos y tarjeta descargable. Solo después generar/verificar el QR definitivo. Un QR estático no vence por sí mismo; la continuidad depende de conservar dominio, HTTPS, hosting y ruta.
