# Medición real de Objetivos Estratégicos

## Alcance

Cambio aprobado para revisión local antes de un despliegue posterior. Base de código: main `40181e6b15b76ffafe987b6a673d26f449ccbed8`. La protección del documento del mapa de procesos permanece en otro worktree y no forma parte de esta entrega.

Se distingue el resultado empresarial del OE del cumplimiento de los OTE de las áreas. La tabla «Contribución por Área» conserva su consulta, asociación y cálculo anteriores. La vista «Avance por OE» usa exclusivamente el indicador y las mediciones propias del OE; el total es ponderado por los pesos de los OE, no por los OTE.

## Datos y cálculos

Se agregan únicamente dos tablas: `strategicObjectiveMeasurementConfigs` y `strategicObjectiveMeasurements`. No se agregan ni transforman columnas antiguas de `strategicObjectives` o `processTacticalObjectives`. La migración `drizzle/0100_strategic_objective_measurement.sql` contiene dos `CREATE TABLE IF NOT EXISTS`; no contiene backfill, eliminación de filas ni alteración de las tablas anteriores. Sus claves foráneas usan nombres explícitos compatibles con el límite MySQL. Las relaciones en cascada afectan únicamente a los registros nuevos de medición cuando un usuario elimina intencionalmente un OE por el flujo existente.

La configuración incluye situación inicial, resultado esperado, indicador, peso, base, meta, unidad y fecha límite exacta. La meta textual y los textos originales permanecen independientes. Un único campo de fecha visible evita plazos contradictorios. Los nuevos campos se guardan en la tabla adicional; no reemplazan los años anteriores del OE. Los clientes anteriores siguen siendo compatibles.

Avance del OE = `(valor real - punto de partida) / (meta - punto de partida) * 100`, limitado entre 0 y 100, con dos decimales. La misma fórmula admite aumentos y reducciones. Base y meta iguales no permiten calcular. Un valor cero real es válido y se distingue de ausencia de medición.

El total solo se declara disponible cuando todos los OE están configurados, las ponderaciones suman 100 % y todos tienen medición. No se renormalizan ponderaciones ni se sustituyen datos faltantes por cero. Estados explícitos: sin objetivos, configuración pendiente, ponderación incompleta, mediciones incompletas y completo.

Las mediciones se guardan por OE y fecha. Una nueva fecha crea historial; editar la misma fecha actualiza ese registro sin duplicarlo. Seleccionar una fecha existente carga sus notas y evidencia sin escribir automáticamente; cambiar su valor conserva esas notas. El porcentaje histórico y una instantánea de definición se almacenan con la medición. El avance actual se calcula según la configuración vigente. Se rechazan fechas inexistentes o futuras, valores no finitos y objetivos de otra empresa. Evidencia es una referencia de texto opcional: no requiere un nuevo servicio de archivos.

La línea de tiempo de OE usa las nuevas mediciones por `objectiveId`. Los snapshots históricos de cumplimiento OTE continúan almacenados sin cambios y no se muestran como si fueran resultados empresariales reales. Consultar la nueva línea de tiempo no genera registros.

## Permisos y guardado

Se utilizan los permisos corporativos existentes: Administrador, Gerente y Coordinador autorizado pueden gestionar; Jefe estándar solo consulta. Se valida empresa y OE en el servidor; no se conceden nuevos permisos ni acceso a procesos ajenos.

La interfaz separa dos modos explícitos. **Estrategia → OE** permite definir y editar el objetivo y su indicador, sin mostrar la captura de valores reales ni el historial. **Desempeño → OE** muestra esos datos de definición solo de lectura, incluso para Gerencia; únicamente habilita fecha de medición, valor real, observación y evidencia para los usuarios autorizados. La captura y el historial aparecen exclusivamente en Desempeño. Esta separación no cambia tablas, cálculos, permisos del servidor ni los registros existentes.

El autoguardado agrupa cambios durante 900 ms y serializa escrituras. Las respuestas anteriores no reemplazan borradores ni desplazan el cursor. Hay estados de pendiente, guardando, guardado y error con reintento. Cerrar el detalle o cambiar de pestaña espera los guardados válidos; si falla, el detalle queda abierto con su texto. No hay escrituras al montar el formulario. La creación inicial conserva un botón de alta, no un botón adicional para guardar ediciones.

## Revisión local

Entorno separado: `sige_oe_review_20261108`, host `127.0.0.1`. Contiene únicamente «Masa Viva — revisión OE», tres procesos ficticios y sus ejemplos. No se restauró, consultó ni modificó Agrogana ni otra empresa real. No se modificó la base de trabajo anterior. Servidor temporal en el puerto 3001 sin cron, servicios de correo, subida de archivos ni claves externas. Credenciales y lanzador del entorno permanecen fuera del código de despliegue.

Ejemplo inicial: OE de rentabilidad 50 %, satisfacción 80 %, reclamos 25 %; pesos 50/30/20; total 54 %. La contribución de los OTE muestra 90/95/100 % por área. Cambiar el valor de rentabilidad de 10 a 11 eleva su avance de 50 a 60 % y el total de 54 a 59 %, sin alterar los OTE.

## Verificaciones realizadas

- TypeScript y compilación de cliente/servidor correctos.
- Suite habitual unit/cliente: 801 pruebas aprobadas tras separar las pantallas de definición y seguimiento.
- Suite habitual de integración en base sintética: 247 pruebas aprobadas; se respetan las omisiones internas de tests antiguos que buscan empresas no presentes en una base ficticia.
- Suite nueva de integración: 13 pruebas, repetidas al cierre después de los ajustes finales.
- Prueba real de navegador: login, edición y recarga, foco durante autoguardado, guardado al cerrar, total ponderado, tabla independiente, línea de tiempo y vista de 390 px sin desbordamiento horizontal.
- Huella de filas anteriores de OE y OTE idéntica antes y después de inicializar la configuración y mediciones del ejemplo.
- Migración probada dos veces sobre una segunda base vacía, verificando idempotencia y claves foráneas.

## Despliegue posterior

No se ha publicado ni desplegado esta mejora. Requiere revisión y autorización posterior del usuario. En ese momento se deben verificar main actualizado, alcance del PR, respaldo reciente, columnas existentes y ejecución aditiva de la migración. El archivo SQL está ignorado por el patrón general de `.gitignore`; debe incluirse explícitamente en el cambio autorizado (`git add -f`), igual que otras migraciones manuales del repositorio. No incluir `.local-review-server.mts`, dependencias enlazadas, scripts de fixtures ni configuración privada del entorno de revisión.
