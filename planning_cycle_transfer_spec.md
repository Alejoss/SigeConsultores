# Transferencia controlada entre ciclos de planificación

## Propósito

La activación de un ciclo no modificará ni eliminará registros del ciclo anterior. Los elementos aprobados con la decisión **Migrar** se convertirán en registros operativos del ciclo de destino, aislados del histórico de origen.

## Reglas de transferencia

| Decisión | Tratamiento al activar el ciclo | Efecto en el ciclo de origen |
|---|---|---|
| Migrar | Se crea un elemento operativo nuevo, vinculado al ciclo de destino y con una copia de su información de planificación. | Ninguno; la información de origen se conserva intacta y queda registrada en el histórico. |
| No migrar | No se crea un elemento operativo nuevo. | Se registra como cerrado en el histórico. |
| Revisar | No se crea automáticamente un elemento operativo. Queda visible como pendiente de reformulación en el histórico. | Ninguno. |

## Elemento operativo por migración

Cada migración creará un registro aislado en `planningCycleOperationalItems`, con vínculo a la decisión y al ciclo de destino. Guardará el tipo, título, descripción, porcentaje de origen, el contenido de fuente y la fecha planificada del nuevo año. Las fechas de una actividad migrada conservarán día y mes, cambiando solamente el año al ciclo de destino.

Los KPI constituyen una excepción controlada: además del registro operativo, se clonará únicamente la definición hacia `participantWorkerKpis` para el año nuevo. Se mantiene el mismo trabajador, nombre y meta mensual, pero no se copian resultados mensuales.

## Salvaguardas

- La transferencia se ejecutará dentro de una transacción: o se crean todos los elementos aprobados, o no se crea ninguno.
- Una restricción única por decisión y ciclo impedirá duplicaciones ante un segundo clic de activación.
- La activación requerirá que el ciclo esté listo y no tenga decisiones pendientes.
- Los snapshots de 2026 se generarán antes de cerrar el ciclo fuente.
- Para Masa Viva se validará primero el flujo con una copia de seguridad de los conteos de origen.
- Los módulos operativos actuales no se reescribirán ni se eliminarán durante esta fase. El nuevo plan activo se mostrará dentro de Ciclos de Planificación y se conectará gradualmente a las vistas generales en una fase posterior.

## Alcance de esta fase

La primera transferencia operativa crea el plan activo de 2027 dentro del módulo Ciclos de Planificación y permite que los KPI migrados aparezcan bajo el año 2027 en Participantes. La incorporación de estos elementos a cada vista heredada de OTE, FODA, Partes Interesadas, Cumplimientos y Cronograma se realizará de forma progresiva para no alterar la lógica vigente de 2026.
