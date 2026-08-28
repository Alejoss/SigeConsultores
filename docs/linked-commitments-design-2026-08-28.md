# Diseño de Compromisos vinculados

## Propósito

Permitir que una acción planificada o una vigencia prescrita de Sistemas de Gestión, Programas o Cumplimientos se asigne a uno o varios procesos del Mapa de Procesos. Cada Jefe de Proceso verá y gestionará sus compromisos en una nueva ventana de Caracterización, sin perder la trazabilidad de su origen ni duplicar datos.

## Principios de seguridad y usabilidad

- Los registros de origen no se eliminan ni se reemplazan. Los vínculos son registros adicionales.
- La sincronización funciona con referencias al origen, no con copias desconectadas.
- Un compromiso vinculado a varios procesos sólo se considera cerrado en el origen cuando todos los procesos asignados cumplieron su parte.
- El Jefe de Proceso puede trabajar sólo compromisos de su propio proceso. No puede cambiar el origen ni asignarlos a otros procesos.
- Las evidencias se almacenan mediante carga multipart y se guardan con metadatos de archivo, sin serializar archivos en el navegador.
- Las actividades creadas directamente por el Jefe son independientes, pero siempre aparecen en Cronograma Consolidado.

## Cambios visibles

### Sistemas de Gestión

Los campos actuales de responsable humano se conservarán como texto opcional de referencia, sin listas de Nómina. Junto a cada acción del bloque Planificar y junto al bloque Vigente aparecerá el botón **Vincular**. El diálogo mostrará los procesos de la empresa y permitirá seleccionar uno, varios o todos.

### Programas

Cada programa dispondrá de actividades estructuradas de planificación. Cada actividad tendrá fecha, estado, responsable de referencia y botón Vincular. Los archivos de planificación siguen siendo documentos de respaldo, sin ser modificados.

### Cumplimientos

Cada obligación empresarial podrá vincularse a uno o varios procesos. Si se controla por vigencia, el vínculo permitirá renovar la fecha de vigencia desde el proceso. Si se controla por meses o acción, se cerrará desde la tarea vinculada.

### Caracterización de Procesos

Se añadirá el módulo **Compromisos vinculados**. Tendrá dos secciones:

1. **Recibidos desde Sistemas de Gestión, Programas y Cumplimientos**, agrupados por origen.
2. **Planificación propia del proceso**, para crear actividades que no nacen en otro módulo.

Cada compromiso mostrará origen, descripción, fecha objetivo, estado, evidencia y acción permitida. Los de vigencia permitirán registrar una fecha de renovación; las tareas permitirán marcar Cumplido y adjuntar evidencias.

## Modelo de datos

### linkedCommitments

Un registro por proceso de destino. Campos principales:

- `companyId`, `processId` y `sourceType`.
- `sourceId` y `sourceSubId` para apuntar al estándar, acción de programa, acción del checklist o cumplimiento de origen.
- `kind`: `action`, `vigency` o `own`.
- Título, detalle, fecha de vencimiento y responsable de referencia.
- Estado, fecha de cumplimiento, fecha de vigencia renovada y notas del proceso.
- Marca para actividad propia sin origen.

Una restricción única evita que la misma fuente se asigne dos veces al mismo proceso.

### linkedCommitmentEvidence

Permite varias evidencias por compromiso, guardando nombre, clave de almacenamiento, URL temporal, tipo, tamaño y fecha de carga.

### programActions

Representa actividades individuales de Programas para que puedan tener fecha, estado y vínculos. Las métricas existentes de acciones planificadas y realizadas se preservan y se actualizarán de forma compatible cuando el programa tenga actividades estructuradas.

## Reglas de sincronización

| Origen                   | Evento en Compromisos vinculados                                       | Resultado en origen                                                                                                         |
| ------------------------ | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Acción de checklist      | Todos los procesos vinculados marcan Cumplido.                         | La acción de checklist se marca cumplida y el estándar recalcula implementación.                                            |
| Vigencia de checklist    | Todos los procesos vinculados registran una renovación vigente.        | La vigencia del estándar se actualiza con la fecha más temprana de los procesos, para mantener el criterio más conservador. |
| Acción de Programa       | Todos los procesos vinculados cierran su tarea.                        | La acción del programa se marca cumplida y actualiza las métricas del programa.                                             |
| Cumplimiento empresarial | Todos los procesos vinculados cierran la tarea o renuevan la vigencia. | La obligación actualiza su estado o vigencia y recalcula su porcentaje.                                                     |
| Actividad propia         | El Jefe la cierra.                                                     | No cambia ningún módulo externo; aparece en Cronograma Consolidado.                                                         |

## Cronograma Consolidado y alertas

La fuente común `consolidatedScheduleActivities` incorporará los compromisos vinculados y la planificación propia con el badge **Compromisos vinculados**. Así los pendientes aparecerán en el calendario, exportación y alertas semanales sin crear una segunda agenda.

## Compatibilidad

Los archivos de certificación, checklist original, documentación de Programas, planificaciones y evidencias de Cumplimientos permanecen sin cambios. Las migraciones serán aditivas: sólo crean nuevas tablas e índices y no eliminarán ni transformarán registros existentes.
