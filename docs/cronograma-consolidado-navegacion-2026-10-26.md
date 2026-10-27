# Navegación directa desde Cronograma Consolidado — 26 de octubre de 2026

## Objetivo

El **Diagrama de Gantt** deja de ser solo una vista de consulta. Cada nombre de actividad y cada rombo del diagrama abre el módulo donde se administra esa actividad, sin modificar información al navegar.

La lista mensual del Cronograma Consolidado ofrece el mismo acceso como alternativa. De esta forma, el usuario puede consultar el detalle al pasar el cursor y abrir la actividad con un clic cuando necesita gestionarla.

## Destinos cubiertos

| Origen en el Cronograma | Destino de gestión |
|---|---|
| Gestión con Partes Interesadas | Fila correspondiente de Gestión con Partes Interesadas |
| Matriz FODA | Registro y fila correspondiente de la Matriz FODA |
| Objetivos Tácticos Estratégicos (OTE) | Resultado clave y tarea correspondiente de Planificación OTE |
| Actividades del proceso | Actividad expandida, conservando la ocurrencia concreta si es semanal o mensual |
| Compromisos vinculados | Tarjeta exacta en Compromisos vinculados |

## Integridad y acceso

- La consolidación conserva identificadores de origen; no busca actividades por su texto y por ello evita abrir una actividad distinta cuando hay nombres parecidos.
- Para FODA histórico que no tenga identificador individual de fila, se usa exclusivamente la posición original de la fila dentro del registro exacto de su matriz.
- El enlace conserva `processId` y, cuando está disponible, `companyId`.
- Al llegar al módulo de origen, el servidor vuelve a comprobar el acceso del usuario al proceso. El enlace no concede permisos ni permite a un Jefe de Proceso entrar a un proceso ajeno.
- Abrir una actividad OTE desde el Gantt utiliza una expansión solamente visual; no cambia ni guarda la planificación.
- La actividad recurrente solicitada se muestra aunque esté fuera de las primeras 24 ocurrencias visibles.
- No se crean, actualizan ni borran registros, evidencias ni archivos por abrir una actividad desde el Gantt.

## Uso

1. Ingrese a **Caracterización de Procesos → Seguimiento y control → Cronograma Consolidado**.
2. Presione **Diagrama de Gantt**.
3. Pase el cursor sobre el rombo para consultar el detalle breve.
4. Haga clic en el rombo o el nombre de la actividad. El sistema abre el módulo correspondiente y destaca o despliega el registro a gestionar.
