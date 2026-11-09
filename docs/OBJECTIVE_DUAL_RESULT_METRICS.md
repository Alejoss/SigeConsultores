# Lectura dual de resultados de OE y OTE

## Alcance y estado

Implementación para revisión local, basada en `main` `35ae90b7ee0874810f9a324699a4d62720fd0000`. No publicada ni desplegada a Producción. No cambia esquema, migraciones, permisos, autenticación, archivos del mapa ni la página comercial.

La definición de OE sigue editándose exclusivamente en Estrategia. Las mediciones de OE siguen capturándose exclusivamente en Desempeño. Se mantienen el guardado automático, los campos de observación/evidencia y las salidas seguras antes de navegar.

## Datos y lectura

Cada objetivo numérico presenta punto de partida, resultado actual, meta, variación respecto al inicio y avance hacia la meta. El valor actual es una cantidad en su propia unidad; no se confunde con un porcentaje de cumplimiento.

- Variación: `(actual − inicio) / inicio × 100`, cuando el inicio es positivo.
- Avance hacia la meta: `(actual − inicio) / (meta − inicio) × 100`, cuando meta e inicio son diferentes.
- Ambos porcentajes individuales admiten valores negativos y superiores a100. Solo el dibujo de la barra queda limitado a su ancho de0a100; el número y su texto accesible conservan el resultado completo.
- Si la meta busca reducir, una variación negativa puede ser favorable. El estado Mejora/Retroceso considera la dirección de la meta, no solo el signo.
- Con inicio cero, el crecimiento porcentual no se calcula. Se presenta el cambio absoluto y el avance hacia la meta.
- Con inicio negativo, se evita un crecimiento porcentual ambiguo/invertido y se presenta cambio absoluto. Para unidades porcentuales, dicho cambio se expresa en puntos porcentuales.
- Sin una medición real de OE no se inventa un valor0ni un porcentaje0.
- Checklist muestra meses cumplidos sobre12; no se presenta como crecimiento del indicador. Se conserva el redondeo y las reglas existentes de seguimiento mensual. Los promedios mensuales continúan excluyendo los ceros, sin reinterpretar registros previos.

En los OTE se separa el resultado del objetivo de la ejecución del plan: resultado de los objetivos operativos y tareas completadas no se presentan como equivalentes al resultado numérico del OTE.

## Compatibilidad y conservación

Las APIs de lectura de OTE y del consolidado añaden `resultMetrics`, `porcentajeMetaAlcanzadoRaw` y `porcentajeAlcanzadoRaw` calculados de los valores fuente. No se escriben, reparan ni migran los JSON de planificación por consultar una pantalla. Las pruebas de lectura verifican ausencia de insert/update/delete/transaction.

Los campos persistidos legacy y los totales ponderados conservan sus reglas actuales: OE aporta entre0y100al global; OTE/OO mantienen los límites individuales legacy entre−100y100antes de consolidar. No se promedian variaciones de indicadores heterogéneos.

La línea de tiempo conserva porcentajes históricos registrados, con la etiqueta Avance registrado. No se recalculan con la definición actual ni se alteran mediciones anteriores. La nueva lectura actual sin recorte se consulta en Avance por OE.

### Diferencia preexistente de consolidación OO, fuera del alcance

El backend de indicadores normaliza los porcentajes OO por la suma real de sus ponderaciones. La planificación divide las ponderaciones por100y no renormaliza; también difieren en el redondeo y la alternativa cuando no hay pesos. Esto puede explicar diferencias como14frente a12entre ambas pantallas. Esta tarea conserva esas reglas: no se aprovecha un cambio de presentación para cambiar silenciosamente el cálculo de los planes existentes.

## Validación y revisión

Se ejecutaron pruebas de cálculo, interfaz y lectura sin escrituras; suites unitarias/cliente y de integración MySQL; verificación de tipos y compilación completa; prueba real de navegador con autoguardado, pérdidas, superación de meta, lectura de definición y adaptación a320y390px.

La revisión reutiliza la base local ficticia `sige_oe_review_20261108` y las credenciales anteriores. Añade únicamente el área independiente Indicadores — ejemplos de revisión, con crecimiento, pérdidas, meta superada, reducción favorable, inicio cero e inicio negativo. Las huellas de OE, configuraciones, mediciones y OTE anteriores se verificaron idénticas antes y después de crear estos ejemplos.

Los lanzadores `.local-*`, la base/credenciales de revisión y las dependencias enlazadas no deben incluirse en un commit o despliegue. El futuro despliegue debe realizarse desde una copia limpia del main real, trasladando exclusivamente los archivos de esta mejora y conservando cambios posteriores de IT.

## Ajuste de presentación: indicadores porcentuales

Para unidades `%`, porcentaje, percent o por ciento, la lectura principal es Cambio respecto al inicio en puntos porcentuales. La Variación relativa aparece debajo, en un tamaño menor. Ejemplo: inicio5%, actual10%, meta15% → cambio+5puntos porcentuales; variación relativa+100%; avance hacia la meta50%.

Se aplica la misma regla a tarjetas y detalle de OE, indicador del área y planificación de OTE. Los indicadores en tallos, dinero u otras unidades mantienen la variación porcentual como lectura principal. El seguimiento no numérico por checklist no se convierte en puntos porcentuales.

Este ajuste modifica solo la presentación: no cambia fórmulas, ponderaciones, mediciones almacenadas, historial ni guardado automático. Con inicio cero o negativo, el cambio en puntos puede mostrarse, pero la variación relativa sigue indicando que no es calculable. Las mediciones ausentes permanecen ausentes.
