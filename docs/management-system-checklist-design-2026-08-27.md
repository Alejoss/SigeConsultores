# Diseño: checklist operativo de Sistemas de Gestión

## Propósito

Cada archivo de checklist seguirá conservándose como documento de respaldo. Adicionalmente, sus estándares se importarán a una matriz operativa editable dentro de ISGE 360. Ninguna acción de importación elimina archivos ni elementos previamente gestionados.

## Estructura

| Entidad                  | Campos principales                                                                                                 | Regla de conservación                                         |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| Ítem de checklist        | sistema, código, estándar/compromiso, descripción, forma de verificación, aplicable, vigencia, responsable y orden | Cada estándar se mantiene independiente del archivo original. |
| Acción de implementación | ítem, acción, responsable, fecha prevista, cumplido, fecha de cumplimiento y orden                                 | Un ítem puede contener una o más acciones.                    |
| Archivo original         | archivos actuales de tipo `checklist`                                                                              | Se conserva sin reemplazo como evidencia de la importación.   |

## Formas de verificación

| Forma         | Cumplimiento del estándar                                                      |
| ------------- | ------------------------------------------------------------------------------ |
| Vigencia      | La fecha actual está entre `Vigente desde` y `Vigente hasta`, inclusive.       |
| Planificación | Existe al menos una acción y todas las acciones están marcadas como cumplidas. |
| Ambas         | Se cumplen simultáneamente la vigencia y todas las acciones.                   |
| No aplicable  | El ítem queda excluido del denominador y exige justificación.                  |

## Importación incremental

La plantilla incluirá las columnas: Código, Estándar o compromiso, Detalle, Forma de verificación, Aplicable, Justificación no aplicable, Vigente desde, Vigente hasta, Acción inicial, Responsable, Fecha de implementación y Cumplido (SI/NO).

La importación identifica primero por código dentro del mismo Sistema de Gestión. Si no hay código, utiliza el texto normalizado de estándar. Los ítems coincidentes se actualizan sólo en los campos provistos; los nuevos se agregan. Las acciones se agregan sin borrar acciones creadas dentro de la plataforma. Una fila vacía nunca elimina información existente.

## Indicador

El porcentaje del Sistema de Gestión es el promedio simple de los ítems aplicables. Cada ítem aporta 100 % únicamente si su forma de verificación está cumplida; de lo contrario aporta 0 %. Se muestran adicionalmente vigentes, próximos a vencer, vencidos, acciones pendientes y no aplicables.

## Seguridad

Todas las operaciones validan que el Sistema de Gestión pertenezca a la empresa autorizada del Administrador, Gerente o Jefe de Proceso. Las rutas no reciben datos de archivos dentro del checklist y los documentos originales permanecen bajo la ruta de carga multipart ya existente.
