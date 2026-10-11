# Diseño acordado: Reuniones manuales por proceso

**Fecha:** 14 de septiembre de 2026
**Estado:** Diseño funcional acordado para implementación local posterior a la reorganización de Caracterización.

## Propósito

Crear dentro de la Caracterización de Procesos una ventana de **Reuniones** que permita documentar reuniones, registrar y controlar acuerdos, vincular responsabilidades a otros procesos, agendar responsabilidades internas, generar un texto de acta y conservar archivos de respaldo.

La función debe priorizar una vista limpia: al abrir un tipo de reunión se verán las reuniones en una fila por cada una, y el detalle se desplegará sólo cuando el usuario lo solicite.

## Ubicación y alcance de las reuniones

Cada proceso administra sus propias reuniones desde:

> Caracterización de Procesos → Gestión operativa → Reuniones.

Las reuniones generales de la empresa se administrarán desde el proceso **Estrategia**. No se crea una zona empresarial independiente ni se bloquea a los Jefes de Proceso: cada Jefe conserva la posibilidad de gestionar las reuniones de su proceso.

## Estructura visual

| Nivel | Contenido | Comportamiento |
|---|---|---|
| 1 | Tipos de reunión | El usuario crea y ve tarjetas o filas plegables: por ejemplo, Staff, Reunión de área, Extraordinaria u Ocasional. |
| 2 | Reuniones concretas | Al abrir un tipo, se presentan reuniones específicas en una fila por reunión. |
| 3 | Detalle de reunión | Al desplegar una fila se muestran acuerdos, acta, archivos, edición, anulación y exportación. |

En la fila principal de una reunión se verá siempre: **fecha**, **nombre de la reunión** si fue registrado (o el objetivo como alternativa) y **porcentaje de cumplimiento**. Los demás controles quedarán agrupados y desplegables para evitar contaminación visual.

## Datos de una reunión

Cada reunión tendrá los siguientes datos:

| Campo o acción | Regla |
|---|---|
| Nombre de la reunión | Opcional; permite identificar y ordenar fácilmente reuniones del mismo tipo. |
| Fecha | Obligatoria. |
| Objetivo | Obligatorio. |
| Participantes | Opcional; texto libre. |
| Lugar o medio | Opcional; permite indicar presencial, Zoom, Meet, Teams u otro. |
| Acuerdos / pendientes | Cero o más filas estructuradas. |
| Porcentaje de cumplimiento | Acuerdos cumplidos ÷ acuerdos activos. Si no hay acuerdos activos, se mostrará «Sin acuerdos registrados». |
| Preparar acta | Genera un texto ordenado, revisable y copiable. No envía correos automáticamente. |
| Archivos | Permite subir y consultar uno o varios archivos de respaldo. |
| Editar | Permite modificar nombre, fecha, objetivo, participantes, lugar y otras notas. |
| Exportar / Descargar | Permitirá al usuario guardar en su computadora el acta y los archivos vinculados. |

## Acuerdos o pendientes

Cada acuerdo tendrá una fila propia con autosave y un selector obligatorio llamado **Tipo de responsable**. Esta selección evita que un acuerdo quede sin seguimiento o con un flujo de notificación incorrecto.

| Campo o acción | Regla funcional |
|---|---|
| Acuerdo / pendiente | Texto obligatorio. |
| Tipo de responsable | Obligatorio. Define uno de los tres flujos de responsabilidad descritos a continuación. |
| Responsable por nombre | Texto libre. Se conserva en todos los casos como referencia visible en el acta. |
| Fecha tope | Opcional, pero recomendada. |
| Cumplido | Estado manual. Su actualización modifica el porcentaje de la reunión. |
| Vincular | Crea o mantiene un compromiso en el proceso responsable cuando el acuerdo debe ser gestionado desde otro proceso o por el dueño del proceso actual. |
| Agendar | Cuando corresponde, incorpora el acuerdo al Cronograma consolidado del proceso que lo gestionará. |
| Evidencia | Se administra desde el compromiso vinculado cuando existe vínculo; en acuerdos internos se asociará al acuerdo o a su actividad agendada según el flujo implementado. |

### Tres flujos obligatorios de responsable

| Caso | Selección del usuario | Resultado esperado |
|---|---|---|
| **A. Empleado del mismo proceso, sin acceso a la plataforma** | Se marca «Empleado de este proceso» y se registra el nombre y correo del trabajador. | El empleado recibe por correo el acta de la reunión y sus compromisos sólo tras una acción explícita de envío. El acuerdo permanece visible dentro de la reunión para que el dueño del proceso controle su cumplimiento. No se crea un acceso a la plataforma ni un compromiso en otro proceso. |
| **B. Dueño del proceso donde se realiza la reunión** | Se marca «Dueño de este proceso». | El acuerdo se **autovincula** al mismo proceso: aparece en Compromisos vinculados y pasa a su Cronograma consolidado. El dueño del proceso puede actualizar cumplimiento y evidencia desde allí; todo se refleja en la reunión de origen. |
| **C. Dueño de otro proceso o empleado de otro proceso sin acceso** | Se marca «Otro proceso», se elige el proceso responsable y se registra el nombre de la persona responsable cuando corresponda. | El acuerdo se vincula al proceso seleccionado. El dueño de ese proceso lo encuentra en Compromisos vinculados y Cronograma consolidado, lo actualiza con evidencia y su avance se refleja en la reunión de origen. Si el trabajo se delega a uno de sus empleados sin acceso, el acta y compromiso se envían al correo informado sólo mediante una acción explícita, sin otorgar acceso. |

El correo automático se implementará sólo mediante el servicio de correo empresarial ya configurado y comprobado. Mientras el servicio no esté operativo, la plataforma debe mostrar que el correo está pendiente o permitir **copiar el acta** para enviarla manualmente; nunca debe simular un envío que no se realizó.

Cuando un acuerdo está vinculado, el cumplimiento y las evidencias se actualizan desde **Compromisos vinculados** del proceso responsable y se reflejan de vuelta en la reunión de origen. La reunión conservará visible qué proceso recibió el compromiso y su estado actual.

## Acta de reunión

La acción **Preparar acta** construirá un texto con:

1. Tipo y nombre de reunión, si se registró.
2. Fecha y objetivo.
3. Participantes, si fueron registrados.
4. Acuerdos agrupados por responsable.
5. Para cada acuerdo: descripción, fecha tope y estado.

El usuario podrá revisar el texto y usar **Copiar texto** para pegarlo en el correo o mensaje que enviará a los participantes. El acta quedará conservada como evidencia de la reunión, junto con sus archivos.

## Integridad, eliminación y conservación

| Situación | Acción disponible | Efecto |
|---|---|---|
| Reunión creada por error, sin acuerdos, archivos ni referencias | Eliminar | Borrado definitivo tras confirmación. |
| Reunión con acuerdos, archivos, vínculos o actividad histórica | Anular | Conserva el historial, la excluye de los indicadores activos y muestra claramente su estado anulado. |
| Reunión que se desea conservar fuera de la plataforma | Exportar / Descargar | Descarga el acta y los archivos disponibles para archivarlos localmente. |

Anular no debe borrar acuerdos que ya fueron vinculados ni actividades ya gestionadas. Los acuerdos pendientes de una reunión anulada deben quedar claramente identificados para que el usuario pueda decidir si los mantiene activos o los cancela de forma explícita.

## Permisos

Administrador, Gerente y Jefe de Proceso podrán gestionar reuniones dentro de los procesos a los que tengan acceso. Los Jefes sólo podrán vincular responsabilidades a procesos conforme a las reglas de acceso existentes y sólo gestionarán sus propios compromisos vinculados.

## Implementación por etapas

### Etapa 1: Reorganización visual de Caracterización

Reordenar los accesos existentes, sin migrar ni cambiar datos:

1. **Proceso y subprocesos:** Participantes, Recursos, Mapa de Subprocesos, Gestión con partes interesadas y Procedimientos.
2. **Objetivos tácticos de gestión:** FODA y Objetivos Tácticos de Gestión.
3. **Alineación estratégica:** Objetivos Tácticos Estratégicos.
4. **Gestión operativa:** Cumplimientos, Compromisos vinculados y Reuniones.
5. **Seguimiento y control:** Cronograma consolidado, Indicadores y Ciclos de planificación.

### Etapa 2: Reuniones manuales

Crear los modelos, pantallas y vínculos necesarios para tipos de reunión, reuniones, acuerdos, actas, archivos, porcentaje, agenda, anulación y exportación.

### Etapa 3: Importación preparada por el usuario

La importación se integra **dentro de un tipo de reunión existente**: se crea o abre el tipo, se elige **Nueva reunión** y luego la modalidad. No se pierde la clasificación inicial por tipos.

| Modalidad | Cuándo usarla | Insumo necesario | Resultado |
|---|---|---|---|
| **Registrar manualmente** | La reunión se administra directamente en ISGE. | Datos y acuerdos ingresados en pantalla. | Reunión y acuerdos manuales. |
| **Importar desde asistente** | El usuario ya tiene una herramienta como Read AI, Teams, Zoom, Fireflies u otra. | Dos bloques: **Resumen o reporte** y **Tareas / Action Items**. Un archivo de respaldo es opcional. | ISGE completa datos detectables y abre una lista editable de tareas propuestas. |
| **Importar con plantilla ISGE** | No se usa un asistente, o se prefiere un formato uniforme. | Una única plantilla Word oficial, que contiene nombre, datos, resumen y tabla de acuerdos. | ISGE lee cada celda de la plantilla y abre la misma lista editable de tareas propuestas. |
| **Conectar mi asistente** | Integración directa futura. | No disponible aún. | Sólo marcador informativo: no pide credenciales ni realiza conexiones. |

#### Regla crítica de aprobación

Ninguna tarea importada se vuelve un acuerdo ni se vincula a un proceso en el momento de leer un texto o subir una plantilla. ISGE muestra una **vista previa** por tarea, donde el usuario puede:

1. Editar la acción.
2. Elegir o corregir el tipo de responsable.
3. Seleccionar un proceso cuando corresponde.
4. Registrar nombre, correo, fecha límite y observaciones.
5. **Aprobar** o **rechazar** cada tarea.

Sólo las tareas que permanezcan aprobadas cuando se presiona **Confirmar reunión** se guardan como acuerdos oficiales. Si se selecciona dueño del mismo proceso u otro proceso, se crea el compromiso vinculado y aparece en el Cronograma consolidado durante esa misma confirmación. Rechazar una tarea no borra el reporte original.

#### Lectura sin IA externa

La importación no conecta ISGE con Read AI ni envía contenido a un modelo de IA externo. Para un texto libre, el sistema realiza una lectura local limitada de etiquetas conocidas —fecha, objetivo, participantes, lugar, resumen y secciones de acuerdos—. El resumen no se convierte por sí solo en tareas: se usa como contexto. Las tareas se toman de una sección explícita **Acuerdos**, **Compromisos**, **Tareas**, **Action Items** u otra lista de actividades que el usuario aporte.

La **plantilla Word oficial** elimina la ambigüedad de un Word libre: sus campos y columnas ya declaran qué representa cada dato. Es la opción recomendada cuando no se cuenta con un asistente de reuniones. La plantilla se publica como `client/public/plantillas/acta-reunion-isge.docx`; el script `scripts/generate-isge-meeting-template.py` permite regenerarla sin cambiar el formato funcional.

### Etapa futura opcional: IA o integración directa

Más adelante y sólo mediante una decisión explícita, una integración externa podría proponer transcripción o tareas. Debe requerir consentimiento, manejar las credenciales por usuario o empresa y conservar siempre la revisión y aceptación humana antes de crear compromisos.

## Reglas de experiencia de usuario

Todos los cambios de formularios y acuerdos se guardarán automáticamente. Los botones irreversibles o sensibles —eliminar, anular, vincular y descargar— requerirán una confirmación clara cuando corresponda.

No se iniciará el despliegue de estas nuevas mejoras hasta completar validación local y recibir autorización explícita.

## Registro de avance

### 14–17 de septiembre de 2026 — Reorganización y reuniones manuales

Se completó la reorganización visual de Caracterización y, posteriormente, el módulo manual de Reuniones. La interfaz quedó disponible en **Caracterización de Procesos → Gestión operativa → Reuniones**. Los tipos se archivan sin ocultar histórico; las reuniones soportan acuerdos locales, vínculos al mismo proceso u otro proceso, actas, archivos, porcentajes, anulación y exportación.

Los accesos validan empresa y proceso. Un Jefe administra sus reuniones y puede autovincular acuerdos internos, pero no asignar responsabilidades a otro proceso. Administrador y Gerente sí pueden vincular dentro de la empresa. Las rutas de archivos validan sesión, empresa y propiedad del proceso. No existen envíos de correo automáticos: **Enviar acta y compromiso** requiere acción explícita y sólo se marca como enviado si Amazon SES acepta la solicitud.

### 30 de septiembre de 2026 — Importación local inicial

Se incorporó **Importar desde asistente** como opción de Nueva reunión. Permitía pegar o cargar PDF, Word `.docx` o texto `.txt`; el servidor obtenía sólo texto para prellenar el formulario, y el archivo cargado podía adjuntarse como respaldo. Las reuniones conservan el origen `assistant_import` y una copia del reporte original, agregados de forma aditiva por `0089_meeting_assistant_import.sql`.

### 7 de octubre de 2026 — Importación estructurada y vista previa editable

Se completó localmente el flujo acordado para evitar transcripciones manuales duplicadas:

- **Resumen + tareas separadas:** un usuario de Read AI puede pegar el Summary como contexto y copiar la lista **Action Items** como tareas. Un reporte original puede adjuntarse, pero no es obligatorio para crear la reunión.
- **Plantilla ISGE única:** se añadió una plantilla Word descargable con nombre de reunión, fecha, hora, lugar, objetivo, participantes, resumen y una tabla de acuerdos. Un Word libre no se clasifica como plantilla; para ese caso se usa el flujo de asistente y el usuario revisa la propuesta.
- **Revisión individual:** las tareas quedan visibles antes de guardar, pueden editarse, aprobarse o rechazarse, y permiten elegir responsable, proceso, fecha y observaciones. No hay vínculos ni correos automáticos al leer el contenido.
- **Confirmación atómica:** sólo los acuerdos aprobados se crean junto a la reunión. Los seleccionados para dueño del mismo proceso u otro proceso se vinculan inmediatamente de forma transaccional a Compromisos vinculados y al Cronograma consolidado.
- **Nombre de reunión:** la migración exclusivamente aditiva `0090_process_meeting_titles.sql` incorpora un título opcional. Las reuniones históricas siguen funcionando y muestran el objetivo cuando no hay título.

La validación focalizada aprobó el tipado, las pruebas de lectura local, reconocimiento de tareas, extracción de plantilla, creación de acuerdos aprobados, restricción de procesos y vínculos al Cronograma. La plantilla Word fue generada, verificada estructuralmente y convertida a PDF de una página para comprobar su presentación. No se realizó commit, pull request, despliegue, conexión a Read AI, envío de correo ni modificación de producción.

> **Estado actual:** el cambio está listo para la validación integral y revisión local del usuario. Permanecerá local y no se desplegará sin una autorización explícita posterior.

### 8 de octubre de 2026 — Corrección de importaciones copiadas desde Word

La lectura local se amplió para reconocer listas de tareas copiadas desde Word, incluidas tablas con columnas separadas de **acción**, **responsable** y **fecha límite**, así como tareas numeradas con sus datos en líneas consecutivas. También se evita que encabezados como «Objetivos principales», «Tareas y acciones» o «Acciones identificadas» se conviertan accidentalmente en un nombre, objetivo o acuerdo.

Una lista de ocho filas debe mostrarse como ocho propuestas independientes antes de confirmar. La confirmación crea en una única operación todos los acuerdos que sigan aprobados. Si la plataforma temporal pierde la conexión con su servidor y no puede devolver una respuesta válida, muestra una instrucción clara para actualizar la página y comprobar primero si la reunión ya fue creada, en lugar de exponer el mensaje técnico de JSON.
