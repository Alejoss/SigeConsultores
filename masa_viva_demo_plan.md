# Masa Viva — Escenario demostrativo de ISGE 360

## Identidad demostrativa

**Masa Viva** será una empresa ecuatoriana ficticia dedicada a la elaboración y comercialización de panadería y pastelería artesanal, con una planta de producción, un punto de venta propio y atención a pedidos corporativos. Su propósito demostrativo es evidenciar cómo ISGE 360 integra estrategia, gestión operativa, cumplimiento, personal y desempeño en una empresa pequeña que ya necesita procesos claros.

La empresa tendrá 15 colaboradores activos y una operación suficiente para mostrar indicadores reales de uso, sin saturar la demostración con registros repetitivos.

## Procesos de la empresa

| Macroproceso | Proceso | Responsable demostrativo | Enfoque para la demostración |
|---|---|---|---|
| Estratégico | Dirección y Planeación | Gerente General | Objetivos anuales, seguimiento y activación de ciclos. |
| Misional | Producción y Calidad | Jefa de Producción | Cumplimiento de producción, calidad e inocuidad. |
| Misional | Comercial y Servicio | Jefe Comercial | Ventas, clientes nuevos, pedidos y desempeño de personal. |
| Soporte | Administración y Talento Humano | Jefa Administrativa | Nómina, formación, gestión de personal y obligaciones. |
| Soporte | Compras y Logística | Coordinador de Compras | Proveedores, inventario, entregas y acciones con partes interesadas. |

## Nómina demostrativa

La nómina incluye 15 personas distribuidas entre los cinco procesos. Se utilizarán nombres e identificaciones ficticias, cargos coherentes con cada proceso y fechas de contratación diferentes para que Nómina demuestre antigüedad, área, cargo y desempeño.

| Área | Colaboradores | Ejemplos de KPI |
|---|---:|---|
| Dirección y Planeación | 1 | Avance del plan estratégico. |
| Producción y Calidad | 5 | Cumplimiento de producción, productos conformes y merma. |
| Comercial y Servicio | 3 | Clientes nuevos, pedidos atendidos y satisfacción. |
| Administración y Talento Humano | 3 | Pagos oportunos, capacitaciones y cobertura de personal. |
| Compras y Logística | 3 | Entregas a tiempo, rotación de inventario y evaluación de proveedores. |

## Datos mínimos para demostrar la plataforma

Cada proceso tendrá una caracterización breve, uno o dos OTE con objetivos operativos y tareas, una acción de partes interesadas, un cumplimiento y participantes vinculados a los cargos de Nómina. Se incorporarán KPI en 2026 para un grupo reducido de trabajadores, con resultados mensuales distintos, de modo que el panel de Desempeño de personal y Nómina presenten valores comparativos por área.

## Escenario de ciclo anual

El cierre de 2026 y borrador de 2027 evidenciarán tres decisiones: un objetivo que continúa por estar parcialmente cumplido, una acción que se cierra por estar terminada y un KPI cuya definición se reutiliza para el año siguiente sin trasladar sus resultados mensuales. El ciclo empresarial no se activará durante la preparación inicial; quedará disponible para la demostración bajo control del usuario.

## Ampliación solicitada: Producción y Calidad

La carga demostrativa de Producción y Calidad utilizará el identificador de proceso `2610042`. Los OTG se registrarán en `tacticalObjectives` y sus tareas en la misma planificación de cada objetivo. Los OTE se registrarán en `processTacticalObjectives`; sus objetivos operativos y tareas se conservarán dentro de `planningData.resultKeys`, que es la estructura que consume la página de Planificación OTE. Los cuatro cumplimientos se registrarán en `processCompliances` con sus fechas entre enero y julio de 2026. La información de subprocesos se almacenará en `subprocessMaps` y sus tablas de entradas, actividades y salidas, preservando las relaciones propias de cada módulo.
