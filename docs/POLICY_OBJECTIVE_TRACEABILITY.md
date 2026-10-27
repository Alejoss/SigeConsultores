# Trazabilidad de Objetivos de la Política

## Propósito

La pantalla **Objetivos de la Política** muestra cómo cada objetivo se aterriza en los procesos de la empresa. Sirve como evidencia para Gerencia, Jefes de Proceso y auditorías internas o externas.

La información se consulta desde las fuentes ya existentes, sin duplicar actividades ni modificar registros históricos:

- **FODA** del proceso;
- **OTG** derivados de la matriz FODA;
- **OTE** vinculados al Objetivo de la Política.

## Cobertura

Para cada objetivo se muestra el porcentaje de procesos aplicables con al menos una evidencia FODA, OTG u OTE.

- **Aterrizado:** el proceso contiene una o más evidencias.
- **Pendiente de considerar:** no existe aún evidencia para ese objetivo en el proceso.
- **No aplica:** solo Gerencia General o Administración puede registrar esta excepción, con una justificación obligatoria y la fecha de confirmación.

La ausencia de una evidencia nunca se interpreta automáticamente como “No aplica”.

## KPI integrado

El KPI se calcula únicamente con procesos que tienen una medición configurada. Un OTE u OTG sin meta o sin medición se muestra como **Sin medición** y no se calcula como 0 %, para no distorsionar el resultado.

1. **Ruta OTG:** promedio de los avances medibles de los OTG vinculados al objetivo.
2. **Ruta OTE:** promedio ponderado de los avances medibles de los OTE vinculados al objetivo; si no hay ponderación, se usa el promedio simple.
3. **KPI integrado por proceso:** promedio de las rutas OTG y OTE disponibles para ese proceso.
4. **KPI del objetivo:** promedio de los KPI disponibles de sus procesos aplicables.

La pantalla conserva además ambos promedios por separado, para que un auditor pueda distinguir el avance operativo (OTG) del avance táctico-estratégico (OTE).

## Compatibilidad y seguridad

Los vínculos nuevos se guardan con el identificador real del Objetivo de la Política. Los registros antiguos que solo guardan texto se reconocen únicamente cuando el texto coincide con un único objetivo; si hay dos objetivos con el mismo texto, la plataforma no adivina el vínculo.

El servidor valida que un identificador de Objetivo de la Política pertenezca a la misma empresa del proceso, incluyendo las rutas FODA y OTG. No se cambian ni eliminan datos históricos por esta funcionalidad.
