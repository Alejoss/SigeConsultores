# Gestión de Cambios: implementación inicial

## Propósito

**Gestión de Cambios** transforma una propuesta de mejora en un expediente controlado. El expediente conserva qué se desea cambiar, por qué se plantea, a quién afecta, qué acciones se asignaron, qué evidencia se presentó y cuál fue la decisión de Gerencia al cerrar.

El módulo se ubica en **Estrategia**. Se accede desde la tarjeta **Gestión de cambios** y utiliza la empresa seleccionada de la sesión actual.

## Flujo del expediente

El ciclo de vida es el siguiente:

```text
Borrador → En evaluación → Aprobado → En ejecución
→ Implementado, pendiente de verificación → Cerrado
```

Un expediente también puede cancelarse desde cualquier etapa anterior al cierre. La cancelación requiere una explicación. La aprobación y el cierre requieren una nota de decisión gerencial.

Un Jefe estándar puede crear una **sugerencia**. La sugerencia no cambia ningún registro corporativo. Gerencia puede convertirla en un expediente formal cuando considere que el cambio debe ejecutarse.

## Responsabilidades y permisos

El **Gerente** y el **Administrador** pueden crear y diseñar expedientes, aprobarlos, cancelarlos y autorizar el cierre. El **Coordinador de empresa** puede crear y administrar el diseño corporativo, pero no aprobar ni cerrar.

El **Responsable de gestión del cambio** se asigna preferentemente seleccionando un **proceso de la empresa**. Así, su dueño puede impulsar las acciones asignadas a ese proceso sin recibir facultades de aprobación o cierre. Si la persona no corresponde a un proceso de ISGE, puede seleccionarse **Otro** e indicar su cargo o nombre; también puede dejarse **Asignar después**.

El **Jefe estándar** puede consultar los expedientes de su empresa, proponer una sugerencia y gestionar únicamente las acciones vinculadas a su propio proceso. Las acciones se completan desde **Compromisos vinculados**, no desde el expediente.

Las acciones siguen teniendo su propio proceso responsable, que es el que recibe el compromiso vinculado. El proceso de seguimiento del expediente no reemplaza esas acciones: organiza y da continuidad al cambio completo.

## Contenido del expediente

Cada expediente permite registrar lo siguiente:

- Definición: nombre, descripción, origen, motivo, objetivo, resultado verificable, impacto y fechas.
- Alcance: objetivos estratégicos, procesos, subprocesos, partes interesadas, riesgos u oportunidades, indicadores y medidas propias.
- Impactos: calidad, ambiente, seguridad y salud ocupacional, cumplimiento legal, recursos, tecnología, competencias, información, riesgos, sistemas de gestión, control y seguridad BASC u otra categoría.
- Acciones: proceso responsable, responsable nominal, fecha, recursos, capacitación, documento a actualizar y evidencia esperada.
- Indicadores de resultado: valor inicial, meta, valor alcanzado y fecha de medición.
- Verificación: resultado efectivo, parcialmente efectivo o no efectivo; observaciones y fecha de verificación. Se guarda automáticamente al terminar de editarla.
- Historial automático: creación, actualizaciones, transiciones, acciones, indicadores y evidencias relevantes. No se edita manualmente, para preservar trazabilidad.
- Etapa actual y siguiente paso: explica el significado del estado, quién debe intervenir y cuál es la condición para avanzar.

Los expedientes y el formulario **Nuevo cambio** se abren en una vista amplia de página completa para facilitar la lectura y edición. El botón **Salir**, junto a la etiqueta del estado del expediente, regresa a la lista de Gestión de Cambios sin alterar información.

Para cambios de impacto medio o alto, la aprobación exige al menos un vínculo de alcance, un impacto, un indicador de resultado, un responsable de gestión y una acción planificada con proceso, fecha y evidencia esperada.

## Integración con Compromisos vinculados

Al crear una acción, ISGE 360 crea un compromiso vinculado del proceso seleccionado. La acción aparecerá en los espacios operativos del proceso que ya utilizan los compromisos vinculados, incluido su cronograma e indicadores.

El proceso responsable debe cargar la evidencia cuando ésta haya sido solicitada y después marcar el compromiso como cumplido. El sistema sincroniza ese avance con la acción del expediente. El vínculo no se puede borrar desde Compromisos vinculados, porque forma parte de la trazabilidad del cambio.

El expediente no se puede cerrar si quedan acciones pendientes, si un indicador no tiene resultado medido, o si falta la verificación documentada. Gerencia conserva la decisión final de cierre.

## Datos y migración

La migración `0092_change_management.sql` es **aditiva**. Crea las tablas de expedientes, sugerencias, alcance, impactos, acciones, indicadores y eventos. También amplía el enum de `linkedCommitments.sourceType` con `change_action`.

La migración `0093_change_management_responsible_process.sql` también es **aditiva**: agrega un campo opcional de proceso responsable de seguimiento. Los expedientes existentes se conservan exactamente como están; simplemente mantienen este nuevo campo vacío hasta que se cree o actualice un expediente con la nueva opción.

La migración no borra ni transforma información previa de empresas, procesos, compromisos, reuniones ni módulos existentes.

## Validación local realizada

La implementación se validó con:

- Comprobación de TypeScript (`pnpm check`).
- Prueba de integración de sugerencia, permisos, acciones vinculadas, evidencia, indicador, verificación y cierre gerencial.
- Regresiones focalizadas de Coordinador de empresa y Reuniones.
- Revisión visual local como Administrador y como Pedro, Jefe estándar de Masa Viva. El Administrador ve el formulario corporativo y los responsables vigentes. El Jefe ve sólo **Sugerir cambio** y el aviso de consulta y participación.

## Referencias

[1]: ./propuesta-gestion-de-cambios-2026-10-20.md "Diseño funcional acordado de Gestión de Cambios"
