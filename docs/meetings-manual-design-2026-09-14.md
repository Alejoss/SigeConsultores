# Diseño acordado: Reuniones manuales por proceso

**Fecha:** 14 de septiembre de 2026
**Estado:** Diseño funcional acordado para implementación local posterior a la reorganización de Caracterización.
**Fuera de alcance por ahora:** Integración con Read AI, grabación, transcripción automática, importación de acuerdos por IA y envío automático de correos.

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

En la fila principal de una reunión se verá siempre: **fecha**, **objetivo** y **porcentaje de cumplimiento**. Los demás controles quedarán agrupados y desplegables para evitar contaminación visual.

## Datos de una reunión

Cada reunión tendrá los siguientes datos:

| Campo o acción | Regla |
|---|---|
| Fecha | Obligatoria. |
| Objetivo | Obligatorio. |
| Participantes | Opcional; texto libre. |
| Lugar o medio | Opcional; permite indicar presencial, Zoom, Meet, Teams u otro. |
| Acuerdos / pendientes | Cero o más filas estructuradas. |
| Porcentaje de cumplimiento | Acuerdos cumplidos ÷ acuerdos activos. Si no hay acuerdos activos, se mostrará «Sin acuerdos registrados». |
| Preparar acta | Genera un texto ordenado, revisable y copiable. No envía correos automáticamente. |
| Archivos | Permite subir y consultar uno o varios archivos de respaldo. |
| Editar | Permite modificar fecha, objetivo, participantes, lugar y otras notas. |
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
| **A. Empleado del mismo proceso, sin acceso a la plataforma** | Se marca «Empleado de este proceso» y se registra el nombre y correo del trabajador. | El empleado recibe por correo el acta de la reunión y sus compromisos. El acuerdo permanece visible dentro de la reunión para que el dueño del proceso controle su cumplimiento. No se crea un acceso a la plataforma ni un compromiso en otro proceso. |
| **B. Dueño del proceso donde se realiza la reunión** | Se marca «Dueño de este proceso». | El acuerdo se **autovincula** al mismo proceso: aparece en Compromisos vinculados y pasa a su Cronograma consolidado. El dueño del proceso puede actualizar cumplimiento y evidencia desde allí; todo se refleja en la reunión de origen. |
| **C. Dueño de otro proceso o empleado de otro proceso sin acceso** | Se marca «Otro proceso», se elige el proceso responsable y se registra el nombre de la persona responsable cuando corresponda. | El acuerdo se vincula al proceso seleccionado. El dueño de ese proceso lo encuentra en Compromisos vinculados y Cronograma consolidado, lo actualiza con evidencia y su avance se refleja en la reunión de origen. Si el trabajo se delega a uno de sus empleados sin acceso, el acta y compromiso se envían al correo informado sin otorgar acceso a la plataforma. |

El correo automático se implementará sólo mediante el servicio de correo empresarial ya configurado y comprobado. Mientras el servicio no esté operativo, la plataforma debe mostrar que el correo está pendiente o permitir **copiar el acta** para enviarla manualmente; nunca debe simular un envío que no se realizó.

Cuando un acuerdo está vinculado, el cumplimiento y las evidencias se actualizan desde **Compromisos vinculados** del proceso responsable y se reflejan de vuelta en la reunión de origen. La reunión conservará visible qué proceso recibió el compromiso y su estado actual.

## Acta de reunión

La acción **Preparar acta** construirá un texto con:

1. Tipo de reunión.
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

### Etapa futura opcional: IA

Se conservará una arquitectura extensible para que, más adelante y sólo si se decide, una integración externa pueda proponer una transcripción o acuerdos. La creación de compromisos desde IA deberá requerir siempre revisión y aceptación humana.

## Reglas de experiencia de usuario

Todos los cambios de formularios y acuerdos se guardarán automáticamente. Los botones irreversibles o sensibles —eliminar, anular, vincular y descargar— requerirán una confirmación clara cuando corresponda.

No se iniciará el despliegue de estas nuevas mejoras hasta completar validación local y recibir autorización explícita.

## Registro de avance de la primera mejora

**14 de septiembre de 2026 — validación local inicial.** Se implementó únicamente la reorganización visual de Caracterización. Datos generales permanece como acceso principal y la navegación se agrupa en cinco bloques plegables: Proceso y subprocesos, Objetivos tácticos de gestión, Alineación estratégica, Gestión operativa y Seguimiento y control. La comprobación visual local en Producción: Yambo confirmó que los grupos y sus módulos se presentan correctamente. Esta mejora no modificó la base de datos, rutas ya existentes, permisos ni datos de procesos. El acceso Reuniones aparece como marcador informativo y no registra datos; su implementación funcional permanece fuera de esta primera mejora.

**Verificación de navegación.** Se comprobó localmente que el grupo «Objetivos tácticos de gestión» se expande correctamente y que su acceso FODA conserva la ruta existente con el contexto del proceso y empresa (`processId` y `companyId`). No se realizaron guardados ni cambios de datos durante la prueba.

**Verificación de Gestión operativa.** Se comprobó localmente que Cumplimientos, Compromisos vinculados y el marcador de Reuniones quedan agrupados bajo «Gestión operativa». Al seleccionar Reuniones se presenta únicamente una nota informativa de alcance futuro; no se crea ninguna reunión, no se escribe en la base de datos y no se altera información de Yambo.

**Verificación de Seguimiento y control.** Se comprobó localmente que Seguimiento y control despliega Cronograma consolidado, Indicadores y Ciclos de planificación. El acceso Cronograma consolidado conserva tanto su ruta como el contexto de Producción: Yambo y presentó las siete actividades ya existentes sin modificación alguna. La reorganización es exclusivamente visual.

## Validación técnica de la primera mejora

**14–15 de septiembre de 2026.** La reorganización visual fue validada localmente con los siguientes resultados:

| Validación | Resultado |
|---|---|
| Tipado (`pnpm check`) | Aprobado sin errores. |
| Compilación de producción (`pnpm build`) | Aprobada. |
| Suite general (`pnpm test --run`) | Aprobada: 55 archivos y 543 pruebas. |
| Revisión de cambios (`git diff --check`) | Sin errores de espacios ni formato. |
| Navegación visual local | Aprobada en Producción: Yambo; se verificaron Datos generales, los cinco grupos plegables, FODA, Gestión operativa, Reuniones informativas y Cronograma consolidado. |

La lista de archivos locales de esta primera mejora se limita a la pantalla `client/src/pages/ProcessCharacterization.tsx` y a este documento de diseño y registro. No se modificó el esquema de base de datos, routers, permisos, procesos, caracterizaciones, cronogramas ni datos de usuarios. No se realizó despliegue.

## Ajustes visuales solicitados y verificados

**15 de septiembre de 2026.** Se aplicaron y comprobaron localmente los siguientes ajustes a la primera mejora:

| Solicitud | Resultado local |
|---|---|
| Recuadros con celeste más visible y sobrio | Aplicado: los cinco grupos usan fondo celeste y borde celeste, en consonancia con las celdas informativas de Datos generales. |
| Grupos cerrados al abrir | Aplicado: Proceso y subprocesos y los demás grupos inician cerrados. |
| Dibujo gráfico junto a cada grupo | Aplicado: cada grupo cuenta con un icono lineal sobrio y coherente con la estética de Gestión Empresarial. |
| Nombre del tercer grupo | Aplicado: «Alineación estratégica» fue sustituido por «Objetivos tácticos estratégicos». El acceso interior se nombra «Gestionar objetivos estratégicos» para evitar una repetición visual innecesaria. |

Se comprobó que «Objetivos tácticos estratégicos» se abre correctamente y conserva su acceso interno. La modificación continúa siendo exclusivamente visual y no altera información persistida.

**Validación técnica de los ajustes del 15 de septiembre de 2026.** Tras aplicar color, iconos, estado cerrado inicial y el nuevo nombre del grupo, `pnpm check` aprobó sin errores, `pnpm build` aprobó y `pnpm test --run` aprobó con 55 archivos y 543 pruebas. No se realizó ninguna operación de escritura sobre datos de negocio ni despliegue a producción.

## Registro de avance de la segunda mejora: Reuniones manuales

**17 de septiembre de 2026 — implementación local completa, pendiente de revisión funcional del usuario.** Se implementó exclusivamente en el entorno local el módulo manual **Reuniones**. No se creó un despliegue, commit, pull request ni se ejecutó ninguna operación sobre producción. La migración aditiva `0086_manual_process_meetings.sql` se aplicó sólo a la base local aislada y creó las cinco tablas nuevas para tipos, reuniones, acuerdos, archivos y evidencias. También amplió el enum de `linkedCommitments` con `meeting_agreement`, sin eliminar ni transformar registros previos. Una verificación posterior confirmó las cinco tablas, el enum esperado y cero registros de negocio en las tablas nuevas.

La interfaz quedó disponible en **Caracterización de Procesos → Gestión operativa → Reuniones**. La vista presenta tipos de reunión plegables, reuniones compactas con fecha, objetivo y porcentaje de cumplimiento, y detalles desplegables. Los tipos pueden archivarse para dejar de recibir reuniones nuevas sin ocultar el histórico. La reunión conserva fecha, objetivo, participantes, lugar o medio, notas, acta editable y archivos. Los campos ordinarios se guardan automáticamente al salir de cada control; los cambios de responsable, la vinculación, la anulación, la eliminación, el envío de correo y el borrado de archivos piden confirmación explícita.

Los acuerdos implementan los tres flujos definidos. Un empleado del proceso sin acceso mantiene su acuerdo local y puede recibir el acta únicamente mediante una acción explícita de envío. El dueño del proceso genera un compromiso autovinculado para su mismo proceso. Un acuerdo asignado a otro proceso crea exactamente un compromiso vinculado en el proceso elegido. No se creó una agenda paralela: el Cronograma consolidado continúa leyendo `linkedCommitments`, por lo que los acuerdos autovinculados o externos aparecen allí de forma automática. Cuando el responsable marca cumplido un compromiso desde **Compromisos vinculados**, el estado se sincroniza de vuelta al acuerdo de la reunión. La interfaz ahora identifica dichos registros como **Reunión · Acuerdo**.

La seguridad conserva las reglas existentes. Todo acceso valida empresa y proceso. Un Jefe puede administrar reuniones de su proceso y autovincular acuerdos internos, pero no puede asignar responsabilidades a otro proceso ni consultar las reuniones o compromisos de un proceso diferente. Administrador y Gerente pueden realizar la vinculación externa dentro de su empresa. Se rechazan procesos de otra empresa. La reasignación de un acuerdo con avance o evidencias vinculadas se bloquea para no destruir historial.

Los archivos usan almacenamiento de objetos y rutas multipart separadas de las evidencias de Compromisos vinculados. Se aceptan PDF, imágenes, Word y Excel, con un máximo de 50 MB por archivo. Cada carga valida sesión, empresa y propiedad del proceso. Los archivos y evidencias de reuniones anuladas se conservan y no se pueden modificar ni eliminar. Una reunión sólo puede borrarse si está totalmente vacía; cuando ya contiene datos debe anularse. La anulación deja visible el registro histórico y no borra acuerdos ni compromisos vinculados.

La comunicación implementada es verificable. No existen envíos automáticos ni pruebas de correo. La acción **Enviar acta y compromiso** llama a `sendEmailStrict` y sólo registra el estado `sent` cuando Amazon SES acepta el mensaje. Si falta correo o SES no confirma el envío, queda `failed` y la interfaz indica que se copie el acta para realizar el envío manual. La revisión automática no ejecutó esta acción ni envió correos.

## Validación local de Reuniones

**17 de septiembre de 2026.** Se añadió una prueba de integración aislada que crea y limpia empresa y procesos temporales. Verifica creación de tipo, reunión y acta; acuerdo local; autovinculación; vínculo a otro proceso; ausencia de vínculos duplicados; presencia en Cronograma consolidado; retorno de cumplimiento; prohibición de asignación externa por Jefe; aislamiento entre empresas; eliminación de reunión vacía; anulación con conservación histórica; y bloqueo de consulta de otro proceso. La prueba específica aprobó **8 de 8** escenarios. La suite de integración completa aprobó **31 archivos y 137 pruebas**. También aprobaron el tipado, la compilación de producción y la suite general. La comprobación final de la base local confirmó **0** tipos, reuniones, acuerdos, archivos, evidencias o empresas de prueba remanentes.

La ruta local respondió correctamente y mostró la pantalla de autenticación de ISGE 360. La sesión de navegador disponible no tenía inicio de sesión, por lo que la inspección visual de la interfaz protegida queda pendiente de la revisión local autenticada del usuario. No se ingresaron credenciales, no se crearon datos reales y no se realizaron envíos de correo en esa comprobación.

> **Estado actual:** Reuniones está lista para revisión local autenticada. Permanecerá sin commit, sin pull request y sin despliegue hasta recibir una autorización explícita posterior del usuario.
