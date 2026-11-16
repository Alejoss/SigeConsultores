# FODA — Objetivos de Política vigentes e históricos

Estado: corrección revisada y publicación autorizada el 15 de noviembre de 2026. El despliegue requiere completar CI/CD y verificar la versión pública y el respaldo previo.

## Diagnóstico

La lista del formulario dependía de `selectedPolicyId` recordado en el navegador. El servidor rechazaba tanto IDs ajenos como IDs ya eliminados, de modo que una fila histórica bloqueaba el guardado completo. Además comparaba el número de IDs únicos con el número total de referencias y rechazaba objetivos repetidos dentro de una categoría.

## Corrección

La consulta `processFODA.listPolicyObjectives` deriva la empresa del proceso autorizado y devuelve sus objetivos vigentes usando las mismas convenciones de propiedad existentes. No añade permisos sobre otros procesos o empresas.

Cada ID se valida antes de deduplicar. Se admiten referencias repetidas a un objetivo vigente. Un ID que existe en otra empresa se rechaza, aunque aparezca en un registro previamente guardado.

Un ID eliminado solo puede conservarse cuando existe en la misma fila/categoría guardada y conserva su texto de objetivo, descripción de política y contenido seleccionado. Los vínculos históricos se muestran expresamente; no se reasignan automáticamente a un objetivo nuevo. Un ID eliminado nuevo o un traslado a una fila nueva se rechaza. Los textos libres históricos sin ID se conservan. Seleccionar un objetivo vigente actualiza ese vínculo y su contenido.

La matriz OTG recibe la misma validación histórica y conserva la lógica de fusión de sus narrativas. El guardado de las cuatro categorías FODA no modifica `matrixData`; el guardado de matriz no modifica categorías FODA.

## Guardado del formulario

Autoguardado tras 1,5 segundos desde una acción del usuario, sin escritura inicial, al consultar o al recibir una nueva lista. Guardados serializados; un error conserva el borrador. VOLVER espera al último guardado y no abandona el formulario si falla. La numeración visual no reemplaza los identificadores persistentes de filas existentes. Se conserva el borrador ante refetch del FODA. Se retira el botón manual de guardado en coherencia con la preferencia de la plataforma.

La revisión adicional previa a publicación detectó y corrigió el riesgo de hidratar una caché antigua al reabrir el formulario. Se espera una consulta fresca al montar; los refetch actualizan solo formularios limpios y nunca un borrador pendiente ni una escritura en curso. Tras guardar se invalida la caché del FODA. Un fallo de actualización de caché no se presenta como fallo de una escritura ya confirmada. Se evita rehidratar el mismo snapshot obsoleto al terminar un guardado.

## Validación

- 19 casos específicos de integración MySQL: IDs repetidos, referencias históricas, sustitución por vigente, IDs inválidos/ajenos, aislamiento y conservación de OTG/narrativas.
- 12 pruebas React: lista independiente de política recordada, consulta sin escrituras, carga tardía, sustitución de objetivo, refetch seguro, salida tras guardado, errores, limpieza de temporizador, serialización, caché antigua mientras carga, refetch limpio con hallazgo nuevo e invalidación tras éxito.
- Suite general: 1154 pruebas unitarias/cliente y 270 pruebas de integración completadas correctamente; incluye pruebas heredadas que pueden omitir fixtures inexistentes según su propio código.
- TypeScript y compilación correctos. Navegador real: entrada con política recordada inválida, persistencia, IDs repetidos, histórico conservado, OTG intactos y móviles de 320/390 px.

- 5 pruebas adicionales de conservación con dos empresas ficticias, dos políticas completas, seis objetivos vigentes y cuatro FODA desarrollados (las cuatro categorías, OTG, narrativas y tareas). Compara todas las columnas de Política y objetivos, así como los procesos y FODA no editados. Lectura, sustitución voluntaria de un vínculo histórico, IDs repetidos, rechazo de ID ajeno y edición de una tarea preservan los datos no afectados.
- Confirmación del 15 de noviembre: los 19 casos de vínculos y los 5 de conservación aprobaron (24/24) en MySQL local ficticio.
- Revisión visible adicional: Política completa, cuatro objetivos vigentes y ocho hallazgos en el proceso `Financiero — prueba completa de FODA`. Cambiar un vínculo conservó las otras filas, categorías, Política, objetivos y matriz OTG; se restauró únicamente el cambio de esa prueba.

Verificación del 16 de noviembre: mediante los botones reales de VOLVER, Objetivos tácticos de gestión y FODA, se agregó y guardó un noveno hallazgo, se reabrió conservando el mismo QueryClient y se editó otro campo. El hallazgo nuevo permaneció; las demás categorías, el histórico, Política, objetivos y matriz OTG no cambiaron. Se restauró únicamente el ejemplo ficticio al finalizar.

Sin migraciones, cambios de esquema, restauraciones, conexiones a bases de clientes, correo ni tareas programadas. Los ejemplos y lanzadores son exclusivamente locales y no se incluyen en el despliegue. No se trasladan datos de revisión a Producción. Se conserva el procedimiento existente de respaldo previo al cambio de imagen; estas pruebas no representan una garantía de riesgo cero ni una inspección de los datos reales de clientes.
