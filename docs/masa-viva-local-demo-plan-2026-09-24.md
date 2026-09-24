# Masa Viva: plan de demostración integral local

**Estado:** Preparación de carga local. **Ámbito:** exclusivamente la empresa ficticia Masa Viva, `companyId=90003`, dentro de la base local aislada `sige_working_local_aug31`. Este plan no autoriza cambios en Producción ni en empresas reales.

## Propósito de la demostración

Masa Viva será una empresa ficticia ecuatoriana de panadería y pastelería artesanal. La demostración mostrará cómo ISGE 360 conecta la planificación, la operación, el talento humano, los sistemas de gestión y el seguimiento. Todos los nombres, identificaciones, evidencias y referencias serán demostrativos. No se usarán correos reales de personal ni se crearán invitaciones.

La empresa conservará datos históricos útiles cuando sean coherentes. Los registros incompletos, duplicados o incongruentes se sustituirán por información demostrativa trazable. Antes de cualquier escritura se creó el inventario lógico local `local-backups/masa-viva-before-demo-2026-09-24.json`.

## Hallazgos que justifican la actualización

La auditoría local confirmó que Masa Viva contiene datos dispersos. De sus once procesos existentes, diez no tienen caracterización completa. El catálogo mezcla procesos con cargos, por ejemplo Panadero y Operario de producción. También existen sistemas, programas, auditorías y capacitaciones con contadores históricos, pero sin suficiente detalle operativo para una demostración.

La carga nueva normalizará la presentación sin modificar otras empresas. Los procesos quedarán descritos como unidades de gestión; los cargos se usarán como participantes y trabajadores de nómina. Las acciones, indicadores y acuerdos usarán fechas demostrativas de 2026 y 2027 para que haya elementos completados, en curso y pendientes.

## Mapa de procesos objetivo

| Tipo | Proceso demostrativo | Responsable ficticio | Enfoque de la demostración |
|---|---|---|---|
| Estratégico | Dirección y Planeación | Gerencia General | Estrategia, objetivos, revisión gerencial y ciclo anual. |
| Estratégico | Gestión de Calidad e Inocuidad | Coordinación SIG | Política, BPM, requisitos, indicadores y auditorías. |
| Misional | Compras y Logística | Coordinación de Abastecimiento | Proveedores, recepción, inventario y entregas. |
| Misional | Producción y Calidad | Jefatura de Producción | Elaboración, control de lote, calidad, inocuidad y empaque. |
| Misional | Comercial y Servicio | Jefatura Comercial | Pedidos, ventas, atención y satisfacción del cliente. |
| Soporte | Administración y Finanzas | Jefatura Administrativa | Flujo de caja, obligaciones, facturación y pagos. |
| Soporte | Gestión Humana y SST | Coordinación de Gestión Humana | Nómina, formación, desempeño, SST y bienestar. |
| Soporte | Mantenimiento, Limpieza y Servicios Generales | Supervisión de Servicios | Equipos, limpieza, desinfección y servicios generales. |
| Soporte | Gestión Documental y Tecnología | Analista Documental | Control documental, registros y soporte de información. |

Los registros históricos que se presenten como cargos serán transformados a procesos equivalentes cuando la relación sea inequívoca. Si un registro no encaja en la cadena de valor, se conservará como referencia documental solamente cuando no afecte la demostración.

## Contenido demostrativo por módulo

Cada proceso recibirá una caracterización con propósito, alcance, responsable ficticio, participantes, recursos, partes interesadas y mapa de subprocesos. La carga usará las tablas normalizadas de entradas, actividades y salidas para evitar depender de texto JSON sin estructura. Producción y Calidad incluirá recepción de materias primas, preparación, horneado, control de calidad, empaque y despacho. Comercial incluirá oportunidades, pedidos, coordinación de producción, facturación y satisfacción.

La nómina se alineará a los puestos definidos en Caracterización. Se conservarán trabajadores ficticios que sean útiles y se completarán vínculos de puesto, KPI y valores mensuales. Los KPI tendrán metas, resultado actual y desempeño diverso para permitir una explicación realista de Nómina y Desempeño.

La estrategia incluirá objetivos corporativos, OTE, objetivos operativos y tareas. Cada proceso tendrá al menos una actividad de seguimiento con fecha puntual, semanal o mensual y un tipo de seguimiento visible. Las actividades alimentarán el Cronograma consolidado sin construir agendas paralelas.

La gestión operativa incorporará un FODA, riesgos, partes interesadas y criticidad diferenciada por proceso. Se incluirán controles relacionados con inocuidad, disponibilidad de materias primas, trazabilidad, satisfacción de clientes, SST, protección de datos y continuidad operativa. Las acciones tendrán responsable, fecha, avance y estado congruentes.

Los sistemas de gestión presentarán Calidad e Inocuidad Alimentaria, SST y Seguridad Física/BASC cuando corresponda. Calidad e Inocuidad tendrá una lista de verificación demostrativa de BPM, higiene, limpieza y desinfección, control de plagas, recepción de materias primas, trazabilidad, alérgenos, producto no conforme y retiro. Los programas conservarán cualquier línea base histórica y recibirán acciones estructuradas nuevas; no se reducirán sus contadores previos.

La empresa tendrá capacitaciones, una auditoría interna, una inspección de producción y hallazgos detallados. Existirá al menos un hallazgo cerrado y uno pendiente, ambos vinculados al proceso responsable. Se crearán reuniones de revisión gerencial y coordinación Comercial–Producción, con acuerdos de responsables locales y de otros procesos. Los acuerdos vinculados aparecerán en Compromisos vinculados y en el Cronograma consolidado.

## Salvaguardas de ejecución

La carga se ejecutará dentro de una sola transacción y comprobará, antes de escribir, que la conexión corresponde a `localhost` o `127.0.0.1`, que el nombre de la base contiene `sige_working_local` y que existe una única empresa Masa Viva con ID `90003`. Cualquier otro host, base o compañía detendrá el proceso antes de realizar cambios.

El script no leerá `.env`, `.env.production`, credenciales de Producción ni servicios de correo. Usará exclusivamente `.env.local`. No cargará archivos a S3 ni eliminará archivos existentes. Los identificadores se resolverán por el `companyId` y los nombres de proceso definidos en este documento; no usará identificadores de otras empresas.

Después de la carga se ejecutará una auditoría de solo lectura. Esta validará que los procesos estén caracterizados, que no haya duplicados de criticidad, que los vínculos de nómina sean canónicos, que los cierres no superen los hallazgos, que los acuerdos y compromisos coincidan y que el Cronograma consolidado reciba las fuentes esperadas.

## Secuencia de trabajo

| Etapa | Resultado esperado | Estado |
|---|---|---|
| Inventario y respaldo lógico local | Conteos de Masa Viva antes de la actualización | Completado |
| Diseño de cadena de valor y datos demostrativos | Procesos, responsables, narrativa y relaciones definidos | Completado |
| Carga transaccional protegida | Datos integrales de Masa Viva solamente en local | Completado |
| Verificación técnica | Indicadores, cronograma, compromisos y fuentes coherentes | Completado |
| Revisión visual del usuario | Aprobación de la demostración local | En curso |
| Copia selectiva a Producción | Solo Masa Viva, tras autorización explícita y respaldo | Procedimiento validado localmente; pendiente de ejecución manual protegida |

## Resultado de la carga local

El 24 de septiembre de 2026 se completó la carga en una transacción dirigida exclusivamente a la base local aislada. La conexión validó el host local, el nombre de la base y la identidad única de Masa Viva antes de modificar datos. No se consultó ni alteró Producción, no se enviaron correos y no se modificaron otras empresas.

La demostración resultante contiene once procesos, diez caracterizaciones completas, quince colaboradores activos y tres pasivos, diecisiete asignaciones de puesto, diez KPI individuales y noventa resultados mensuales. También contiene diez riesgos, diez indicadores y ocho actividades con seguimiento. Para mostrar los módulos corporativos se cargaron tres sistemas de gestión, ocho requisitos de lista de verificación con sus acciones, tres programas con seis acciones, cinco capacitaciones y tres registros de cumplimiento.

El escenario de control incluye una auditoría, una inspección y tres hallazgos. El escenario de reuniones incluye cuatro reuniones, seis acuerdos y tres compromisos propios de proceso que se reflejan en Compromisos vinculados y en el Cronograma consolidado. La verificación posterior comprobó las relaciones críticas, entre ellas la ausencia de duplicados de criticidad y de asignaciones huérfanas.

> La demostración permanece **solamente local**. Llevar Masa Viva a Producción requerirá una revisión visual del usuario, una autorización expresa posterior y una operación selectiva que nunca copie ni reemplace información de otras empresas.

### Procedimiento selectivo preparado para Producción

Tras la autorización de copia selectiva, se preparó un paquete ficticio de Masa Viva y un transferidor transaccional independiente de la aplicación. El paquete contiene **11 procesos**, 18 registros de nómina, participantes y KPI, mapas de subprocesos, FODA, OTE, actividades, partes interesadas, sistemas de gestión, programas, capacitaciones, auditoría, inspección, hallazgos, tipos de reunión, reuniones, acuerdos y compromisos vinculados. Su checksum SHA-256 se comprueba antes de cualquier escritura para evitar transferir un paquete alterado.

La ejecución productiva no modifica el esquema, la interfaz ni las demás empresas. Exige una única empresa llamada **Masa Viva** y el mismo catálogo de procesos que fue validado localmente. Antes de escribir, verifica tablas requeridas, relaciones y ausencia de adjuntos dependientes que no puedan transportarse desde el almacenamiento local. Los documentos y matrices de proceso existentes se preservan; no se copian rutas ni archivos locales. Si una de esas validaciones falla, se detiene sin modificar datos.

La acción manual de GitHub exige la confirmación literal `TRANSFERIR-MASA-VIVA`. Una vez activada, ejecuta una prevalidación sin escritura, crea el respaldo completo habitual de la base de datos con `--single-transaction`, realiza la sustitución únicamente dentro de Masa Viva en una única transacción y compara los conteos finales. La prueba de idempotencia se ejecutó dos veces contra la base local: en ambas se verificaron 11 procesos, 14 actividades, 4 reuniones, 6 acuerdos, 3 compromisos vinculados, 18 colaboradores, 3 sistemas, 3 programas y 3 hallazgos; las cantidades agregadas de las otras empresas permanecieron invariantes. También se verificó la ausencia de referencias huérfanas en asignaciones, KPI, mapas, reuniones, acuerdos y compromisos.

### Ajuste de Nómina durante la revisión

Durante la revisión local se comprobó que la operación de pasar una persona a Personal Pasivo sí se completaba, pero la pantalla podía mostrar un mensaje genérico de fallo si la actualización visual posterior tenía una incidencia. Se ajustó la interfaz para conservar el resultado confirmado por el servidor y mostrar el detalle real cuando exista un error. La operación de negocio no se modificó.

Para demostrar la curva de rotación, Masa Viva conserva tres registros ficticios en Personal Pasivo: uno con salida en marzo de 2026 y dos con salida en agosto de 2026. Los diecisiete colaboradores iniciales no se reemplazaron; se preservó un respaldo lógico local anterior al ajuste. La verificación posterior confirmó 15 personas activas, 3 pasivas y dos meses visibles en la curva de rotación.

### Complemento focalizado de dos procesos

El 24 de septiembre de 2026 se completaron de forma focalizada los procesos **Gestión de Calidad e Inocuidad** y **Comercial y Servicio**, siempre dentro de la base local aislada. Antes de la carga se creó el respaldo adicional `local-backups/masa-viva-two-processes-before-completion-2026-09-24.json`, excluido del control de versiones.

Cada proceso contiene tres entradas o partes interesadas, tres subprocesos y dos salidas en el mapa operativo; tres relaciones con partes interesadas y su criticidad; cinco elementos FODA; dos filas OTG con tareas y avance; dos OTE con planificación y objetivos operativos; tres actividades con programaciones puntual, semanal o mensual y tipo de seguimiento; y una reunión con acta, dos acuerdos y un compromiso propio vinculado. Las actividades y los compromisos fueron comprobados usando la misma fuente del Cronograma consolidado: Comercial y Servicio registra **37** elementos de cronograma, de los cuales 29 son ocurrencias de actividades y 1 es el acuerdo vinculado; Gestión de Calidad e Inocuidad presenta el mismo alcance. El promedio de avance de las actividades es 67% y 55%, respectivamente.

La validación utilizó únicamente consultas de lectura después de la carga. No se crearon archivos, invitaciones ni correos, y no se modificó Producción ni registros de otras empresas.

## Fuentes locales consultadas

- `local-backups/masa-viva-before-demo-2026-09-24.json`.
- `drizzle/schema.ts`.
- `masa_viva_demo_plan.md`.
- `masa_viva_demo_guide.md`.
- Auditoría local por áreas funcionales del 24 de septiembre de 2026.

## Referencias

[1]: https://isge360.com "ISGE 360"
