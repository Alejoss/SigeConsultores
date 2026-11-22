# Margen tolerable y presentación de resultados

## Alcance

Mejora aditiva de OTE, objetivos operativos y OTG. El nuevo método `margen_tolerable` se activa únicamente por elección del usuario y almacena una configuración opcional en el JSON existente. No requiere migraciones ni cambios de esquema, autenticación o permisos. No convierte objetivos anteriores ni reemplaza sus textos, puntos de partida, metas, mediciones o series mensuales.

En los indicadores, «Cambio respecto al inicio» y «Variación relativa» se presentan en filas independientes con el mismo tamaño y peso que meta o avance. Los números son blancos en los paneles verdes oscuros. Los porcentajes se muestran con dos decimales; el almacenamiento no se redondea por motivos de presentación.

## Evaluación del margen

El usuario establece límite inferior y superior, y opcionalmente un valor ideal dentro del intervalo. Ambos límites están incluidos. Los límites deben ser distintos y estar ordenados. El cero es una medición registrada; una casilla vacía se almacena como `null` y no cuenta como medición.

El registro puede ser puntual o mensual. En modalidad mensual, cada medición se evalúa por separado: el cumplimiento es el número de mediciones dentro del intervalo dividido por el número de mediciones registradas. No se suman ni promedian desvíos positivos y negativos para ocultar excesos o faltantes. El resultado actual muestra la última medición registrada, no un promedio.

La tendencia compara la distancia del resultado al valor ideal con la distancia del punto de partida al ideal. Una reducción de dicha distancia indica mejora, independientemente del signo. No se muestra avance lineal hacia una meta para este método. Estar dentro del intervalo no equivale a alcanzar el valor ideal. La ejecución de las tareas se mantiene como una lectura separada.

Si faltan límites o mediciones, el margen no aporta un cero ficticio de cumplimiento. Los cálculos y agregados de los métodos previos conservan sus reglas históricas.

## Edición y conservación

Los campos permiten signos negativos y coma decimal. Conservan el borrador mientras el usuario escribe y utilizan los mecanismos existentes de autoguardado. Activar o configurar margen no sobrescribe los valores numéricos históricos del objetivo. La configuración del margen se conserva al elegir otros métodos; los métodos anteriores mantienen sus reglas de recálculo habituales.

## Revisión aislada

La revisión utiliza exclusivamente la empresa ficticia `910001` y el proceso **Margen tolerable — revisión** (`919001`). No usa información de clientes, no envía correos externos y no ejecuta tareas programadas. Los lanzadores, credenciales y datos ficticios no forman parte de esta mejora.

Casos de ejemplo: OTE con inicio 25 %, intervalo −20 % a +20 %, ideal 0 % y resultado actual 10 %. OO mensual con 25, −25, 0 y 10: dos de cuatro mediciones dentro del margen, es decir, 50,00 %. OTG con resultados dentro del margen, fuera por faltante e ideal cero.

## Verificación

Las pruebas cubren límites inclusivos, cero y ausencia, intervalos inválidos, registro mensual, dirección de mejora, lectura sin escrituras, preservación de valores anteriores y presentación de porcentajes. La prueba real de navegador verifica navegación, recarga y restauración de los únicos datos ficticios editados durante QA, además de escritorio y móviles de 390 y 320 px.

**Estado:** revisión local aprobada y publicación autorizada el 22 de noviembre de 2026. La publicación se realiza mediante PR de staging a main y CI/CD; no mediante restauración de datos.

## Lectura principal de mejora respecto al ideal

En «Margen tolerable» se destaca la **Reducción de la desviación respecto al ideal**: `(distancia inicial − distancia actual) / distancia inicial × 100`, donde cada distancia es el valor absoluto de la diferencia con el ideal. Se muestran «Tendencia» y «Estado actual» como filas explícitas. El porcentaje positivo indica acercamiento al ideal, y el negativo alejamiento. El indicador puede mejorar sin entrar todavía en el margen, o empeorar aunque siga dentro: tendencia y estado se mantienen separados.

Ejemplos con ideal cero: 25 → 14 y −25 → −14 dan 44,00 % de reducción y «Mejora». 25 → −14 también mejora un 44,00 % porque el cambio de signo no elimina el faltante. 25 → 35 da −40,00 % y «Retroceso». Si el inicio ya coincide con el ideal, no se inventa una reducción porcentual: se muestra «—» con explicación, conservando la tendencia y el estado. Sin ideal, punto de partida o medición válidos, tampoco se inventa un porcentaje.

La «Variación relativa» original se conserva en una sección secundaria con la aclaración de que el signo indica aumento o disminución del valor, no mejora o retroceso. Los demás métodos de seguimiento mantienen la jerarquía anterior. Estas son métricas derivadas de lectura; no cambian datos almacenados, límites, mediciones, porcentajes históricos ni agregados de cumplimiento. En el registro mensual la mejora compara el inicio con la última medición registrada; el cumplimiento mensual sigue evaluando cada mes por separado.

## Encabezados de proceso y lectura histórica de FODA

FODA y OTG consultan el nombre mediante `processMap.get` para el identificador del proceso abierto. No reutilizan el nombre de otro proceso recordado en localStorage. El endpoint y sus permisos existentes no se modifican.

El lector compartido `parseStoredFodaArray` intenta JSON estricto primero. Únicamente admite recuperar controles C0 literales dentro de cadenas de las categorías FODA ya almacenadas, conservando sus caracteres, textos, identidades y propiedades desconocidas. No recupera otros errores ni descarta filas. La lectura del servidor sigue devolviendo el registro crudo y no escribe; abrir las páginas tampoco guarda. Una edición explícita utiliza el autoguardado existente y permite validar los vínculos históricos con el mismo lector. El contenido entrante y la matriz OTG mantienen su validación estricta. No se cambia el esquema ni se ejecutan reparaciones masivas de datos.

El fallo de saltos de línea se reprodujo a partir de un respaldo histórico. La misma causa en el registro actual de Producción queda pendiente de comprobación por un usuario autorizado; la compatibilidad se publica con validación local y fixtures sintéticos, sin afirmar una inspección del registro productivo actual.
