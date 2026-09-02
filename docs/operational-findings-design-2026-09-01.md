# Diseño de hallazgos operativos — Auditorías, Inspecciones y Simulacros

## Propósito

Convertir los conteos agregados actuales de **Hallazgos** y **Cierres** en una gestión operativa por hallazgo, sin perder los datos históricos que hoy existen por auditoría o inspección. Cada hallazgo podrá asignarse a procesos mediante la arquitectura ya existente de **Compromisos vinculados**.

## Alcance funcional

Cada fila de Auditoría e Inspección conservará sus datos principales, archivos y el resumen de conteos. Tendrá además un acceso desplegable llamado **Gestionar hallazgos**. El detalle de cada hallazgo tendrá los siguientes campos:

| Campo | Regla |
|---|---|
| Hallazgo | Texto descriptivo obligatorio. |
| Clasificación | No conformidad mayor, no conformidad menor, observación u oportunidad de mejora. |
| Tarea para cierre | Texto obligatorio que describe la acción a realizar. |
| Responsable de referencia | Texto opcional. No determina permisos ni destino de la responsabilidad. |
| Fecha objetivo | Fecha opcional de cierre. |
| Cumplido | Se actualiza mediante autosave si no hay proceso vinculado. |
| Vincular | Abre el selector de uno, varios o todos los procesos reales del Mapa. |

Los hallazgos vinculados se verán en **Caracterización de Procesos → Compromisos vinculados** y en el **Cronograma Consolidado**. El Jefe podrá cerrarlos y adjuntar evidencias mediante la ruta segura de archivos ya utilizada por los demás compromisos.

## Modelo de datos aditivo

Se añadirá una tabla única `operationalFindings` para los hallazgos de las dos fuentes. Tendrá `sourceType` (`audit` o `inspection`), `sourceId` de la auditoría/inspección, compañía, clasificación, texto, tarea de cierre, responsable de referencia, fecha objetivo, estado, fecha de cierre y orden. No se modifica ni elimina ninguna columna actual de `audits`, `inspections`, `auditFiles` o `inspectionFiles`.

Para proteger los conteos previos, se añadirá `operationalFindingBaselines`. La primera vez que se gestione detalladamente una auditoría o inspección, se guarda una copia del resumen existente como base histórica. Los conteos visibles serán siempre:

> **Resumen existente al iniciar la gestión detallada + hallazgos detallados nuevos**.

Así, ningún registro histórico se reduce ni desaparece. En los nuevos hallazgos, las columnas **Cierres** se recalculan automáticamente desde el estado real de cada hallazgo.

## Reglas de sincronización

| Situación | Resultado en el origen |
|---|---|
| Hallazgo sin procesos vinculados marcado como cumplido | Aumenta automáticamente el cierre de su clasificación. |
| Hallazgo vinculado a un proceso | El origen muestra `cumplido en X de Y`; el cierre no se incrementa hasta que todos cumplan. |
| Hallazgo vinculado a varios procesos | Se cierra únicamente si todos los procesos vinculados lo completan. |
| Un proceso desmarca el cumplimiento | El hallazgo y su cierre vuelven a pendiente. |
| Hallazgo con vinculación activa | El estado se gestiona desde el proceso para evitar datos contradictorios. |
| Hallazgo eliminado | Sólo se permite si no tiene vínculos; no se borra el resumen histórico. |

La tabla `linkedCommitments` añadirá los tipos de fuente `audit_finding` e `inspection_finding`. La sincronización ya existente resolverá el hallazgo de origen, actualizará su estado y recalculará el resumen de Auditoría o Inspección correspondiente.

## Presentación

La tabla principal conservará su vista compacta para evitar contaminación visual. Los conteos de hallazgos y cierres pasan a ser resúmenes automáticos cuando existe gestión detallada. Cada fila tendrá un botón **Gestionar hallazgos** que abre un bloque desplegable con tarjetas claras, una por hallazgo.

En Auditorías se mostrarán los cuatro tipos de clasificación por separado en el resumen. En Inspecciones y Simulacros se mostrará el total de hallazgos y cierres, manteniendo su modelo actual sencillo. No se cambiará la clasificación o los archivos de registros ya cargados.

## Seguridad y validación

El acceso a crear, editar, vincular o eliminar hallazgos requerirá el mismo acceso empresarial ya aplicado a Auditorías e Inspecciones. El Jefe de Proceso sólo podrá gestionar el compromiso recibido por su proceso. La validación local incluirá creación, cierre manual, vínculo múltiple, sincronización de cierres, presencia en Cronograma y preservación de un resumen histórico existente.

La implementación se realizará y revisará en local. No se desplegará a producción sin aprobación explícita posterior a las pruebas.
