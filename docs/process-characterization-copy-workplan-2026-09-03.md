# Copia selectiva de Caracterización entre procesos

**Estado:** Implementación local y validación aislada completas. **Producción permanece bloqueada** hasta una revisión local final y una aprobación explícita posterior del usuario.

**Origen inicial previsto:** `Producción: Aliaga` de Agrogana.

**Destino previsto:** Los demás procesos o fincas de Producción que el usuario seleccione, inicialmente hasta once procesos adicionales.

## Objetivo

La función reduce la carga inicial de caracterización en fincas que comparten una estructura operativa semejante. El Administrador o Gerente podrá tomar un proceso completo como plantilla y copiar únicamente módulos elegidos a uno o varios procesos de la misma empresa. Posteriormente, cada responsable del proceso destino podrá completar y ajustar su información particular con el autosave normal de la plataforma.

> La operación es deliberadamente distinta de un autosave ordinario: al ser una copia masiva, exige una **previsualización** y una **confirmación visible** antes de escribir datos.

## Flujo de usuario aprobado

| Paso | Comportamiento implementado                                                                 |
| ---- | ------------------------------------------------------------------------------------------- |
| 1    | El usuario entra a Caracterización del proceso fuente, inicialmente Aliaga.                 |
| 2    | Presiona **Copiar caracterización a otros procesos**.                                       |
| 3    | Selecciona, de forma independiente, los módulos permitidos.                                 |
| 4    | Selecciona uno, varios o todos los procesos destino de la misma empresa.                    |
| 5    | Presiona **Revisar copia** y recibe un resumen por proceso y módulo.                        |
| 6    | Confirma únicamente si el resumen es correcto.                                              |
| 7    | La plataforma informa los módulos copiados u omitidos sin reemplazar información existente. |

## Módulos incluidos

| Módulo              | Regla de copia aplicada                                                                                                |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Participantes       | Copia puestos de trabajo y los contenidos de **Ver detalles del cargo**: objetivo, responsabilidad, autoridad y orden. |
| Recursos            | Copia recursos asociados a puestos, recursos generales sin puesto y su orden.                                          |
| Mapa de Subprocesos | Copia la cabecera del mapa y sus registros estructurados de entradas, subprocesos y salidas.                           |
| Procedimientos      | Copia los datos de cabecera del procedimiento.                                                                         |

## Exclusiones obligatorias

| Información                                                                                          | Tratamiento aplicado                                                                                              |
| ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Trabajadores y KPI de Participantes                                                                  | **Nunca se copian.** El destino queda sin trabajadores asignados, KPI, metas, valores, desempeño ni evaluaciones. |
| Nombre, tipo y datos generales del proceso                                                           | **Nunca se copian.** Cada finca conserva su identidad, responsable, objetivo, alcance y demás datos generales.    |
| Partes interesadas, FODA, objetivos, Cumplimientos, Cronograma, Compromisos vinculados e Indicadores | **No se copian** dentro de esta iniciativa.                                                                       |
| Archivos, flujogramas y evidencias de Procedimientos                                                 | **No se copian.** Las URL, claves y tamaños de archivos se limpian; tampoco se copian registros adjuntos.         |

## Protección de datos y reglas de reemplazo

La operación se autoriza exclusivamente para Administrador y Gerente. Un Gerente queda limitado a su propia empresa y un Jefe de Proceso recibe rechazo desde el servidor, incluso si intentara invocar la operación fuera de la interfaz. La lista de destinos excluye el proceso fuente y el servidor verifica que cada proceso pertenezca a la misma empresa.

| Protección        | Comportamiento verificado                                                                                                                                                                                                                             |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sin sobrescritura | Cada módulo sólo se copia si el módulo destino está vacío; si ya contiene información se reporta como omitido.                                                                                                                                        |
| Sin borrado       | La operación no borra ni sustituye registros de procesos destino.                                                                                                                                                                                     |
| Duplicados        | Los destinos repetidos se deduplican y una segunda ejecución no duplica los módulos ya copiados.                                                                                                                                                      |
| Integridad        | Cada destino se procesa dentro de su propia transacción; un fallo revierte todas las inserciones de ese destino.                                                                                                                                      |
| Recursos          | Si se copian Participantes y Recursos juntos, cada recurso se enlaza al nuevo puesto del destino. Si se selecciona sólo Recursos y el puesto aún no existe, se conserva el nombre del puesto como referencia textual sin crear una relación inválida. |
| Previsualización  | Antes de confirmar se informa si cada módulo está listo, no tiene datos en el origen o será omitido por contener información en el destino.                                                                                                           |

## Auditoría del modelo y correcciones realizadas

Durante la validación se identificó que el Mapa de Subprocesos posee datos adicionales a su cabecera: entradas, subprocesos y salidas se guardan en estructuras hijas con orden propio. La copia se amplió para clonar también esas estructuras, evitando que un mapa de subprocesos quedara incompleto después de copiarlo.

También se confirmó que Recursos permite registros generales sin puesto asociado. La copia ahora conserva esos recursos con participante nulo, en lugar de omitirlos. Los recursos asociados a un puesto se enlazan al nuevo puesto sólo cuando existe una equivalencia segura en el destino.

## Prueba de integración aislada

Se añadió una prueba de integración específica, registrada exclusivamente en la suite que usa la base local aislada. La prueba crea una empresa y procesos temporales, realiza copias reales únicamente sobre esos datos y los elimina al finalizar. No modifica Agrogana, Masa Viva, archivos de usuarios ni datos productivos.

| Caso validado                                                  | Resultado |
| -------------------------------------------------------------- | --------- |
| Previsualización con módulos y destinos independientes         | Aprobado. |
| Copia de puestos, objetivo, responsabilidad y autoridad        | Aprobado. |
| Exclusión de trabajadores, KPI y valores de KPI                | Aprobado. |
| Copia de recursos asociados y recursos generales               | Aprobado. |
| Copia completa de mapa, entradas, subprocesos y salidas        | Aprobado. |
| Copia de procedimientos sin archivos, flujogramas ni registros | Aprobado. |
| Omisión de módulos ocupados sin modificarlos                   | Aprobado. |
| Ejecución repetida sin duplicados                              | Aprobado. |
| Rechazo de otra empresa y de Jefe de Proceso                   | Aprobado. |
| Reversión total de un destino ante fallo controlado            | Aprobado. |

## Validaciones locales realizadas el 8 de septiembre de 2026

La nueva prueba de integración pasó dentro de la suite local completa: **30 archivos y 129 pruebas aprobadas**. La verificación de tipos con `pnpm check` aprobó, al igual que la compilación local con `pnpm build`. La suite unitaria y de interfaz con `pnpm test --run` también aprobó: **55 archivos y 543 pruebas**.

La interfaz local sigue cargando correctamente y presenta el botón de copia para Administrador. Se comprobó además una previsualización sobre datos de Agrogana sin confirmar ni ejecutar. Esa revisión no modificó ningún proceso real: el resumen indicó correctamente un módulo ocupado que sería omitido y módulos sin datos en el origen seleccionado.

## Punto de continuación

La funcionalidad está lista para una última revisión local controlada. El siguiente paso debe ser abrir la Caracterización de `Producción: Aliaga`, seleccionar los módulos y destinos deseados y usar **solamente Revisión de copia**. El usuario debe comprobar que el resumen refleja exactamente los procesos que desea completar.

> No se debe presionar **Confirmar y copiar** sobre Aliaga ni sobre las demás fincas hasta que el usuario haya revisado y aprobado el resumen mostrado en la plataforma local.

No existe migración de esquema para esta funcionalidad, ni commit, PR o despliegue preparado. El despliegue a producción sigue requiriendo una aprobación explícita del usuario después de la revisión local, seguida del flujo seguro: lista blanca de archivos, revisión, respaldo transaccional, publicación y comprobación de producción.

## Reglas permanentes

- No desplegar sin confirmación explícita posterior a las pruebas locales.
- No restaurar, sobrescribir ni utilizar producción como entorno de prueba.
- No borrar empresas, procesos, nómina, KPI, archivos, evidencias, históricos ni configuraciones existentes.
- Excluir del control de versiones respaldos, archivos temporales de prueba y configuraciones locales.

## Corrección de copia Aliaga → Yambo (9 de septiembre de 2026)

El usuario realizó una copia local de Aliaga a Yambo y reportó correctamente que el Mapa de Subprocesos se trasladó, pero Participantes quedó en cero. Se preservó el estado, se diagnosticó el origen mediante consultas de solo lectura y se identificó una compatibilidad histórica: los diez puestos de Aliaga estaban guardados con el identificador del proceso (`2220001`) en vez del identificador de su caracterización (`690001`). La primera versión de la copia consultaba sólo el identificador nuevo y, por ello, interpretó incorrectamente que Aliaga no tenía participantes.

La corrección es aditiva y no cambia, mueve ni borra puestos históricos. El origen de la copia y la comprobación de ocupación de cada destino ahora consideran ambos formatos válidos: el identificador de Caracterización y el identificador histórico del proceso. Se actualizó la prueba de integración para simular expresamente el formato histórico y pasó dentro de la suite de integración: 30 archivos y 129 pruebas aprobadas. `pnpm check` también aprobó.

Después de una previsualización que confirmó 10 puestos disponibles y 0 en Yambo, se completó exclusivamente el módulo Participantes de Aliaga a Yambo. El mapa de subprocesos existente no se tocó. La verificación visual local confirmó en Yambo 10 puestos de trabajo —incluidos Jefe de Finca, Técnico de cultivo, Supervisores, Bodeguero y los demás—, cero trabajadores vinculados y cero KPI, conforme a las exclusiones. También se abrió el detalle de Jefe de Finca y se verificó que contiene el objetivo, las responsabilidades y la autoridad copiados desde Aliaga.

No se desplegó nada a producción. La siguiente acción segura es que el usuario recargue la página local de Participantes de Yambo y confirme visualmente los puestos. Para copias hacia otras fincas, debe usarse la opción de copia selectiva con previsualización; si algún módulo ya fue copiado, el sistema lo omitirá y no duplicará ni reemplazará información.
