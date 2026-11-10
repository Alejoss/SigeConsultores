# OTG: resultado real y ejecución del plan

## Alcance

Mejora para revisión local basada en el main `bea8e63216a8c398d4ed0e5213f2558ce6c512ae`, que ya incluye la lectura dual de OE y OTE. Este incremento no está desplegado en Producción.

El resultado numérico de cada OTG utiliza exclusivamente sus campos existentes `puntoPartida`, `alcanzado`, `puntoLlegada` y `unidadMedida`. No se crean nuevas casillas de captura ni tablas. Los textos, riesgos, vínculos, fechas, responsables, narrativas, evidencias y tareas permanecen en su origen actual.

## Lectura del resultado

Se reutilizan `ObjectiveResultSummary` y las fórmulas compartidas de OE/OTE:

- Punto de partida, resultado actual y meta en la unidad del indicador.
- Variación respecto al inicio: `(resultado − inicio) / inicio × 100`, para inicios positivos.
- Avance hacia la meta: `(resultado − inicio) / (meta − inicio) × 100`.
- Si la unidad del indicador es porcentaje, el cambio principal se expresa en puntos porcentuales y la variación relativa aparece debajo.
- Los porcentajes individuales no se recortan: pueden ser negativos o superar 100 %. Solo la longitud visual de la barra queda entre 0 y 100.
- Un inicio cero o negativo conserva el cambio absoluto y explica por qué la variación relativa no se expresa. Un resultado ausente permanece ausente; no se infiere de tareas ni de porcentajes antiguos. Una meta igual al inicio no tiene recorrido calculable.
- Cuando la meta requiere reducir el indicador, una disminución se reconoce como mejora, aunque la variación relativa tenga signo negativo.

El adaptador `shared/otgResultMetrics.ts` es puro y trata números históricos guardados como texto sin reescribirlos.

## Resultado del OTG frente al plan

La matriz y el indicador de área presentan los resultados individuales. El cumplimiento de tareas aparece separado: ejecutar el plan no garantiza alcanzar la meta del OTG.

Los cálculos y ponderaciones existentes de tareas y consolidados se conservan. El indicador de área mantiene `pctOTG` y su fórmula canónica como ejecución del plan. Los resúmenes por área identifican ese porcentaje como cumplimiento del plan y los conteos históricos como OTG marcados como logrados. No se cambian los campos guardados, los conteos ni las reglas de agregación.

Los porcentajes de cada tarea del indicador usan la misma función canónica ya existente, aplicada a una acción, de modo que las acciones modernas con `valorPuntual` se representan correctamente junto con sus formatos históricos. Esto no modifica la ponderación del conjunto.

## Protección de datos y guardado

- No cambia el esquema, las migraciones, la autenticación, los permisos ni la infraestructura.
- El servidor añade únicamente metadata calculada de lectura.
- La matriz deriva las nuevas métricas al renderizar, sin incorporarlas al estado persistido ni alterar `porcentajeAlcanzadoOTG`, `mejoraImplementada` o el autoguardado existente.
- Consultar las pantallas no debe generar mutaciones ni regrabar FODA.
- Los ejemplos nuevos se crean en una empresa ficticia y un proceso independiente. No se restauran ni consultan empresas de Producción.

## Revisión

En el entorno ficticio, proceso `917001`, se incluyen productividad, indicadores porcentuales, pérdidas, metas superadas, reducciones favorables, inicio cero, inicio negativo y un OTG pendiente de medición. Deben comprobarse las fórmulas, la coherencia entre matriz e indicador, los puntos porcentuales, la consulta sin escrituras, la escritura seguida de navegación y las vistas de 320/390/1440 píxeles.
