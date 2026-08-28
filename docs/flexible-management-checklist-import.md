# Importación flexible de checklist operativo

## Objetivo

Permitir que cada empresa importe un Excel existente aunque no use la plantilla oficial de ISGE 360. La plantilla oficial permanece disponible como referencia, pero no es un requisito de importación.

## Flujo

1. El usuario selecciona un archivo `.xlsx` o `.xls`.
2. La aplicación analiza las primeras 20 filas y propone una fila de encabezados.
3. Identifica automáticamente los nombres de columna más comunes y presenta un asistente de mapeo editable.
4. El usuario puede escoger la columna fuente para cada dato de ISGE 360, omitir los campos que no existan y cambiar la fila de encabezados si el archivo tiene títulos superiores.
5. El sistema muestra una vista previa de los estándares resultantes antes de importar.
6. La importación usa código de estándar como identificador; si falta, usa el texto del estándar. Sólo actualiza coincidencias y añade elementos nuevos. Las celdas vacías no eliminan valores almacenados.

## Campos de destino

| Campo                                   | Obligatorio | Notas                                                       |
| --------------------------------------- | ----------: | ----------------------------------------------------------- |
| Estándar o compromiso                   |          Sí | Una fila sin este dato no se importa.                       |
| Código                                  |          No | Identificador preferido para actualizaciones.               |
| Detalle                                 |          No | Descripción del requisito.                                  |
| Forma de verificación                   |          No | Se interpreta por vigencia, planificación o ambas.          |
| Aplicable                               |          No | Acepta SI/NO, X, 1/0 y valores equivalentes.                |
| Justificación no aplicable              |          No | Se conserva cuando exista.                                  |
| Vigente desde / hasta                   |          No | Se aceptan fechas Excel o texto.                            |
| Acción / responsable / fecha / cumplido |          No | La acción importada queda como primera acción del estándar. |

## Salvaguardas

- No existe reemplazo masivo durante la importación.
- Las filas con estándar vacío no se procesan.
- Las columnas no mapeadas no alteran información existente.
- La vista previa se debe aceptar explícitamente antes de guardar.
- El archivo original se puede conservar por separado como respaldo documental.

## Validación local del formato externo

Se validó un Excel distinto de la plantilla oficial con tres filas informativas iniciales y encabezados en la tercera fila: Numeral, Requisito / estándar, Evidencia o detalle, Tipo de control, Aplica, Fecha de emisión, Fecha de vencimiento, Acción correctiva, Responsable, Fecha límite y Estado.

El asistente detectó la fila 3, relacionó automáticamente las columnas y mostró el ejemplo de cada una. La primera importación generó 3 estándares y 2 acciones. La segunda importación del mismo archivo generó 0 estándares nuevos, actualizó los 3 existentes y no agregó acciones duplicadas. Los datos se utilizaron sólo para validación local y deben retirarse antes de la revisión del usuario.

## Validación local de cláusulas extensas

Se importó un requisito de prueba de 4.046 caracteres, superior al límite previo de 500 caracteres para el nombre y 2.000 caracteres para el detalle. La plataforma generó un título de visualización abreviado y conservó el texto completo como detalle. La importación creó un estándar y una acción sin rechazar la fila. Los datos se usaron sólo para validación y deben retirarse de Masa Viva antes de entregar la corrección.
