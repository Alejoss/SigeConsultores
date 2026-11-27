# Años de gestión: almacenamiento y transición

La gestión empresarial admite selección global de año, con espacios empresariales independientes. Crear el año siguiente **no cierra el anterior**. Los procesos se incorporan gradualmente, después de su preparación y aprobación real. Las cuentas, permisos, cursos en línea y controles de planificación son canónicos; el resto se consulta mediante el espacio del año seleccionado.

## Conservación de datos

2026 abierto usa las tablas originales. El año nuevo utiliza tablas físicas aditivas `aw_<workspaceId>_<tabla>`, con identidad completa `(workspaceId, tabla, id)`. Un cierre explícito publica una copia histórica y rechaza escrituras posteriores. No hay restauraciones locales sobre producción, eliminación de tablas históricas ni sustitución de los datos de clientes por ejemplos.

Estrategia se conserva según las seis opciones de Gerencia. Sistemas de Gestión, Cumplimientos y Auditorías conservan la información acordada. Los programas mantienen datos generales y documentos, pero no copian automáticamente acciones como ejecución nueva. Inspecciones y Simulacros empiezan sin registros nuevos. Los pendientes históricos se siguen por separado. Capacitaciones corporativas conservan procedencia y hechos; las anteriores se agrupan por año. Organización y Personal mantiene estructura y competencias; los resultados anteriores no se convierten en evaluaciones nuevas.

## Decisiones del dueño de proceso

En **Ciclos → Decisiones** se presentan las acciones de la fuente del Cronograma Consolidado: OTE, OTG, partes interesadas, cumplimiento, **compromisos vinculados** y **Control y liberación de salidas**. Las definiciones de KPI de participantes se revisan adicionalmente. Cada elemento permite **Migrar**, **No migrar** o **Revisar**. El porcentaje mostrado es de referencia del año origen; no representa ejecución nueva ni significa que se cierre el año anterior.

Una preparación previa puede actualizarse explícitamente. Al añadir elementos debe conservar las decisiones anteriores e invalidar la aprobación que no incluía los elementos nuevos. El proceso ya incorporado no se vuelve a preparar ni se sobrescribe.

Los periodos de salida admitidos se incorporan con su configuración y ejecución pendiente, sin actor, fecha de liberación ni evidencia de ejecución anterior. Las fuentes históricas de compromisos se identifican por una referencia anual explícita; nunca se sincroniza un resultado nuevo sobre un padre de 2026. Los hechos corporativos que se conservaron expresamente no se reinician ni duplican por una decisión individual.

## Esquema y publicación

La publicación sigue `infra/staging-cicd` → PR a `main` → CI → CD. El CD exige pruebas verdes y un respaldo transaccional de la **base productiva real**, validado con `gzip -t` y SHA-256 antes de arrancar la imagen nueva. Ese respaldo incluye todas las tablas anuales.

`drizzle.config.ts` excluye `aw_*` de `db:push --force`; sus definiciones nunca se eliminan por sincronización del esquema. Antes del arranque, `scripts/annual-additive-schema.mjs` agrega únicamente `linkedCommitments.sourceWorkspaceId INT NULL` a la tabla original y a namespaces existentes que la necesiten. Verifica el tipo de columnas existentes y rechaza incompatibilidades, sin DML ni DROP. Las nuevas tablas creadas con `CREATE TABLE LIKE` ya incluyen la columna. Los tres ENUM `itemType` de control agregan `linked_commitment` y `output_release` al final, sin renumerar valores existentes.

El script `annual-extend-decision-enums.mjs` es exclusivamente para las bases locales anuales de revisión y TEST; no es una herramienta para restaurar ni modificar producción. La publicación aplica el esquema mediante el flujo normal respaldado.

## Pruebas y límites

Las suites anuales reales se ejecutan exclusivamente en `127.0.0.1:3307/isge_annual_test` o en CI con `CI=true` y `127.0.0.1:3306/sige_platform_test`. Una base distinta provoca fallo antes de conectar; no se permite saltar silenciosamente las pruebas anuales en CI. Las fixtures tienen propiedad explícita, IDs propios y limpieza por su ledger; los namespaces de prueba no se reutilizan ni se borran.

La validación local no equivale a migrar con datos actuales de clientes. Nunca debe declararse producción actualizada solo por tener una compilación local, una imagen GHCR o un job de despliegue omitido. Es necesario comprobar CI, CD y la salud de la versión realmente publicada. La página comercial `/presentacion` permanece fuera de esta modificación.
