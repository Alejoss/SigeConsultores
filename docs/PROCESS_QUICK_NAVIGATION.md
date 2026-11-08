# Accesos directos entre Desempeño, indicadores y gestión del área

## Alcance autorizado

Mejora del 8 de noviembre de 2026 para revisión local antes de Producción. Complementa la medición real de Objetivos Estratégicos descrita en `STRATEGIC_OBJECTIVE_MEASUREMENT.md`. No agrega tablas, migraciones, endpoints ni permisos. Los indicadores y fórmulas anteriores permanecen iguales.

## Recorridos

| Origen | Acceso | Destino |
|---|---|---|
| Desempeño → OE | OTE por Área → área autorizada | Indicador de OTE de esa área |
| Indicador de OTE | Volver a OE | Panel OE de Desempeño, conservando la pestaña de origen |
| Indicador de OTE | Ir a OTE | Planificación de OTE de la misma área |
| Planificación OTE | Ir a Indicadores OTE | Indicador OTE |
| Matriz OTG | Ir a Indicadores OTG | Indicador OTG |
| Gestión con Partes Interesadas | Ir a Indicadores de Partes Interesadas | Indicador de Partes Interesadas |
| Actividades / Compromisos Vinculados | Ir a Indicadores del Área | Resumen de indicadores del área |
| Las cinco páginas de gestión anteriores | Ir a Cronograma Consolidado | Cronograma del mismo proceso |

Se utilizan las rutas existentes. Los parámetros contienen empresa y proceso explícitos. Los valores `view=oe`, `tab=areas` y `panel=ote` abren directamente la vista solicitada. `oeReturnTab` solo admite valores conocidos; nunca se utiliza un URL externo como destino de retorno. Al navegar se actualizan únicamente las claves de selección de empresa/proceso/nombre utilizadas por páginas antiguas; no se modifican cuentas, sesiones, roles ni autorizaciones.

## Permisos

El listado de áreas utiliza `processMap.list`, que filtra por la sesión del servidor: Gerencia consulta su empresa y un jefe consulta únicamente su proceso. Los botones compartidos verifican el proceso mediante `processMap.get`; esperan una respuesta autorizada y empresa coincidente antes de habilitarse. No se concede acceso a procesos ajenos ni se amplían permisos de edición. Los endpoints existentes conservan sus validaciones.

## Guardados antes de saltar

`ProcessQuickNavigation` hace blur del campo activo, permite consolidar el estado local y espera los guardados específicos y las mutaciones pendientes. Impide doble navegación y permanece en la página si falla un guardado o se agota la espera. Cada pantalla completa sus debounces/colas existentes sin crear un formulario o borrador nuevo automáticamente:

- **OTE:** serializa la planificación pendiente y las colas narrativas. Las ediciones narrativas usan únicamente `saveNarratives`, sin recalcular ni sobrescribir métricas. Una tarjeta colapsada no pierde su cola pendiente.
- **OTG:** completa el debounce de la matriz y espera las escrituras onBlur; no guarda una matriz histórica intacta al abrirla o navegar.
- **Partes Interesadas:** comparte la promesa del lote activo, acumula errores y confirma únicamente una firma guardada completa; los borradores pendientes y los errores permanecen disponibles para reintento.
- **Actividades:** completa solo la edición existente pendiente, incluyendo fechas y recurrencia. El alta continúa siendo explícita.
- **Compromisos:** espera escrituras onBlur y evidencia; bloquea la salida si quedan errores o un formulario nuevo aún no agregado. No crea compromisos ni envía evidencias automáticamente.

El comportamiento existente de los botones antiguos se conserva salvo que reutilicen la misma salida segura de la página. La garantía se aplica a los accesos directos incorporados; no es una nueva protección global contra cerrar el navegador.

## Retorno al cronograma

La selección de mes, año y Gantt se conserva en `sessionStorage` por empresa y proceso. El acceso al cronograma incluye `restore=1`; únicamente restaura una estructura validada. No se guarda información de tareas en este estado ni se modifican fechas, avances o registros del servidor. Las identidades persistentes de tareas del enlace Gantt se conservan.

## Revisión y respaldo

Servidor local 3001 y base exclusivamente ficticia `sige_oe_review_20261108`, sin cron, correo ni almacenamiento productivo. Se añadió el área independiente «Navegación — prueba ficticia» con un OTE, una tarea y una actividad de ejemplo. Una huella antes/después verificó que los OE y OTE de revisión anteriores no se modificaron al preparar estos ejemplos. No se consultó ni modificó información de Agrogana o de otras empresas reales.

Comprobaciones realizadas: TypeScript, build cliente/servidor, 865 pruebas unitarias/cliente aprobadas, navegador con recorridos completos de las cinco pantallas, escritura y salto inmediato sin recalcular OTE, Gantt → tarea → cronograma, y vistas de 390 px sin desbordamiento. Las capturas y resultados se conservan fuera del código en `/home/ubuntu/local-checkpoints/direct-navigation-review-20261108/`.

No se realizó commit, push, PR ni despliegue. El respaldo de medición OE anterior permanece separado; el nuevo respaldo contiene únicamente el incremento de navegación sobre esa base. Un futuro despliegue combinado requiere autorización, actualización de main y las verificaciones operativas habituales. Excluir lanzadores privados, claves, dependencias enlazadas y scripts/datos sintéticos de revisión de cualquier publicación.

## Extensión: las cuatro secciones por área

OTG, Gestión con Partes Interesadas, Sistemas de Gestión y Desempeño de Personal cuentan con las pestañas Resumen general y su correspondiente acceso por Área. Los listados utilizan exclusivamente `processMap.list` autorizado. OTG/GPI abren su indicador existente y permiten volver a la misma pestaña o ir a la página de gestión. SIG muestra responsabilidades ya vinculadas al proceso, filtradas por fuentes SIG; no inventa un KPI global por área ni atribuye capacitaciones corporativas a un proceso. Personal muestra el dashboard existente de Participantes y sus trabajadores/KPI, en solo lectura. El proceso se valida antes de consultar detalles.

Las rutas conservan `view`, `tab` y `area` solo con valores internos admitidos; recargar o volver mantiene la sección correspondiente. Nuevas comprobaciones: cuatro recorridos de Gerencia en escritorio y 390 px, listado restringido del jefe en las cuatro secciones y bloqueo de enlaces manipulados a SIG/Personal ajenos. Suite final: 902 pruebas unitarias/cliente y 247 de integración en base ficticia; TypeScript y compilación correctos.
