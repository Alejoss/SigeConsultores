# Propuesta inicial: Gestión de Cambios en ISGE 360

## Mi opinión

La propuesta es sólida y tiene mucho valor práctico. Convierte cambios que suelen manejarse por mensajes, reuniones o documentos aislados en un registro vivo: se explica por qué se hará el cambio, quién se afecta, qué se debe hacer, quién responde, cómo avanza y si finalmente dio el resultado esperado.

Además, está alineada con la lógica de ISO 9001:2026. La nueva edición fue publicada el 16 de septiembre de 2026 y pone mayor atención en liderazgo, riesgos y oportunidades para tomar mejores decisiones. La estructura armonizada de los sistemas de gestión indica que los cambios necesarios deben realizarse de forma planificada y que el sistema debe conservar sus resultados previstos durante y después del cambio. [ISO 9001:2026](https://www.iso.org/news/2026/09/ISO9001-2026) [Estructura armonizada ISO/IEC, cláusula 6.3](https://www.iso.org/cms/render/live/en/sites/isoorg/home.isoDocumentsDownload.do?t=2EVmNRpfMEK8NcTL_uoAJceDlxYmmqpQWNk3r1MeLNWCXk6i10vZ-R5FEjIK-UOe)

No conviene que sea un formulario obligatorio y extenso para cualquier ajuste cotidiano. Por ejemplo, cambiar una fecha de una actividad normal debe seguir en **Actividades**. En cambio, implementar un software nuevo, modificar un proceso, trasladar una operación, cambiar una responsabilidad clave, atender un requisito legal o responder a un riesgo relevante sí debe usar **Gestión de cambios**.

## Ubicación y nombre

Recomiendo ubicarla en **Gestión Empresarial → Estrategia**, inmediatamente después de **Objetivos Estratégicos**. Aunque muchos cambios nacen en la operación o en el cumplimiento legal, su gestión es corporativa y transversal: puede afectar varios procesos, personas, recursos, riesgos, documentos e indicadores. Por eso no debe pertenecer solamente a un proceso ni solamente a Sistemas de Gestión.

El nombre recomendado para la nueva tarjeta es **Gestión de cambios**. En la lista se verá cada registro como un “cambio”; por ejemplo, “Implementación del sistema de ventas y facturación”.

## Diseño recomendado

Cada cambio tendría una ficha compuesta por seis pasos simples. El usuario podría avanzar por pasos, pero los datos se guardarían automáticamente mientras los escribe, sin botones de guardado manual.

1. **Definir el cambio.** Nombre, descripción, motivo, objetivo, resultado esperado, origen del cambio y fecha prevista. El origen permitiría identificar si nace de estrategia, auditoría, riesgo u oportunidad, requisito legal, cliente, tecnología, mejora interna u otro motivo.

2. **Determinar el alcance.** Se seleccionan, cuando correspondan, el objetivo estratégico relacionado, los procesos involucrados, puestos de trabajo o personas afectadas, partes interesadas, riesgos y oportunidades. La mayoría de esos datos vendrán de registros ya existentes en ISGE 360, evitando volver a escribirlos.

3. **Evaluar impacto.** Se conservan las categorías que propusiste: calidad; ambiente; seguridad y salud en el trabajo; cumplimiento legal; recursos e infraestructura; tecnología; competencias y capacitación; información y documentación; riesgos y oportunidades; sistemas de gestión; control y seguridad BASC; y “otro” con explicación. Añadiría una valoración breve de impacto: bajo, medio o alto. Esto ayuda a decidir si basta un plan simple o si exige responsables, evidencias y aprobación formal.

4. **Planificar acciones.** Cada acción tendrá descripción, responsable, recurso requerido, fecha prevista, capacitación necesaria, documento o proceso que debe actualizarse y evidencia esperada. Las acciones no se quedarán únicamente dentro del formulario: al asignarlas a un proceso se crearán como compromisos vinculados y aparecerán en **Compromisos vinculados**, **Cronograma consolidado** e **Indicadores** del proceso responsable, igual que las vinculaciones que ya existen en la plataforma.

5. **Ejecutar y verificar.** Las acciones tendrán porcentaje o estado, avances, observaciones y archivos de evidencia. El cambio completo seguirá esta secuencia: **Borrador → En evaluación → Aprobado / Planificado → En ejecución → Implementado, pendiente de verificación → Cerrado**. Si se cancela o no se ejecuta, se pedirá una explicación. Al verificar, se registrará si el resultado fue efectivo, parcialmente efectivo o no efectivo; sus efectos positivos y negativos; riesgos u oportunidades nuevos; y acciones adicionales, si hacen falta.

6. **Cerrar.** El responsable que aprueba registrará el resultado final, fecha de cierre y evidencia final. El expediente conservará un historial de fechas, cambios de estado, asignaciones y cierres. Eso facilita tanto la gestión diaria como una auditoría.

## Responsabilidades y permisos

La creación del cambio será una decisión de Gerencia: sólo el **Gerente** y el **Coordinador de empresa** podrán crear una Gestión de cambio. Antes de crearla, Gerencia podrá convocar la reunión que corresponda al tamaño e impacto de la decisión. Los Jefes de Proceso aportarán información y podrán sugerir la necesidad de un cambio, pero no abrirán formalmente el expediente por sí mismos.

El cambio no tendrá que ser administrado diariamente por el Gerente. Al crearlo, Gerencia seleccionará un **Responsable de gestión del cambio**. Si el cambio se concentra en un proceso, lo normal será seleccionar al Jefe de ese proceso. Si es transversal, podrá ser otro Jefe, el Coordinador o el propio Gerente.

No recomiendo abrir la edición de todos los cambios a todos los Jefes. Es más simple y seguro crear un permiso específico dentro de cada expediente: el responsable asignado podrá actualizar el plan, impulsar acciones, registrar avances, solicitar información y preparar la verificación; los demás Jefes podrán abrir y consultar los cambios de la empresa, y gestionar las acciones que estén vinculadas a sus propios procesos. De esta manera, todos tienen visibilidad sin que cualquier persona pueda modificar la decisión o el alcance corporativo.

El reparto final será:

- El **Gerente** podrá crear, aprobar el inicio, cambiar decisiones de alto nivel, cancelar y autorizar el cierre. El cierre será siempre una decisión del Gerente, para mantener objetividad y asegurar su participación en las decisiones importantes de la empresa.
- El **Coordinador de empresa** podrá crear cambios, completar su diseño y apoyar la gestión corporativa, pero no podrá autorizar el cierre final.
- El **Responsable de gestión del cambio** podrá administrar el trabajo cotidiano de ese expediente. No podrá cerrar unilateralmente el cambio ni otorgar permisos a otras personas.
- El **Jefe de Proceso estándar** podrá consultar los cambios de su empresa y gestionar solamente las acciones vinculadas a su propio proceso: actualizar avance, marcar cumplimiento y adjuntar evidencia. Si además es Responsable de gestión de un cambio concreto, podrá editar ese expediente dentro de los límites anteriores.
- Un empleado sin acceso a ISGE podrá ser registrado como responsable de una acción. Su jefe de proceso podrá cargar el avance y la evidencia por él. En una etapa posterior se podrá notificar por correo, siempre que el servicio de correo de la empresa esté configurado.

## Enlaces que conviene incorporar desde el inicio

El núcleo inicial debe vincular Objetivos Estratégicos, procesos, **subprocesos**, responsables, puestos de trabajo, partes interesadas, riesgos y oportunidades. El proceso seguirá siendo el responsable operativo de una acción y el subproceso permitirá precisar dónde impacta el cambio. Esto mantiene la asignación clara incluso si un subproceso no tiene un responsable independiente.

Desde la primera versión, el cambio tendrá al menos un **indicador de resultado**. El usuario podrá vincular un indicador ya existente en ISGE 360 o definir una medida propia para ese cambio. La ficha guardará el valor inicial, la meta, la fecha o periodo comprometido y el resultado alcanzado al verificar. Así, el cierre no dependerá sólo de una opinión: se podrá mostrar si el cambio produjo el efecto esperado.

Para no convertir la primera versión en un proyecto excesivamente grande, los vínculos profundos con Capacitaciones, documentos y requisitos legales se realizarán inicialmente como campos y acciones vinculadas. Después se puede hacer una segunda etapa en la cual una acción de “capacitación necesaria” cree o relacione directamente una capacitación corporativa, y una acción de “actualizar documento” enlace al documento específico.

Cada vínculo debe ser doble: una conexión al registro vivo de ISGE 360 y una copia histórica de su nombre y datos relevantes al momento de aprobar el cambio. Así, si más adelante se cambia el nombre de un proceso, se actualiza un objetivo o se retira un puesto, el expediente conserva fielmente qué se aprobó y qué se analizó en esa fecha.

En el caso de personas, conviene ofrecer tres formas de asignar cada acción: dueño del proceso seleccionado; otro jefe de proceso; o trabajador sin acceso a la plataforma. Es el mismo criterio que ya funciona en Reuniones y Compromisos vinculados.

## Tablero principal

La página principal de Gestión de cambios debería mostrar una lista clara, no sólo formularios. Cada cambio puede presentar nombre, estado, responsable, fecha comprometida, porcentaje de acciones cumplidas, procesos y subprocesos afectados, indicador de resultado y una alerta si está vencido. Arriba habría filtros por estado, proceso, responsable, nivel de impacto y año. Esto permitiría al Gerente ver de un vistazo qué cambios están detenidos y a cada Jefe ubicar sus propios compromisos.

## Ejemplo aplicado

Para “Implementación de un nuevo sistema informático de ventas y facturación”, el Gerente crea el cambio y lo relaciona con el objetivo estratégico de eficiencia comercial. Selecciona Comercial y Servicio, Facturación y Atención al Cliente; marca impacto en tecnología, competencias, información, recursos y riesgos; y registra las acciones.

La acción “capacitar a usuarios de Comercial” se vincula al proceso Comercial. La acción “actualizar procedimiento de facturación” se vincula a Facturación. Cada dueño verá únicamente su actividad en su agenda y adjuntará evidencia al completarla. Una vez terminado el plan, el Gerente compara el resultado con el esperado, por ejemplo el tiempo de facturación antes y después del cambio, y decide si el cambio puede cerrarse.

## Acuerdos de diseño ya tomados

1. Sólo el Gerente y el Coordinador de empresa podrán crear cambios. Los Jefes sugieren el cambio y participan en las decisiones, pero la apertura formal parte de Gerencia.
2. El Gerente será el único que podrá autorizar el cierre final.
3. La primera versión incorporará un indicador de resultado desde el inicio, con valor inicial, meta y resultado alcanzado.
4. Los cambios de impacto bajo tendrán una ficha abreviada. Los de impacto medio o alto requerirán la ficha completa, con planificación, responsables, evidencia y verificación.
5. El alcance incluirá tanto procesos como subprocesos.
6. Las categorías de impacto incluirán también **Sistemas de gestión** y **Control y seguridad BASC**, además de las categorías ya acordadas.

La implementación se hará con migraciones aditivas y nuevas tablas, sin borrar ni transformar registros actuales de las empresas.
