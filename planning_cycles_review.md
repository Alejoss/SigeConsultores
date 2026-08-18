# Revisión actualizada — Sistema de Ciclos de Planificación

## Conclusión ejecutiva

La propuesta de julio es **correcta en su objetivo**: cada empresa debe poder cerrar un período, conservar su evidencia histórica y abrir el siguiente ciclo sin arrastrar tareas ya cumplidas ni perder información. Sin embargo, después de las mejoras recientes de ISGE 360 conviene ajustar el alcance. El sistema debe distinguir entre la **estructura permanente** de la empresa y la **planificación anual renovable**. Esta separación evita duplicaciones innecesarias y protege el historial ya construido en Nómina, Participantes, KPI y la Línea de Tiempo.

> Un ciclo anual no debe reiniciar la empresa; debe reiniciar de forma controlada su plan de gestión.

## Qué se mantiene y qué se versiona

| Información | Tratamiento recomendado al abrir un nuevo ciclo | Motivo |
|---|---|---|
| Mapa de procesos, macroprocesos, caracterización, procedimientos, recursos y documentos | Se mantiene sin copia | Constituye la estructura estable de la empresa. |
| Nómina y organigrama | Se mantiene sin copia | Es información laboral vigente, no planificación anual. |
| Participantes por cargo y vínculo con trabajadores | Se mantiene sin copia | El rol y la persona siguen existiendo al iniciar el siguiente año. |
| KPI de trabajadores | Se conserva por año; se puede copiar la definición y la meta, pero los resultados mensuales inician vacíos | La plataforma ya guarda KPI por año, por lo que el histórico de desempeño está protegido. |
| OTE, objetivos operativos y sus tareas | Se archivan y, si el jefe lo decide, se copian al ciclo siguiente con avance inicial en cero | Son el núcleo de la planificación anual. |
| OTG y planes de gestión | Se archivan y migran de acuerdo con la decisión del jefe de proceso | Son compromisos de gestión que pueden continuar o renovarse. |
| Cumplimientos | Se evalúan individualmente: los anuales pueden copiarse; los de vigencia legal deben continuar hasta su vencimiento real | No sería correcto reiniciar un requisito cuya vigencia supera un año. |
| Gestión con Partes Interesadas | Se mantienen las partes interesadas; se archivan y migran solamente sus acciones, fechas, porcentaje y compromisos | La parte interesada es permanente; la acción de gestión es anual. |
| FODA, riesgos y matrices de criticidad | Se conserva inicialmente; se habilita una revisión o nueva versión cuando el responsable lo requiera | Son diagnósticos que no conviene borrar o duplicar automáticamente. |
| Línea de Tiempo y tendencias | Se preservan sin modificación | Ya son histórico mensual independiente del ciclo. |
| Objetivos Estratégicos y Objetivos de la Política | Se dejan para una segunda fase | Tienen naturaleza plurianual y requieren un mecanismo distinto del ciclo operativo anual. |

## Ajuste importante respecto de la propuesta original

La propuesta inicial incluía **Participantes** y **Partes Interesadas** como elementos a migrar completos. Con la plataforma actual, no recomiendo copiarlos como si fueran nuevos cada año. Ahora Participantes está conectado a Nómina y a KPI anuales; duplicarlo produciría cargos repetidos y podría confundir el desempeño de los trabajadores. La solución correcta es mantener los participantes y trabajadores, y permitir que sus KPI se configuren por cada año.

La misma lógica aplica a las Partes Interesadas: se mantienen los clientes, proveedores y actores registrados, mientras que sus planes de acción, fechas y niveles de implementación sí pertenecen al ciclo que se está cerrando.

## Flujo operativo actualizado

| Etapa | Responsable | Resultado |
|---|---|---|
| 1. Configuración | Gerente General | Define el año de destino y la fecha límite para completar la transición. |
| 2. Decisión por proceso | Jefe de Proceso | En **Nuevo Ciclo**, revisa cada OTE, OTG, acción de partes interesadas y cumplimiento renovable; decide migrar, no migrar o revisar. |
| 3. Validación | Plataforma | Exige una decisión para cada elemento aplicable e informa cuáles tienen dependencias o vigencia superior a un año. |
| 4. Preparación | Plataforma | Crea un borrador del nuevo ciclo, copia únicamente lo aprobado y deja los avances nuevos en cero. El ciclo anterior permanece intacto. |
| 5. Activación única | Gerente General | Activa el año nuevo de toda la empresa cuando todos los procesos estén listos o haya vencido la fecha límite. |
| 6. Consulta histórica | Gerente y Jefes | Consulta cualquier año cerrado en modo de solo lectura, con sus resultados, decisiones de migración y vínculo con el ciclo siguiente. |

## Arquitectura recomendada

Se debe conservar el principio de no alterar las tablas actuales. La solución más segura es añadir tablas nuevas para los ciclos y sus decisiones, y crear copias históricas inmutables al cerrar un período.

| Tabla nueva propuesta | Propósito |
|---|---|
| `planningCycles` | Ciclo de una empresa y proceso: año, estado (`draft`, `active`, `closing`, `closed`), fechas y responsable. |
| `planningCycleDecisions` | Decisión por elemento: tipo, identificador original, acción (`migrate`, `close`, `review`), porcentaje al cierre y justificación opcional. |
| `planningCycleSnapshots` | Copia inmutable y consultable de cada elemento cerrado, con su definición, planificación, tareas, avance y referencias al ciclo siguiente. |
| `planningCycleActivations` | Registro de la activación empresarial: año, fecha, gerente, procesos incluidos y procesos que quedaron vacíos por no completar la transición. |

No recomiendo que el sistema intente que todas las páginas actuales lean directamente de una tabla genérica de snapshots. Sería riesgoso y obligaría a reescribir módulos que actualmente funcionan. En la primera fase, las páginas de operación continúan usando las tablas actuales; el ciclo añade control de cierre, copia selectiva y consulta histórica. Después, de manera gradual, se podrá hacer que las vistas activas filtren por el ciclo correspondiente.

## Alcance recomendado por fases

| Fase | Alcance | Riesgo | Recomendación |
|---|---|---|---|
| Fase 1 | Ciclo por proceso para OTE, objetivos operativos/tareas, OTG, acciones de partes interesadas y cumplimientos renovables; historial de solo lectura; activación empresarial | Medio y controlable | Iniciar aquí. |
| Fase 1B | Configuración guiada de KPI del nuevo año, reutilizando las definiciones del año anterior sin copiar resultados | Bajo | Incluirla como complemento de la Fase 1. |
| Fase 2 | Objetivos Estratégicos y Objetivos de la Política | Medio | Desarrollar después de validar un cierre anual operativo. |
| Fase 3 | Versionado voluntario de FODA, riesgos y criticidad | Medio | Definir con la experiencia del primer ciclo. |

## Salvaguardas obligatorias

Antes de escribir código se debe realizar un respaldo de producción, preparar una empresa de prueba y probar por lo menos un cierre completo en local. La activación debe ser reversible mientras el ciclo sea un borrador; una vez cerrado, el histórico debe ser inmutable. La plataforma debe bloquear una segunda activación del mismo año y mostrar claramente el ciclo activo en las pantallas de planificación.

## Decisiones que conviene confirmar antes de iniciar

1. El primer ciclo que se archivará será **2026** y el que se abrirá será **2027**.
2. Los OTE, OTG, acciones de partes interesadas y cumplimientos se decidirán individualmente por proceso.
3. Los participantes y los trabajadores de Nómina permanecen; solo los KPI se preparan por el nuevo año.
4. Los cumplimientos con fecha de vigencia posterior a 2026 no se reinician automáticamente.
5. Para una primera versión, los procesos que no completen la transición antes del plazo podrán iniciar 2027 sin objetivos migrados, pero el Gerente podrá verlos y completar posteriormente la planificación bajo control.

Con estas decisiones, el sistema mantendrá la sencillez para los usuarios y protegerá la información histórica, sin arriesgar los módulos actuales de ISGE 360.
