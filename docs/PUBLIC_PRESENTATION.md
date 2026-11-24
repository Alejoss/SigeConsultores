# Presentación pública de ISGE 360

## Estado y alcance

**Versión comercial aprobada: 24 de noviembre de 2026.** Sustituye la presentación comercial del 8 de noviembre; no modifica la aplicación empresarial, su información, base de datos, autenticación, permisos ni roles. La publicación corresponde al flujo autorizado de staging a main, con CI/CD y comprobación posterior en el dominio. La aprobación del material no sustituye esa verificación de publicación.

Destino permanente: **https://isge360.com/presentacion**. Express redirige esta carpeta a `/presentacion/`. La URL canónica y `og:url` son `https://isge360.com/presentacion/`; la imagen de metadatos también se sirve desde el dominio. El QR debe apuntar a la página permanente, no al MP4, a un enlace firmado de Manus ni a una URL temporal de revisión.

## Contenido y orden aprobados

La página pública presenta, una sola vez y en este orden:

1. **Situaciones habituales**, después del logo y antes del hero. Encabezado: «¿Diriges tu empresa o pasas demasiado tiempo tratando de averiguar qué está pasando en ella?». Subtítulo: «¿Te identificas con alguna de estas situaciones?». Las tres situaciones son «Objetivos sin seguimiento», «Áreas y sistemas desconectados de la estrategia» e «Información dispersa». El bloque no duplica la marca ni incluye un CTA de autoevaluación.
2. **Hero: «Plataforma de Gestión Empresarial Integral».** Promesa: «Conecta la estrategia de tu empresa con los objetivos, las responsabilidades y el trabajo de cada área, y permite ver sus resultados en un solo lugar». La asesoría se explica como acompañamiento: «Integra también los sistemas de gestión al servicio de tu empresa, con asesoría personalizada para llevarlo a la práctica».
3. **Flujo: Estrategia → Gestión → Control**, con Direccionamiento, Operación y Desempeño. Cierre: «La estrategia se convierte en gestión y la gestión en resultados».
4. **Video de 40 segundos**, en su sección independiente después del flujo, con reproducción voluntaria, subtítulos en español, descarga y enlace directo de respaldo.
5. **Roles y responsabilidades** de Gerente General, Responsable del SIG y Jefes de Proceso / Responsables de área.
6. **Servicios:** acceso y uso de la Plataforma ISGE 360, y asesoría personalizada para implementar la plataforma y los Sistemas Integrados de Gestión, adaptada a las necesidades de la empresa.
7. **Autoevaluación orientativa** de seis preguntas.
8. **Contacto autorizado de Esteban Román**, con WhatsApp, teléfono, correo y tarjeta de contacto descargable.

La transición de situaciones al hero es: «No se trata de trabajar más, sino de conectar la estrategia, la gestión y el trabajo de cada área». Los componentes `ManagementSituations` y `ManagementFlow` se exportan desde `ManagementContext.tsx`. El export default se conserva como wrapper por compatibilidad, pero Home renderiza solo los componentes nombrados para evitar bloques duplicados.

El hero tiene **únicamente «Ver presentación · 40 s»**, una acción interna de reproducción. No incluye CTA de autoevaluación ni solicitud de demostración. El enlace de navegación a la autoevaluación sí permanece disponible; no es un CTA del bloque inicial. La autoevaluación está después de servicios y antes de contacto, con el título «¿Tu gestión trabaja para tu estrategia… o al revés?».

## Video, accesibilidad y datos de demostración

El videoclip aprobado dura **40 segundos** e incluye narración audible dentro del MP4; no se añade una segunda narración fuera del video. La pista lateral `presentation-es.vtt?v=20261124` reproduce los textos de la nueva versión, desde «¿Sabes cuánto está avanzando realmente tu empresa?» hasta «Conversemos», con el último subtítulo a los 40 segundos. No corresponde a la narración comercial del 8 de noviembre.

Los visuales muestran **secciones de la plataforma con diseño adaptado para celular, no capturas literales de la aplicación empresarial**. Los avances son ficticios y exclusivamente demostrativos: **OE 82 %, Gestión 76 %, PI 68 % y SG 91 %**. No representan resultados reales de clientes ni garantías de desempeño o cumplimiento. La nota visible indica: «Las secciones de la plataforma se presentan con un diseño adaptado para celular. Los avances mostrados son ficticios». El pie y la descripción accesible del video refuerzan que son datos de demostración.

La reproducción usa `playsInline` y `preload="none"`, sin reproducción automática. La página conserva controles accesibles, subtítulos, enlace de descarga, mensaje de error y acceso directo al MP4 si falla la reproducción. El desplazamiento al video respeta la preferencia de movimiento reducido.

## Privacidad y autoevaluación preservada

La página comercial no solicita login, no consulta datos empresariales, no crea sesiones, no usa tRPC ni APIs de la plataforma, no envía correos, no modifica roles y no agrega seguimiento comercial. Los enlaces de contacto se activan solo por decisión del visitante. El enlace del pie a `https://isge360.com/` permite ingresar voluntariamente a la plataforma existente, sin integrarla en esta página pública.

Se conserva el motor de autoevaluación y su UI accesible existente; el cambio comercial afecta únicamente su título. Los controles públicos están aislados en `assessmentControls.tsx`, sin dependencias de la aplicación empresarial. **No se modifica `server/__tests__/publicManagementAssessment.test.ts`.**

La autoevaluación consta de seis preguntas, con Sí (2 puntos), Parcialmente (1) y No (0). Solo presenta resultado al completar las seis: 0–4 gestión fragmentada, 5–8 en proceso de integración y 9–12 integrada. Es orientativa: no es una auditoría, certificación ni porcentaje de cumplimiento normativo. Muestra fortalezas declaradas y oportunidades vinculadas a las respuestas; un puntaje alto no oculta respuestas negativas o parciales.

Las respuestas existen únicamente en memoria del navegador y se descartan al recargar o salir. No hay almacenamiento local de respuestas, base de datos, formularios de contacto ni envío automático. «Contactarme con ISGE 360 sobre mi resultado» solo abre un **borrador de WhatsApp** dirigido al contacto autorizado, con resultado y respuestas. El visitante puede revisarlo o editarlo y decide si lo envía en WhatsApp. Se mantienen las etiquetas accesibles, el foco al avanzar o cerrar y el bloqueo de avance sin respuesta válida.

Contacto autorizado: Esteban Román, **+593 98 729 8644**, **esteban@isge360.com**, Quito – Ecuador. La vCard local conserva estos datos y el enlace permanente a la presentación.

## Archivos, activos locales y mantenimiento

- Fuentes comerciales mantenibles: `marketing/presentacion/`.
- Release estático aprobado y autocontenido, compilado en Manus: `client/public/presentacion/`, con `index.html` y sus JS/CSS ya generados.
- Medios locales: `client/public/presentacion/media/logo.png`, `poster.jpg` y `presentacion-20261124.mp4`.
- Subtítulos: `client/public/presentacion/presentation-es.vtt` y su copia mantenible en `marketing/presentacion/public/`.
- Tarjeta de contacto: `client/public/presentacion/esteban-roman.vcf` y su copia mantenible en `marketing/presentacion/public/`.

Home utiliza imports relativos `./ManagementAssessment` y `./ManagementContext`, CSS aprobado y medios **exclusivamente locales** bajo `/presentacion/media/`. No hay bandera `VITE_PRESENTATION_LOCAL_ASSETS` ni alternativa a `manus-storage`. Los JS/CSS del HTML publicado se resuelven bajo `/presentacion/assets/`; los archivos compilados entregados se conservan como release aprobado. Las fuentes de marketing permiten mantenimiento posterior mediante un build aislado: la aplicación no necesita recompilar esta página como una entrada de su SPA ni cargar su router, base de datos o autenticación.

Se mantienen intactos `App.tsx`, los routers, el esquema de base de datos, los permisos y la infraestructura de la plataforma. El build normal de la aplicación copia la carpeta pública, y el servidor estático existente la sirve sin autenticación. **No hay migración ni cambio de la aplicación, base de datos o autenticación.**

Para una futura actualización comercial autorizada de las fuentes, la compilación aislada es:

```bash
pnpm exec vite build --config marketing/presentacion/vite.config.ts
```

La configuración usa base `/presentacion/`, salida `client/public/presentacion/` y `emptyOutDir: false` para conservar medios y rollback. Una recompilación futura puede generar nombres de JS/CSS distintos de los del release entregado; debe revisarse visualmente antes de sustituirlo. Retirar únicamente JS/CSS generados que ya no estén referenciados por el nuevo `index.html`, nunca archivos de la plataforma ni medios originales. Incluir fuentes y resultado aprobado juntos en la publicación autorizada.

El video activo es **`media/presentacion-20261124.mp4`** para evitar cachés de versiones anteriores. La ruta legacy **`media/presentacion.mp4` contiene exactamente el mismo archivo del 24 de noviembre**, para mantener enlaces previos. **`media/presentacion-20261108.mp4` se conserva sin sustituir como rollback**, pero no es referenciado por la página activa. El QR y la URL permanente no cambian al actualizar el video.

Huella SHA-256 del MP4 aprobado con narración: `3c0c6cdd6e01339ee41d320eb3864f5c35cfb8611a166139c3f1bef9a97d3061`. Huella SHA-256 del VTT aprobado: `d9dc94e3777ca9e3fa90d15b01b2a83885ff8f48ba7210f7cdc7daca58a530dc`. Los tests comerciales fijan ambas huellas para detectar una sustitución accidental del material aprobado y verifican metadatos MP4 de 40 segundos con pistas de video y audio, sin requerir FFmpeg en CI.

La fuente tipográfica se solicita a Google Fonts; si no está disponible, la página usa Arial. Es la dependencia externa de estilo prevista: la reproducción, los subtítulos, los contactos, la vCard y los cálculos locales no dependen de esa fuente ni de enlaces temporales de Manus.

## Validación de publicación y QR

Tras integrar fuentes y release aprobados, ejecutar las pruebas específicas sin alterar el motor ni sus tests:

```bash
pnpm exec vitest run --project unit server/__tests__/publicPresentation.test.ts server/__tests__/publicManagementAssessment.test.ts
```

Las pruebas comerciales verifican el orden y texto vigentes, ausencia de CTA inicial de autoevaluación, enlaces permanentes, resolución de JS/CSS y medios locales, metadatos de 40 segundos, MP4 y VTT aprobados, alias legacy y presencia del rollback, servicios y responsabilidades, nota ficticia/móvil, privacidad de las fuentes y enlaces voluntarios de contacto. Las pruebas independientes de autoevaluación conservan la validación de preguntas, umbrales, resultados y borrador local.

El responsable de integración ejecuta además `pnpm check` y `pnpm build` en el flujo de publicación. Después de una publicación autorizada, verificar en **https://isge360.com/presentacion/**: carga sin sesión, orden y aspecto aprobado en escritorio y celular, narración audible y subtítulos nuevos, MP4 reproducible con soporte de solicitudes Range/HTTP 206, vCard descargable y contactos correctos. Comprobar que no se consultan APIs empresariales ni se envían automáticamente respuestas de la autoevaluación.

Solo después generar o verificar el QR definitivo contra la página permanente. Un QR estático no vence por sí mismo; la continuidad depende de conservar dominio, HTTPS, hosting y ruta.
