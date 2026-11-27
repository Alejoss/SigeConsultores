# Accesos granulares del equipo — ISGE 360

Implementación basada en `34228f80`, revisada localmente y autorizada para publicación el 27/11/2026. No modifica contraseñas, login, roles globales ni la autorización independiente de Capacitaciones en Línea.

## Modelo canónico

Los permisos pertenecen a **empresa + cuenta**, no a un año ni a una caracterización anual. `account_roles` sigue determinando el proceso propio. Las tablas nuevas `companyTeamModuleAccess`, `companyTeamProcessAccess` y `companyTeamAccessAudit` son canónicas y deben permanecer excluidas de los espacios anuales.

| Módulo | Clave |
|---|---|
| Estrategia | `strategy` |
| Sistemas de gestión | `management_systems` |
| Gestión de cambios | `change_management` |
| FODA empresarial | `company_foda` |
| Organización y personas | `organization_personnel` |

Los niveles corporativos son `none`, `read` y `write`. Un Jefe estándar conserva lectura corporativa y escritura de su proceso propio; un Coordinador conserva escritura corporativa y lectura de organización/personas. Una fila explícita sustituye el valor heredado, incluso cuando indica `none`. Una fila explícita de Estrategia se hereda a Gestión de cambios y FODA empresarial si no existe una fila explícita del hijo; el hijo explícito siempre gana. No se hereda a SIG ni a personas.

La escritura de Nómina, Organigrama y administración de personas continúa reservada a Gerencia/Administración. Un nivel `write` almacenado para `organization_personnel` se presenta como lectura efectiva a Jefes y nunca habilita esas mutaciones. Gerencia conserva acceso completo a su empresa; Administración conserva el acceso de negocio existente. Solo Gerencia de la empresa puede gestionar estos nuevos permisos.

Un permiso adicional de proceso autoriza **solo** el ID validado del catálogo canónico de la misma empresa, con `read` o `write`. No concede acceso a todos los procesos ni cambia la asignación propia. Los permisos de otra cuenta o empresa, o cuyo proceso ya no pertenece al catálogo, no se aplican. El proceso propio conserva escritura implícita y se excluye de las filas adicionales que se reemplazan.

## Contrato tRPC

`teamAccess.getMyDetailedAccess({companyId})` retorna:

```ts
{
  moduleAccess: Record<TeamModuleKey, 'none' | 'read' | 'write'>;
  processAccess: Array<{processId: number; accessLevel: 'read' | 'write'}>;
  ownProcessId: number | null;
  fullAccess: boolean;
}
```

`processAccess` contiene únicamente permisos adicionales. Para Gerencia/Administración, `fullAccess` es verdadero y no hace falta enumerar todos los procesos. `listProcessLeaders` conserva los campos anteriores y agrega esta información efectiva por cuenta.

`teamAccess.setDetailedAccess({companyId, accountId, moduleChanges, processAccess?})` modifica únicamente los módulos mencionados en `moduleChanges`. Omitir `processAccess` conserva los adicionales; enviar un arreglo los reemplaza solo para esa cuenta/empresa; enviar `[]` los elimina. Un elemento de proceso sin `accessLevel` se interpreta como **read**, nunca como escritura tácita. Se rechazan claves o IDs duplicados.

La operación verifica una cuenta activa con asignación activa de Jefe en la misma empresa, valida todos los procesos canónicos, bloquea la cuenta para serializar reemplazos y actualiza módulos, procesos y bitácora en una única transacción. Una falla en la bitácora revierte los permisos. No se amplía el ENUM de `accessAuditLog.eventType`.

`suspendProcessLeader`, `reactivateProcessLeader` y `reassignProcessLeader` aceptan `accountId` opcional. Los inputs antiguos siguen funcionando si hay una única asignación; cuando hay varios Jefes, se exige seleccionar una cuenta y nunca se actualiza a todos accidentalmente. La reasignación conserva la regla existente de no ocupar un proceso que ya tenga un Jefe activo.

## Política por solicitud

`hydrateTeamAccessContext(ctx, {mode, path?, module?, companyId?, rawInput?})`, en `server/_core/teamAccessPolicy.ts`, devuelve una copia del contexto con `requestMode`, `teamAccessModule` y `teamAccessPolicy`. El middleware de `companyProcedure` y `protectedProcedure` lo ejecuta **antes** de entrar al espacio anual. Las consultas canónicas usan `withoutAnnualScope`; no existe caché global ni mutación del contexto compartido de un batch HTTP.

Los guards síncronos de `companyPermissions.ts` y `sessionScope.ts` verifican la política hidratada. `query` exige lectura y `mutation` escritura. Esto incluye las rutas que primero resuelven un registro a su proceso. Un permiso extra de lectura no permite actualizar/eliminar registros ni escribir destinos de copia. Los servicios legacy sin política conservan su guard anterior; ningún request de negocio real de Jefe omite la hidratación. Las rutas de cursos en línea mantienen su autorización independiente y no dependen de las tablas de permisos ISGE.

`assertCompanyManagementAccess` usa únicamente el módulo identificado en el request: autorizar Estrategia no habilita SIG ni acciones sin módulo resuelto. Los guards de alcance ordinarios de empresa/proceso permanecen vigentes. El permiso de módulo no sustituye validaciones de propiedad del registro.

Se conservan tres contratos anteriores: `changeManagement.suggest` permite proponer con lectura del módulo, pero mantiene escritura del proceso y bloqueo del año cerrado; `listAssignableFindingProcesses` y `listAssignableComplianceProcesses` exigen **escritura de SIG**, aunque sean consultas, y solo entregan identidad de destinos, no sus contenidos; el histórico corporativo sin un proceso asociado exige escritura de SIG o acceso completo. La lectura estándar no obtiene ese histórico corporativo ni los selectores de gestión. Una denegación explícita del módulo sigue prevaleciendo.

## Mapeo de rutas y revisión de consultas mixtas

| Familia de rutas reales | Política |
|---|---|
| `companyInfo`, `companyValues`, `policies`, `policyObjectives`, `strategicObjectives`, `strategicTrends` | Estrategia |
| `fodasRouter` | FODA empresarial |
| `changeManagement` | Gestión de cambios |
| `auditsInspections`, `managementSystemChecklist`, `managementPrograms`, `companyCompliances`, `companyCompliancesLegacy`, `companyTrainings`, `trainingSchedules`, `trainingBackups`, `operationalFindings` | SIG, incluidas sus seis familias corporativas |
| `organizationChart`, `payroll` (incluye `jobDescriptions`) | Organización/personas, escritura reservada |
| `linkedCommitments.listSourceProgress`, `.listSourceEvidence`, `.createLinks` | SIG o Cambios según `sourceType`; acuerdos de reunión mantienen ACL de proceso |
| `documents` para Policy/Values/StrategicObjectives | Estrategia según el tipo real |
| `processMap`, módulos de proceso, reuniones, compromisos propios y cursos en línea | No se convierten en módulos corporativos; mantienen sus guards específicos |

Los documentos `ProcessMap` e `Indicators` no pertenecen a Estrategia. Un borrado por ID exige resolver el tipo real del documento; los datos históricos `Varios` pueden mezclar valores/objetivos/mapa y no permiten inferir autoridad de escritura con seguridad. No se debe autorizar por un tipo enviado por el cliente sin comprobar el registro.

**La capa de política no bloquea todo el dashboard ni garantiza por sí sola filtros de consultas mixtas.** Antes de publicación deben quedar verificados los siguientes casos por los routers/servicios consumidores:

| Consulta mixta | Revisión requerida |
|---|---|
| `consolidatedSchedule`, `macroIndicators`, `strategicTrends` | Excluir procesos no autorizados y fuentes corporativas denegadas antes de generar datos/agregados; no limitarse a ocultar tarjetas del cliente. |
| `policyObjectives.getTraceability`, `fodasRouter.listProcessFODAs`, `changeManagement` catálogos/enlaces | Filtrar evidencia/catálogos por procesos autorizados; respetar módulos fuente denegados. |
| `annualHistory`, snapshots/reportes/exportaciones | Redactar secciones corporativas denegadas y procesos ajenos incluso en años históricos. |
| `linkedCommitments` y reuniones | Mantener responsabilidades propias disponibles con SIG denegado, y evitar que proyección de responsabilidades incluya información corporativa adicional no autorizada. |
| Copia de caracterización, enlaces y asignaciones | Lectura de origen y **escritura explícita** de cada destino; un catálogo de destinos no es autorización para editar. |
| Upload/import HTTP | Hidratar contexto y validar módulo + proceso antes de storage/SQL; no usar solamente auth legacy casteado a `TrpcContext`. |

## Esquema y despliegue

El código no captura errores de SQL para volver al permiso legacy si faltan tablas nuevas: la validación falla cerrada. Crear y verificar las tres tablas **antes** de habilitar el código. El bootstrap aditivo `scripts/team-access-additive-schema.mjs` pertenece a la integración de despliegue; solo crea estas tablas, no altera ni elimina tablas existentes ni escribe asignaciones. No ejecutar un `db:push` amplio sobre producción para esta funcionalidad. La configuración de arranque y el manifiesto anual reconocen las tres tablas canónicas. La publicación sigue el flujo autorizado staging → PR a main → CI → CD, con respaldo productivo obligatorio previo al cambio de imagen; no incorpora cuentas ni datos ficticios de revisión.

El compose productivo fija `RUN_DB_PUSH_ON_STARTUP=false`: esta entrega no necesita ejecutar `pre-push-schema-compat` ni `drizzle-kit push --force` sobre las tablas originales. Los bootstraps aditivos se ejecutan igualmente antes del servidor. Las futuras modificaciones de esquema deben incluir una migración controlada y su respaldo, en lugar de depender de una sincronización general automática.

## Verificación local

Las pruebas nuevas de `server/_core/__tests__/teamAccessPolicy.test.ts` y `server/routers/__tests__/teamAccessDetailed.test.ts` cubren fallback, denegación explícita, herencia, separación por cuenta/empresa, lectura/escritura de procesos adicionales, rutas reales, reemplazo transaccional, rollback de bitácora y acciones por cuenta. Las integraciones existentes de Coordinador y Capacitaciones en Línea verifican compatibilidad.

Los mocks de routers que simulan Jefes deben proporcionar el catálogo canónico y las tablas de permisos o mockear explícitamente el helper de hidratación. No se debe añadir una excepción de seguridad en producción para acomodar mocks incompletos. El conteo fijo de tablas en pruebas del manifiesto anual debe incluir las tres adiciones.
