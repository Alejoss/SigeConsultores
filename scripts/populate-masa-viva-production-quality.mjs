import dotenv from "dotenv";
import mysql from "mysql2/promise";

dotenv.config({ path: new URL("../.env", import.meta.url).pathname });
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL no está configurada");

const db = await mysql.createConnection(process.env.DATABASE_URL);
const processName = "Producción y Calidad";
const companyName = "Masa Viva";

const participantRows = [
  {
    position: "Jefa de Producción",
    ci: "1799000002",
    objective: "Dirigir la producción diaria asegurando eficiencia, inocuidad y cumplimiento de los estándares definidos.",
    responsibility: "Planificar la producción, coordinar al equipo, revisar mermas y asegurar la ejecución de los controles operativos.",
    authority: "Ajustar la programación de lotes, detener un lote no conforme y proponer acciones de mejora.",
    resourceName: "Gestión de planta",
    resourceElements: "Programa diario de producción, tablero de indicadores, turnos del personal y registros de merma.",
    kpi: { name: "Lotes conformes por semana", target: 40, values: [38, 40, 41, 39, 42, 40, 41] },
  },
  {
    position: "Supervisora de Calidad",
    ci: "1799000003",
    objective: "Verificar que los productos y registros cumplan los criterios de calidad e inocuidad establecidos.",
    responsibility: "Realizar controles de peso, apariencia, temperatura, limpieza y liberación de productos.",
    authority: "Retener productos no conformes, solicitar correcciones inmediatas y documentar hallazgos.",
    resourceName: "Control de calidad e inocuidad",
    resourceElements: "Termómetros calibrados, balanzas, formatos de inspección, lista de verificación y fichas técnicas.",
    kpi: { name: "Controles de calidad ejecutados", target: 25, values: [24, 25, 26, 24, 25, 25, 26] },
  },
  {
    position: "Panadera",
    ci: "1799000004",
    objective: "Elaborar productos de panadería consistentes según las fichas técnicas y el programa de producción.",
    responsibility: "Pesar ingredientes, amasar, fermentar, hornear y registrar desviaciones del proceso.",
    authority: "Solicitar reposición de insumos y reportar desviaciones de la receta o del equipo.",
    resourceName: "Estación de panadería",
    resourceElements: "Amasadora, horno, mesas de trabajo, balanza, fichas técnicas y utensilios sanitizados.",
    kpi: { name: "Unidades de panadería conformes", target: 1200, values: [1160, 1210, 1225, 1180, 1240, 1235, 1260] },
  },
  {
    position: "Pastelero",
    ci: "1799000005",
    objective: "Elaborar productos de pastelería con presentación, sabor y conservación acordes a la ficha técnica.",
    responsibility: "Preparar masas y decoraciones, controlar porciones y registrar la producción terminada.",
    authority: "Solicitar ajustes de receta o de programación cuando se identifiquen riesgos de calidad.",
    resourceName: "Estación de pastelería",
    resourceElements: "Batidora, refrigeración, moldes, balanza, manga pastelera, fichas técnicas y materias primas.",
    kpi: { name: "Pasteles conformes entregados", target: 180, values: [172, 181, 185, 178, 188, 182, 190] },
  },
  {
    position: "Auxiliar de Empaque",
    ci: "1799000006",
    objective: "Empacar y despachar productos preservando su presentación, integridad e identificación.",
    responsibility: "Revisar el producto liberado, empacar, etiquetar, organizar pedidos y mantener limpia el área.",
    authority: "Separar productos con empaque defectuoso y reportar faltantes o daños antes del despacho.",
    resourceName: "Empaque y despacho",
    resourceElements: "Material de empaque, etiquetas, selladora, mesas sanitizadas y registro de despacho.",
    kpi: { name: "Pedidos empacados sin novedad", target: 300, values: [288, 302, 306, 295, 310, 307, 315] },
  },
];

const oteDefinitions = [
  {
    name: "Reducir la merma de producción",
    description: "Disminuir desperdicios de materia prima y producto terminado sin afectar la calidad ni la disponibilidad para el cliente.",
    target: "Merma menor al 4% al cierre de julio de 2026",
    responsible: "Mónica Vallejo",
    deadline: "2026-07-31",
    subprocess: "Planificación y elaboración de productos",
    strategicObjective: "Mejorar la eficiencia operativa y la rentabilidad sostenible",
    planningData: {
      category: "Procesos Internos",
      goal: "Reducir la merma acumulada a menos del 4%",
      ponderacion: 50,
      puntoPartida: 7.2,
      metaLlegada: 4,
      unidadMedida: "% de merma",
      avanceMeta: 4.8,
      trackingType: "mensual_promedio",
      monthlyValues: [6.4, 6.0, 5.7, 5.3, 5.1, 4.9, 4.8, 0, 0, 0, 0, 0],
      resultKeys: [
        {
          id: "oo-merma-1",
          number: 1,
          description: "Estandarizar el porcionado y pesaje de materias primas en las líneas de panadería y pastelería.",
          responsible: "Mónica Vallejo",
          startDate: "2026-01-11",
          endDate: "2026-03-31",
          implementationDate: "2026-03-25",
          observation: "Formato de control de porciones aplicado en los turnos de producción.",
          ponderacion: 50,
          condicionInicial: 0,
          meta: 100,
          condicionActual: 88,
          porcentajeAlcanzado: 88,
          ooTrackingType: "puntual",
          tasks: [
            { id: "t-merma-1a", description: "Calibrar balanzas y verificar las fichas técnicas de porción.", responsible: "Supervisora de Calidad", date: "2026-01-29", percentageCompleted: 100, weighting: 50, taskType: "puntual" },
            { id: "t-merma-1b", description: "Auditar semanalmente el pesaje de los lotes críticos.", responsible: "Mónica Vallejo", date: "2026-03-31", percentageCompleted: 76, weighting: 50, taskType: "puntual" },
          ],
        },
        {
          id: "oo-merma-2",
          number: 2,
          description: "Registrar y analizar diariamente las mermas para aplicar acciones correctivas en los lotes con desviación.",
          responsible: "Mónica Vallejo",
          startDate: "2026-04-01",
          endDate: "2026-07-31",
          implementationDate: "2026-07-24",
          observation: "La merma se redujo progresivamente mediante análisis de causa y ajuste de lotes.",
          ponderacion: 50,
          condicionInicial: 0,
          meta: 100,
          condicionActual: 72,
          porcentajeAlcanzado: 72,
          ooTrackingType: "puntual",
          tasks: [
            { id: "t-merma-2a", description: "Consolidar el registro diario de merma por producto y turno.", responsible: "Auxiliar de Empaque", date: "2026-04-30", percentageCompleted: 100, weighting: 50, taskType: "puntual" },
            { id: "t-merma-2b", description: "Revisar quincenalmente causas y ejecutar ajustes de lote.", responsible: "Mónica Vallejo", date: "2026-07-31", percentageCompleted: 44, weighting: 50, taskType: "puntual" },
          ],
        },
      ],
    },
  },
  {
    name: "Asegurar la conformidad e inocuidad de los productos",
    description: "Fortalecer los controles de calidad e inocuidad para entregar productos seguros, consistentes y correctamente identificados.",
    target: "95% de conformidad de producto al cierre de julio de 2026",
    responsible: "Carla Mena",
    deadline: "2026-07-31",
    subprocess: "Control de calidad y liberación",
    strategicObjective: "Garantizar productos confiables y una experiencia satisfactoria para el cliente",
    planningData: {
      category: "Cliente",
      goal: "Alcanzar 95% de conformidad e inocuidad en los lotes liberados",
      ponderacion: 50,
      puntoPartida: 86,
      metaLlegada: 95,
      unidadMedida: "% de conformidad",
      avanceMeta: 93,
      trackingType: "mensual_promedio",
      monthlyValues: [88, 89, 90, 91, 92, 93, 93, 0, 0, 0, 0, 0],
      resultKeys: [
        {
          id: "oo-calidad-1",
          number: 1,
          description: "Ejecutar controles de calidad en cada lote antes de su liberación para venta o despacho.",
          responsible: "Carla Mena",
          startDate: "2026-01-08",
          endDate: "2026-04-30",
          implementationDate: "2026-04-29",
          observation: "Se mantienen formatos de peso, apariencia, horneado y empaque por lote.",
          ponderacion: 50,
          condicionInicial: 0,
          meta: 100,
          condicionActual: 94,
          porcentajeAlcanzado: 94,
          ooTrackingType: "puntual",
          tasks: [
            { id: "t-calidad-1a", description: "Actualizar la lista de verificación de calidad para panadería y pastelería.", responsible: "Carla Mena", date: "2026-02-12", percentageCompleted: 100, weighting: 50, taskType: "puntual" },
            { id: "t-calidad-1b", description: "Realizar muestreo diario de peso, apariencia y horneado de los lotes.", responsible: "Carla Mena", date: "2026-04-30", percentageCompleted: 88, weighting: 50, taskType: "puntual" },
          ],
        },
        {
          id: "oo-calidad-2",
          number: 2,
          description: "Verificar el cumplimiento de los programas de limpieza, desinfección y control de temperatura.",
          responsible: "Carla Mena",
          startDate: "2026-05-01",
          endDate: "2026-07-31",
          implementationDate: "2026-07-22",
          observation: "Los registros muestran cumplimiento continuo y correcciones oportunas.",
          ponderacion: 50,
          condicionInicial: 0,
          meta: 100,
          condicionActual: 86,
          porcentajeAlcanzado: 86,
          ooTrackingType: "puntual",
          tasks: [
            { id: "t-calidad-2a", description: "Auditar semanalmente los registros de limpieza y desinfección.", responsible: "Supervisora de Calidad", date: "2026-06-15", percentageCompleted: 90, weighting: 50, taskType: "puntual" },
            { id: "t-calidad-2b", description: "Verificar diariamente temperaturas de hornos, refrigeración y almacenamiento.", responsible: "Panadera", date: "2026-07-31", percentageCompleted: 82, weighting: 50, taskType: "puntual" },
          ],
        },
      ],
    },
  },
];

const fodaElements = {
  strengths: [
    { subprocess: "Elaboración de panadería", policyObjective: "Calidad e inocuidad", selectedObjectiveContent: "Garantizar productos seguros y consistentes.", statement: "Equipo con experiencia en elaboración artesanal.", description: "El personal domina las recetas y los tiempos de producción de los productos principales." },
    { subprocess: "Control de calidad", policyObjective: "Calidad e inocuidad", selectedObjectiveContent: "Garantizar productos seguros y consistentes.", statement: "Disponibilidad de fichas técnicas y formatos de control.", description: "Las fichas permiten estandarizar peso, temperatura y presentación de cada producto." },
  ],
  opportunities: [
    { subprocess: "Planificación de producción", policyObjective: "Mejora continua", selectedObjectiveContent: "Promover la mejora continua de los procesos.", statement: "Uso de indicadores diarios para reducir merma.", description: "Los datos de merma permiten actuar sobre productos y turnos con mayor desperdicio." },
    { subprocess: "Empaque y despacho", policyObjective: "Satisfacción del cliente", selectedObjectiveContent: "Satisfacer las necesidades de los clientes.", statement: "Preferencia creciente por productos artesanales frescos.", description: "La demanda de pedidos corporativos abre oportunidades de producción programada." },
  ],
  weaknesses: [
    { subprocess: "Elaboración de pastelería", policyObjective: "Mejora continua", selectedObjectiveContent: "Promover la mejora continua de los procesos.", statement: "Variación en el rendimiento de ciertos lotes.", description: "Se requieren controles más frecuentes de porcionado y de tiempos de horneado." },
    { subprocess: "Control de calidad", policyObjective: "Calidad e inocuidad", selectedObjectiveContent: "Garantizar productos seguros y consistentes.", statement: "Registros manuales con consolidación tardía.", description: "La revisión de registros puede retrasar el análisis de desviaciones." },
  ],
  threats: [
    { subprocess: "Abastecimiento y producción", policyObjective: "Calidad e inocuidad", selectedObjectiveContent: "Garantizar productos seguros y consistentes.", statement: "Variación de calidad en materias primas.", description: "Cambios en harina, mantequilla o levadura pueden afectar textura y rendimiento." },
    { subprocess: "Empaque y despacho", policyObjective: "Satisfacción del cliente", selectedObjectiveContent: "Satisfacer las necesidades de los clientes.", statement: "Reclamos por deterioro durante entregas de alto volumen.", description: "Los pedidos corporativos requieren empaques y condiciones de traslado adecuadas." },
  ],
};

const otgRows = [
  { id: "otg-pyc-1", accionATomar: "Estandarizar las fichas técnicas de los productos de mayor rotación", comunicado: "SI", objetivoLogrado: "SI", acciones: [{ id: "otg-pyc-1a", accion: "Validar recetas, gramajes, tiempos de horneado y presentación con el equipo de producción.", responsable: "Mónica Vallejo", fechaInicio: "2026-01-12", fechaFin: "2026-02-20", ponderacion: 100, puntoPartida: 0, puntoLlegada: 100, alcanzado: 100, tipoSeguimiento: "puntual" }] },
  { id: "otg-pyc-2", accionATomar: "Implementar control diario de merma por lote y producto", comunicado: "SI", objetivoLogrado: "NO", acciones: [{ id: "otg-pyc-2a", accion: "Registrar merma diaria y analizar semanalmente las principales causas con acciones correctivas.", responsable: "Mónica Vallejo", fechaInicio: "2026-02-23", fechaFin: "2026-04-30", ponderacion: 100, puntoPartida: 0, puntoLlegada: 100, alcanzado: 78, tipoSeguimiento: "puntual" }] },
  { id: "otg-pyc-3", accionATomar: "Fortalecer el programa de limpieza y desinfección de planta", comunicado: "SI", objetivoLogrado: "SI", acciones: [{ id: "otg-pyc-3a", accion: "Ejecutar auditoría semanal de limpieza, desinfección y condiciones sanitarias.", responsable: "Carla Mena", fechaInicio: "2026-03-02", fechaFin: "2026-05-29", ponderacion: 100, puntoPartida: 0, puntoLlegada: 100, alcanzado: 88, tipoSeguimiento: "puntual" }] },
  { id: "otg-pyc-4", accionATomar: "Mejorar la verificación de empaque y despacho de productos", comunicado: "SI", objetivoLogrado: "NO", acciones: [{ id: "otg-pyc-4a", accion: "Aplicar inspección final de empaque, etiqueta y cantidad antes del despacho.", responsable: "Elena Soria", fechaInicio: "2026-05-04", fechaFin: "2026-07-31", ponderacion: 100, puntoPartida: 0, puntoLlegada: 100, alcanzado: 84, tipoSeguimiento: "puntual" }] },
];

const complianceRows = [
  ["Programa de limpieza y desinfección de planta", "Verificar la ejecución y registro de limpieza de equipos, superficies y áreas críticas.", "Procedimiento interno de limpieza y desinfección", "Sistema de Gestion", "2026-01-31", "Mónica Vallejo", 100, "1"],
  ["Control de temperaturas de almacenamiento y producción", "Registrar y revisar temperaturas de refrigeración, congelación y horneado.", "Procedimiento de control de temperatura", "Sistema de Gestion", "2026-03-31", "Carla Mena", 92, "1,2,3"],
  ["Trazabilidad de materias primas y lotes", "Mantener registros que relacionen proveedor, lote de insumo y producto terminado.", "Procedimiento de trazabilidad", "Reglamentaria", "2026-05-31", "Carla Mena", 86, "1,2,3,4,5"],
  ["Verificación de buenas prácticas de manufactura", "Evaluar condiciones de higiene personal, manipulación y orden de planta.", "Manual de BPM de Masa Viva", "Legal", "2026-07-31", "Mónica Vallejo", 90, "1,2,3,4,5,6,7"],
];

const stakeholders = [
  { name: "Clientes de punto de venta", type: "cliente", internal: 0, needs: "Productos frescos, seguros, con variedad y atención oportuna.", action: "Recoger y analizar semanalmente la retroalimentación de frescura, sabor y presentación.", output: "Satisfacción y fidelización del cliente.", documents: "Registro de sugerencias y reclamos", incidence: "2", risk: "B", criticality: "Media", start: "2026-01-15", end: "2026-07-31", percent: 82 },
  { name: "Proveedores de materias primas", type: "proveedor", internal: 0, needs: "Especificaciones claras, pedidos programados y pagos oportunos.", action: "Evaluar mensualmente puntualidad, conformidad y trazabilidad de proveedores críticos.", output: "Materias primas conformes y disponibles.", documents: "Evaluación de proveedores", incidence: "3", risk: "B", criticality: "Alta", start: "2026-02-01", end: "2026-07-31", percent: 76 },
  { name: "Colaboradores de producción", type: "cliente", internal: 1, needs: "Instrucciones claras, equipos seguros, materiales disponibles y capacitación.", action: "Realizar charla mensual de seguridad, calidad e inocuidad con seguimiento a compromisos.", output: "Equipo competente y comprometido.", documents: "Registro de capacitación y asistencia", incidence: "3", risk: "C", criticality: "Alta", start: "2026-01-08", end: "2026-07-31", percent: 94 },
  { name: "Autoridad sanitaria local", type: "cliente", internal: 0, needs: "Cumplimiento de condiciones sanitarias y evidencia de buenas prácticas.", action: "Mantener expediente de BPM, limpieza, control de plagas y registros de temperatura actualizado.", output: "Cumplimiento sanitario demostrable.", documents: "Expediente sanitario", incidence: "3", risk: "C", criticality: "Alta", start: "2026-03-01", end: "2026-07-31", percent: 88 },
];

const stakeholderCriticalityActions = [
  ["Compras y Logística", "Interno", 3, 3, 9, "Confirmar semanalmente la disponibilidad y conformidad de harina, lácteos, levadura y materiales de empaque.", "2026-01-11", "2026-07-31", "SI"],
  ["Comercial y Servicio", "Interno", 3, 3, 9, "Revisar semanalmente el pronóstico de pedidos y comunicar ajustes de producción antes del cierre de cada jornada.", "2026-01-11", "2026-07-31", "SI"],
  ["Clientes y autoridad sanitaria", "Externo", 3, 3, 9, "Consolidar mensualmente la retroalimentación de clientes y verificar la evidencia sanitaria de los lotes liberados.", "2026-02-01", "2026-07-31", "NO"],
];

const mapData = {
  entrada: [
    { id: 1, partesInteresadas: "Compras y Logística", internoExterno: "Interno", clienteProveedor: "Proveedor", necesidades: "", solicita: "Plan de producción y requerimiento de insumos.", entrega: "Harina, lácteos, levaduras, empaques y materiales conformes." },
    { id: 2, partesInteresadas: "Comercial y Servicio", internoExterno: "Interno", clienteProveedor: "Cliente", necesidades: "", solicita: "Pronóstico de pedidos, productos y fechas comprometidas.", entrega: "Productos terminados, identificados y listos para despacho." },
    { id: 3, partesInteresadas: "Clientes y autoridad sanitaria", internoExterno: "Externo", clienteProveedor: "Cliente", necesidades: "", solicita: "Productos frescos, seguros, trazables y de calidad constante.", entrega: "Requisitos, retroalimentación y criterios sanitarios aplicables." },
  ],
  subprocesos: [
    { id: 1, acciones: "Programar lotes, validar disponibilidad de materias primas y distribuir órdenes de trabajo.", subproceso: "Planificación de producción" },
    { id: 2, acciones: "Pesar, mezclar, amasar, fermentar, hornear, decorar y enfriar según ficha técnica.", subproceso: "Elaboración de panadería y pastelería" },
    { id: 3, acciones: "Inspeccionar peso, apariencia, temperatura, empaque y registro de lotes antes de liberación.", subproceso: "Control de calidad e inocuidad" },
    { id: 4, acciones: "Empacar, etiquetar, consolidar pedidos y entregar productos liberados a despacho.", subproceso: "Empaque y despacho" },
  ],
  salida: [
    { id: 1, salidas: "Productos de panadería y pastelería conformes", entregables: "Lotes liberados para venta o pedido corporativo", doc: "Ficha de producción y registro de control de calidad" },
    { id: 2, salidas: "Registros de inocuidad, limpieza y trazabilidad", entregables: "Evidencia de cumplimiento sanitario", doc: "Formato de BPM, limpieza y temperatura" },
    { id: 3, salidas: "Información de merma y rendimiento", entregables: "Reporte semanal para mejora continua", doc: "Registro de merma por lote" },
  ],
};

async function one(sql, values = []) {
  const [rows] = await db.execute(sql, values);
  return rows[0] || null;
}

async function resetCurrentProcess(processId, characterizationId) {
  const [participants] = await db.execute("SELECT id FROM processParticipants WHERE processCharacterizationId = ?", [characterizationId]);
  const participantIds = participants.map((row) => Number(row.id));
  if (participantIds.length) {
    const marks = participantIds.map(() => "?").join(",");
    const [assignments] = await db.execute(`SELECT id FROM participantWorkerAssignments WHERE processParticipantId IN (${marks})`, participantIds);
    const assignmentIds = assignments.map((row) => Number(row.id));
    if (assignmentIds.length) {
      const assignmentMarks = assignmentIds.map(() => "?").join(",");
      const [kpis] = await db.execute(`SELECT id FROM participantWorkerKpis WHERE participantWorkerAssignmentId IN (${assignmentMarks})`, assignmentIds);
      const kpiIds = kpis.map((row) => Number(row.id));
      if (kpiIds.length) await db.execute(`DELETE FROM participantWorkerKpiValues WHERE participantWorkerKpiId IN (${kpiIds.map(() => "?").join(",")})`, kpiIds);
      await db.execute(`DELETE FROM participantWorkerKpis WHERE participantWorkerAssignmentId IN (${assignmentMarks})`, assignmentIds);
    }
    await db.execute(`DELETE FROM participantWorkerAssignments WHERE processParticipantId IN (${marks})`, participantIds);
  }
  await db.execute("DELETE FROM processParticipants WHERE processCharacterizationId = ?", [characterizationId]);
  await db.execute("DELETE FROM processResources WHERE processCharacterizationId = ?", [characterizationId]);
  await db.execute("DELETE FROM processTacticalObjectives WHERE processId = ?", [processId]);
  await db.execute("DELETE FROM processCompliances WHERE processId = ?", [processId]);
  await db.execute("DELETE FROM processScheduleActivities WHERE processId = ?", [processId]);
  await db.execute("DELETE FROM processIndicators WHERE processId = ?", [processId]);
  await db.execute("DELETE FROM criticalityMatrix WHERE processId = ?", [processId]);
  await db.execute("DELETE FROM stakeholderCriticalities WHERE processId = ?", [processId]);
  await db.execute("DELETE FROM stakeholders WHERE processId = ?", [processId]);
  await db.execute("DELETE FROM processFODA WHERE processId = ?", [processId]);
  await db.execute("DELETE FROM subprocessMaps WHERE processId = ?", [processId]);
}

try {
  await db.beginTransaction();
  const company = await one("SELECT id FROM companies WHERE name = ? ORDER BY id ASC LIMIT 1", [companyName]);
  if (!company) throw new Error("No se encontró Masa Viva");
  const process = await one("SELECT id FROM processes WHERE companyId = ? AND name = ? ORDER BY id ASC LIMIT 1", [company.id, processName]);
  if (!process) throw new Error("No se encontró el proceso Producción y Calidad");
  const characterization = await one("SELECT id FROM processCharacterizations WHERE processId = ? ORDER BY id ASC LIMIT 1", [process.id]);
  if (!characterization) throw new Error("No se encontró la caracterización de Producción y Calidad");

  const processId = Number(process.id);
  const characterizationId = Number(characterization.id);
  await resetCurrentProcess(processId, characterizationId);

  const foda = await one("SELECT id FROM processFODA WHERE processId = ?", [processId]);
  const fodaPayload = [JSON.stringify(fodaElements.strengths), JSON.stringify(fodaElements.opportunities), JSON.stringify(fodaElements.weaknesses), JSON.stringify(fodaElements.threats), JSON.stringify(otgRows)];
  if (foda) {
    await db.execute("UPDATE processFODA SET strengths = ?, opportunities = ?, weaknesses = ?, threats = ?, matrixData = ? WHERE id = ?", [...fodaPayload, foda.id]);
  } else {
    await db.execute("INSERT INTO processFODA (processId, strengths, opportunities, weaknesses, threats, matrixData) VALUES (?, ?, ?, ?, ?, ?)", [processId, ...fodaPayload]);
  }

  await db.execute("INSERT INTO subprocessMaps (processId, entrada, necesidades, subprocesos, salida) VALUES (?, ?, ?, ?, ?)", [
    processId,
    JSON.stringify(mapData.entrada),
    mapData.entrada.map((row) => `Solicita: ${row.solicita}\nEntrega: ${row.entrega}`).join("\n---\n"),
    JSON.stringify(mapData.subprocesos),
    JSON.stringify(mapData.salida),
  ]);

  const employeeIds = new Map();
  for (const row of participantRows) {
    const employee = await one("SELECT id FROM payrollEmployees WHERE companyId = ? AND identityCard = ? AND status = 'activo'", [company.id, row.ci]);
    if (!employee) throw new Error(`No se encontró el trabajador ${row.ci}`);
    employeeIds.set(row.ci, Number(employee.id));
    const [participantResult] = await db.execute(
      "INSERT INTO processParticipants (processCharacterizationId, position, objective, responsibility, authority, orderIndex) VALUES (?, ?, ?, ?, ?, ?)",
      [characterizationId, row.position, row.objective, row.responsibility, row.authority, participantRows.indexOf(row) + 1],
    );
    const participantId = Number(participantResult.insertId);
    await db.execute(
      "INSERT INTO processResources (processCharacterizationId, participantId, participant, resourceType, description, resourceName, resourceElements, orderIndex) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [characterizationId, participantId, row.position, row.resourceName, row.resourceElements, row.resourceName, row.resourceElements, participantRows.indexOf(row) + 1],
    );
    const [assignmentResult] = await db.execute("INSERT INTO participantWorkerAssignments (processParticipantId, payrollEmployeeId) VALUES (?, ?)", [participantId, employeeIds.get(row.ci)]);
    const [kpiResult] = await db.execute("INSERT INTO participantWorkerKpis (participantWorkerAssignmentId, year, name, monthlyTarget) VALUES (?, 2026, ?, ?)", [assignmentResult.insertId, row.kpi.name, row.kpi.target]);
    for (let i = 0; i < row.kpi.values.length; i += 1) {
      await db.execute("INSERT INTO participantWorkerKpiValues (participantWorkerKpiId, month, actualValue) VALUES (?, ?, ?)", [kpiResult.insertId, i + 1, row.kpi.values[i]]);
    }
  }

  const objectiveIds = [];
  for (const objective of oteDefinitions) {
    const [result] = await db.execute(
      "INSERT INTO processTacticalObjectives (processId, name, description, target, responsible, deadline, subprocess, strategicObjective, strategicObjectiveDescription, planningData, completed) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'NO')",
      [processId, objective.name, objective.description, objective.target, objective.responsible, objective.deadline, objective.subprocess, objective.strategicObjective, "Objetivo estratégico demostrativo de Masa Viva.", JSON.stringify(objective.planningData)],
    );
    objectiveIds.push(Number(result.insertId));
  }

  for (let i = 0; i < complianceRows.length; i += 1) {
    const [requirement, description, regulation, obligationType, dueDate, responsible, percent, plannedMonths] = complianceRows[i];
    await db.execute(
      "INSERT INTO processCompliances (processId, tacticalObjectiveId, requirement, description, regulation, obligationType, status, dueDate, responsible, completed, plannedMonths, completedMonths, observations, completionPercentage, evaluationMode, validFrom, validUntil) VALUES (?, ?, ?, ?, ?, ?, 'En Progreso', ?, ?, ?, ?, ?, ?, ?, 'meses', '2026-01-01', '2026-07-31')",
      [processId, objectiveIds[i % objectiveIds.length], requirement, description, regulation, obligationType, dueDate, responsible, i < 2 ? "SI" : "NO", plannedMonths, plannedMonths, "Registro demostrativo planificado entre enero y julio de 2026.", percent],
    );
  }

  for (const row of otgRows) {
    const action = row.acciones[0];
    await db.execute(
      "INSERT INTO processScheduleActivities (processId, name, type, status, startDate, endDate, responsible, priority, progress) VALUES (?, ?, 'OTG', 'En Progreso', ?, ?, ?, 'Media', ?)",
      [processId, action.accion, action.fechaInicio, action.fechaFin, action.responsable, action.alcanzado],
    );
  }

  for (const objective of oteDefinitions) {
    for (const resultKey of objective.planningData.resultKeys) {
      for (const task of resultKey.tasks) {
        await db.execute(
          "INSERT INTO processScheduleActivities (processId, name, type, status, startDate, endDate, responsible, priority, progress) VALUES (?, ?, 'OTE', 'En Progreso', ?, ?, ?, 'Alta', ?)",
          [processId, task.description, resultKey.startDate, task.date, task.responsible, task.percentageCompleted],
        );
      }
    }
  }

  for (const [name, type, influence, dependence, criticality, action, startDate, endDate, completed] of stakeholderCriticalityActions) {
    const [stakeholderResult] = await db.execute(
      "INSERT INTO stakeholders (processId, name, type, isInternal, needs, actions, outputs, documents, orderIndex) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [processId, name, type === "Interno" ? "cliente" : "proveedor", type === "Interno" ? 1 : 0, "Necesidades y expectativas definidas en el Mapa de Subprocesos.", action, "Coordinación y cumplimiento de compromisos.", "Registro de seguimiento de partes interesadas", stakeholderCriticalityActions.findIndex((item) => item[0] === name) + 1],
    );
    await db.execute(
      "INSERT INTO criticalityMatrix (processId, stakeholderId, incidence, risk, criticality, existingDefenses, actionToTake, observations, startDate, endDate, implementationStatus, completionPercentage, actionSource) VALUES (?, ?, '3', 'B', '3B', ?, ?, ?, ?, ?, ?, ?, 'Conversación entre áreas')",
      [processId, stakeholderResult.insertId, "Procedimientos, registros y revisión mensual por el responsable.", action, "Acción demostrativa planificada de enero a julio de 2026.", startDate, endDate, completed === "SI" ? 1 : 0, completed === "SI" ? 100 : 68],
    );
  }

  await db.commit();
  console.log(JSON.stringify({ success: true, companyId: Number(company.id), processId, participants: participantRows.length, otg: otgRows.length, ote: oteDefinitions.length, operationalObjectives: 4, oteTasks: 8, compliances: complianceRows.length, stakeholders: stakeholders.length }, null, 2));
} catch (error) {
  await db.rollback();
  throw error;
} finally {
  await db.end();
}
