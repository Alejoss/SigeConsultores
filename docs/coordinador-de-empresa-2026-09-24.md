# Coordinador de empresa: control delegado y protección de procesos

**Estado:** Implementado y validado en entorno local. **No se ha publicado ni desplegado a Producción.**

## Propósito

Esta mejora diferencia con claridad tres niveles de actuación dentro de una misma empresa. El Administrador conserva el acceso transversal de la plataforma. El Gerente General conserva la administración completa de su empresa. El Jefe de Proceso puede consultar los módulos corporativos de su empresa y gestionar íntegramente el proceso que tiene asignado, pero no puede modificar módulos corporativos ni acceder a procesos de otros Jefes.

El Gerente puede elevar a un Jefe específico al nivel de **Coordinador de empresa**. Esa autorización permite editar los módulos corporativos de la empresa, como Sistemas de Gestión, Programas, Cumplimientos, Auditorías, Inspecciones, Estrategia, documentación y otros módulos empresariales protegidos. La coordinación no concede acceso a los procesos de otros Jefes, no concede administración de accesos de personas y no habilita edición de Nómina u Organigrama.

## Uso en la plataforma

El Gerente General encuentra el control en **Accesos del equipo**. En la tarjeta de cada Jefe de Proceso aparece el botón **Autorizar coordinación**. Antes de confirmar, la plataforma explica que el Jefe podrá editar módulos corporativos, pero no abrir o modificar procesos de otros Jefes ni gestionar personas. Si la autorización ya existe, el mismo control se convierte en **Revocar coordinación**.

La revocación es inmediata y reversible. El Jefe vuelve al modo estándar: conserva la gestión completa de su propio proceso y la consulta de los módulos de la empresa, sin perder información, procesos, documentos ni historial.

El panel del Jefe muestra su alcance vigente. Cuando es Coordinador, indica expresamente que la autorización no le permite consultar o editar procesos ajenos ni administrar accesos. Cuando no lo es, muestra que puede solicitar al Gerente la autorización de Coordinador.

## Controles aplicados

| Área | Jefe estándar | Coordinador de empresa | Gerente General |
|---|---|---|---|
| Módulos corporativos | Consulta | Edición | Edición total |
| Proceso propio | Gestión completa | Gestión completa | Gestión completa |
| Procesos de otros Jefes | Sin acceso | Sin acceso | Acceso completo |
| Nómina y Organigrama | Consulta | Consulta | Edición |
| Accesos, invitaciones, suspensión y reasignación de Jefes | Sin acceso | Sin acceso | Gestión completa |
| Crear, editar o eliminar la estructura del Mapa de Procesos | Sin acceso | Sin acceso | Gestión completa |
| Capacitaciones: registros, importación, respaldos y cronograma anual | Consulta, descarga y exportación | Edición | Edición total |

En **Capacitaciones**, el Jefe estándar puede consultar el detalle, abrir y descargar respaldos existentes, abrir el cronograma anual, exportar a Excel, descargar la plantilla y abrir el Gantt. No puede crear, editar, eliminar, importar, vaciar registros, subir o eliminar respaldos, ni subir, reemplazar o eliminar el cronograma anual. El Coordinador conserva esas operaciones corporativas, sin que ello le dé acceso a procesos ajenos ni a la administración de personas.

Las rutas de carga de documentación de Sistemas de Gestión y Programas aplican el mismo control; no son una vía alternativa para modificar módulos corporativos sin autorización. También se reforzaron rutas antiguas de invitación, perfil de gerente y administración jerárquica para que respeten la separación de empresas y privilegios.

## Datos y trazabilidad

La migración aditiva `0088_company_management_access.sql` incorpora la tabla `companyManagementAccess`. Cada autorización se vincula a una empresa y a una cuenta de Jefe de Proceso; sólo puede existir una configuración por combinación empresa–cuenta. La tabla no modifica roles, procesos, empresas ni contenido operativo existente.

El registro de auditoría incorpora los eventos `company_management_access_granted` y `company_management_access_revoked`, con una descripción clara del cambio. La migración y su estructura fueron verificadas en la base local aislada.

## Validación local realizada

Se ejecutaron satisfactoriamente `pnpm check`, `pnpm build`, `pnpm test --run` y `pnpm test:integration`. El conjunto de integración finalizó con **33 archivos y 146 pruebas aprobadas**, incluida la nueva prueba dedicada a Coordinadores. Esta prueba verifica que un Jefe estándar no pueda modificar módulos corporativos ni Capacitaciones, que pueda consultarlas, que el Gerente pueda autorizar y revocar al Coordinador, que el Coordinador pueda editar los módulos permitidos y Capacitaciones sin abrir procesos ajenos, y que Nómina permanezca reservada al Gerente.

> La revisión local aún debe realizarse con una sesión de Gerente y otra de Jefe antes de cualquier autorización de despliegue. No se creó ninguna autorización real ni se alteró información de empresas durante las pruebas.

## Guion de revisión local

1. Iniciar sesión como Gerente de una empresa de prueba y abrir **Accesos del equipo**.
2. Seleccionar un Jefe activo y presionar **Autorizar coordinación**; confirmar el diálogo.
3. Iniciar sesión con ese Jefe. Verificar el mensaje de alcance, editar un módulo corporativo permitido y confirmar que su proceso sigue siendo el único proceso disponible en Mapa de Procesos.
4. Comprobar que Nómina, Organigrama y Accesos del equipo no permiten modificaciones desde la sesión del Coordinador.
5. Revocar la coordinación desde la sesión del Gerente. Con la sesión del Jefe, abrir **Capacitaciones** y comprobar que se muestra el aviso de modo consulta. Deben permanecer visibles los registros, Gantt, plantilla, exportación y respaldos existentes; no deben aparecer importación, formulario de nueva capacitación, edición, eliminación, carga de respaldos ni administración del cronograma anual.
6. Confirmar que el Jefe conserva su proceso, pero que los módulos corporativos vuelven a estar en modo de consulta.

No debe realizarse despliegue a Producción hasta que esta revisión local reciba autorización explícita.
