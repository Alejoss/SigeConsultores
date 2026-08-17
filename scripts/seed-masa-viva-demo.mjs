import dotenv from "dotenv";
import mysql from "mysql2/promise";

dotenv.config({ path: new URL("../.env", import.meta.url).pathname });

const connectionUrl = process.env.DATABASE_URL;
if (!connectionUrl) throw new Error("DATABASE_URL no está configurada");

const db = await mysql.createConnection(connectionUrl);

// Masa Viva es una empresa demostrativa local autorizada por el usuario.
const companyName = "Masa Viva";
const demoDescription = "Empresa demostrativa local de panadería y pastelería artesanal para presentar ISGE 360. Datos ficticios.";

const processes = [
  {
    name: "Dirección y Planeación",
    macroProcess: "Estratégico",
    processType: "estrategico",
    responsible: "Lucía Herrera",
    email: "lucia.herrera@masaviva.demo",
    objective: "Dirigir la estrategia y asegurar el cumplimiento de los objetivos anuales de Masa Viva.",
    scope: "Planificación estratégica, seguimiento gerencial y mejora continua.",
    resources: "Tablero ISGE 360, presupuesto anual y comité gerencial.",
    ote: {
      name: "Cumplimiento del plan anual de crecimiento",
      description: "Asegurar el avance de las iniciativas estratégicas priorizadas para 2026.",
      target: "90% de cumplimiento anual",
      progress: 68,
      task: "Revisar el tablero estratégico y los compromisos de cada proceso",
      due: "2026-11-28",
    },
    compliance: { requirement: "Revisión gerencial del Sistema Integrado de Gestión", due: "2026-12-10", percent: 60 },
    stakeholder: { name: "Socios de Masa Viva", type: "cliente", action: "Presentar resultados trimestrales y plan de crecimiento", due: "2026-12-15", percent: 75 },
  },
  {
    name: "Producción y Calidad",
    macroProcess: "Misional",
    processType: "misional",
    responsible: "Mónica Vallejo",
    email: "monica.vallejo@masaviva.demo",
    objective: "Elaborar productos de panadería y pastelería seguros, consistentes y oportunos.",
    scope: "Planificación de producción, elaboración, control de calidad e inocuidad.",
    resources: "Hornos, amasadoras, balanzas, fichas técnicas y registros de calidad.",
    ote: {
      name: "Reducir la merma de producción",
      description: "Disminuir desperdicios de materia prima y producto terminado sin afectar la calidad.",
      target: "Merma menor al 4%",
      progress: 54,
      task: "Aplicar control diario de porciones y desperdicio por lote",
      due: "2026-11-20",
    },
    compliance: { requirement: "Registro de limpieza y desinfección de planta", due: "2026-11-30", percent: 85 },
    stakeholder: { name: "Clientes de punto de venta", type: "cliente", action: "Recoger retroalimentación semanal sobre frescura y variedad", due: "2026-12-05", percent: 70 },
  },
  {
    name: "Comercial y Servicio",
    macroProcess: "Misional",
    processType: "misional",
    responsible: "Diego Paredes",
    email: "diego.paredes@masaviva.demo",
    objective: "Incrementar ventas recurrentes y brindar una experiencia de servicio cercana y oportuna.",
    scope: "Ventas, atención de pedidos, fidelización y servicio posventa.",
    resources: "CRM de clientes, canales digitales, catálogo y punto de venta.",
    ote: {
      name: "Aumentar la cartera de clientes corporativos",
      description: "Captar nuevos clientes corporativos para pedidos recurrentes de panadería y pastelería.",
      target: "24 clientes corporativos nuevos",
      progress: 58,
      task: "Contactar prospectos corporativos y registrar la propuesta comercial",
      due: "2026-12-12",
    },
    compliance: { requirement: "Protección de datos personales de clientes", due: "2026-12-18", percent: 50 },
    stakeholder: { name: "Clientes corporativos", type: "cliente", action: "Realizar encuesta semestral de satisfacción y puntualidad", due: "2026-12-08", percent: 80 },
  },
  {
    name: "Administración y Talento Humano",
    macroProcess: "Soporte",
    processType: "soporte",
    responsible: "Paola Torres",
    email: "paola.torres@masaviva.demo",
    objective: "Administrar eficientemente los recursos financieros y desarrollar las capacidades del personal.",
    scope: "Nómina, administración, formación, bienestar y control presupuestario.",
    resources: "Presupuesto, nómina, expedientes laborales y plan de capacitación.",
    ote: {
      name: "Ejecutar el plan de capacitación 2026",
      description: "Asegurar la participación del personal en capacitación de inocuidad, servicio y seguridad.",
      target: "95% de ejecución",
      progress: 72,
      task: "Coordinar capacitación en manipulación de alimentos y servicio al cliente",
      due: "2026-11-25",
    },
    compliance: { requirement: "Pago oportuno de aportes y obligaciones laborales", due: "2026-11-15", percent: 100 },
    stakeholder: { name: "Colaboradores", type: "cliente", action: "Aplicar encuesta de clima laboral y plan de bienestar", due: "2026-12-01", percent: 65 },
  },
  {
    name: "Compras y Logística",
    macroProcess: "Soporte",
    processType: "soporte",
    responsible: "Andrés Molina",
    email: "andres.molina@masaviva.demo",
    objective: "Garantizar abastecimiento oportuno de insumos y entregas confiables a clientes.",
    scope: "Compras, recepción, inventarios, proveedores y distribución.",
    resources: "Bodega, inventarios, proveedores homologados y vehículo de reparto.",
    ote: {
      name: "Mejorar el nivel de entregas completas y a tiempo",
      description: "Asegurar que los pedidos salgan completos en la fecha acordada.",
      target: "95% de entregas a tiempo",
      progress: 76,
      task: "Revisar diariamente rutas de entrega e incidencias de pedidos", 
      due: "2026-12-03",
    },
    compliance: { requirement: "Control de trazabilidad de materias primas", due: "2026-11-22", percent: 78 },
    stakeholder: { name: "Proveedores de materia prima", type: "proveedor", action: "Evaluar puntualidad y conformidad de proveedores críticos", due: "2026-12-06", percent: 55 },
  },
];

const workforce = [
  ["Lucía Herrera Cedeño", "1799000001", "2021-01-11", "Dirección y Planeación", "Gerente General"],
  ["Mónica Vallejo Cruz", "1799000002", "2020-03-02", "Producción y Calidad", "Jefa de Producción"],
  ["Carla Mena Ortiz", "1799000003", "2022-06-15", "Producción y Calidad", "Supervisora de Calidad"],
  ["Sofía Lema Ruiz", "1799000004", "2023-02-20", "Producción y Calidad", "Panadera"],
  ["Mateo Cárdenas Vela", "1799000005", "2024-01-08", "Producción y Calidad", "Pastelero"],
  ["Elena Soria Paz", "1799000006", "2024-04-10", "Producción y Calidad", "Auxiliar de Empaque"],
  ["Diego Paredes López", "1799000007", "2021-07-01", "Comercial y Servicio", "Jefe Comercial"],
  ["Valeria Cruz Mora", "1799000008", "2023-03-06", "Comercial y Servicio", "Asesora Comercial"],
  ["Daniel Vinueza León", "1799000009", "2024-07-15", "Comercial y Servicio", "Ejecutivo de Servicio al Cliente"],
  ["Paola Torres Vera", "1799000010", "2020-11-03", "Administración y Talento Humano", "Jefa Administrativa"],
  ["Natalia Cueva Arias", "1799000011", "2022-01-17", "Administración y Talento Humano", "Analista de Talento Humano"],
  ["Carlos Jara Mera", "1799000012", "2023-05-22", "Administración y Talento Humano", "Asistente Contable"],
  ["Andrés Molina Reyes", "1799000013", "2021-09-13", "Compras y Logística", "Coordinador de Compras y Logística"],
  ["María Belén Sarmiento", "1799000014", "2023-08-14", "Compras y Logística", "Analista de Compras"],
  ["Jorge Cevallos Ponce", "1799000015", "2024-02-12", "Compras y Logística", "Auxiliar de Bodega y Despacho"],
];

const kpiConfigs = [
  { process: "Dirección y Planeación", position: "Gerente General", employee: "1799000001", name: "Hitos estratégicos cumplidos", target: 4, values: [3, 4, 3, 4, 4, 3, 4] },
  { process: "Producción y Calidad", position: "Jefa de Producción", employee: "1799000002", name: "Lotes conformes por semana", target: 40, values: [38, 40, 41, 39, 42, 40, 41] },
  { process: "Producción y Calidad", position: "Supervisora de Calidad", employee: "1799000003", name: "Controles de calidad ejecutados", target: 25, values: [24, 25, 26, 24, 25, 25, 26] },
  { process: "Comercial y Servicio", position: "Jefe Comercial", employee: "1799000007", name: "Clientes corporativos contactados", target: 12, values: [9, 11, 13, 12, 10, 14, 12] },
  { process: "Comercial y Servicio", position: "Asesora Comercial", employee: "1799000008", name: "Pedidos confirmados", target: 60, values: [55, 61, 58, 63, 60, 66, 64] },
  { process: "Administración y Talento Humano", position: "Jefa Administrativa", employee: "1799000010", name: "Obligaciones administrativas cumplidas", target: 10, values: [10, 10, 10, 9, 10, 10, 10] },
  { process: "Compras y Logística", position: "Coordinador de Compras y Logística", employee: "1799000013", name: "Entregas completas y a tiempo", target: 50, values: [46, 48, 50, 47, 49, 50, 48] },
];

async function one(sql, values = []) {
  const [rows] = await db.execute(sql, values);
  return rows[0] || null;
}

async function run() {
  await db.beginTransaction();
  try {
    const owner = await one("SELECT id FROM accounts ORDER BY id ASC LIMIT 1");
    if (!owner) throw new Error("No existe una cuenta local para ser propietaria de Masa Viva");

    let company = await one("SELECT id FROM companies WHERE name = ? ORDER BY id ASC LIMIT 1", [companyName]);
    if (!company) {
      const [result] = await db.execute(
        "INSERT INTO companies (name, description, ownerAccountId, status, storageLimitMb) VALUES (?, ?, ?, 'Activa', 500)",
        [companyName, demoDescription, owner.id],
      );
      company = { id: result.insertId };
    } else {
      await db.execute("UPDATE companies SET description = ?, status = 'Activa' WHERE id = ?", [demoDescription, company.id]);
    }
    const companyId = Number(company.id);

    const info = await one("SELECT id FROM companyInfo WHERE companyId = ? ORDER BY id ASC LIMIT 1", [companyId]);
    if (info) {
      await db.execute("UPDATE companyInfo SET proposito = ?, mision = ?, vision = ?, adminAlertEmail = ? WHERE id = ?", [
        "Crear momentos cotidianos de bienestar mediante panadería y pastelería artesanal de calidad.",
        "Elaborar productos frescos y seguros, con un servicio cercano y responsable.",
        "Ser una panadería artesanal referente por calidad, innovación y cercanía en la ciudad.",
        "demo@masaviva.demo",
        info.id,
      ]);
    } else {
      await db.execute("INSERT INTO companyInfo (companyId, proposito, mision, vision, adminAlertEmail) VALUES (?, ?, ?, ?, ?)", [
        companyId,
        "Crear momentos cotidianos de bienestar mediante panadería y pastelería artesanal de calidad.",
        "Elaborar productos frescos y seguros, con un servicio cercano y responsable.",
        "Ser una panadería artesanal referente por calidad, innovación y cercanía en la ciudad.",
        "demo@masaviva.demo",
      ]);
    }

    const processIds = new Map();
    const characterizationIds = new Map();
    const objectiveIds = new Map();

    for (const item of processes) {
      let process = await one("SELECT id FROM processes WHERE companyId = ? AND name = ? ORDER BY id ASC LIMIT 1", [companyId, item.name]);
      if (!process) {
        const [result] = await db.execute(
          "INSERT INTO processes (companyId, name, macroProcess, processType, description) VALUES (?, ?, ?, ?, ?)",
          [companyId, item.name, item.macroProcess, item.processType, item.objective],
        );
        process = { id: result.insertId };
      }
      const processId = Number(process.id);
      processIds.set(item.name, processId);

      let characterization = await one("SELECT id FROM processCharacterizations WHERE processId = ? ORDER BY id ASC LIMIT 1", [processId]);
      if (!characterization) {
        const [result] = await db.execute(
          "INSERT INTO processCharacterizations (processId, macroProcess, responsible, responsibleEmail, participants, objective, scope, resources) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          [processId, item.macroProcess, item.responsible, item.email, "Equipo demostrativo Masa Viva", item.objective, item.scope, item.resources],
        );
        characterization = { id: result.insertId };
      }
      characterizationIds.set(item.name, Number(characterization.id));

      let objective = await one("SELECT id FROM processTacticalObjectives WHERE processId = ? AND name = ? ORDER BY id ASC LIMIT 1", [processId, item.ote.name]);
      const planningData = JSON.stringify({
        resultKeys: [{
          description: item.ote.description,
          startDate: "2026-01-15",
          endDate: item.ote.due,
          porcentajeAlcanzado: item.ote.progress,
          tasks: [{ description: item.ote.task, date: item.ote.due, percentageCompleted: item.ote.progress }],
        }],
      });
      if (!objective) {
        const [result] = await db.execute(
          "INSERT INTO processTacticalObjectives (processId, name, description, target, responsible, planningData, completed) VALUES (?, ?, ?, ?, ?, ?, 'NO')",
          [processId, item.ote.name, item.ote.description, item.ote.target, item.responsible, planningData],
        );
        objective = { id: result.insertId };
      } else {
        await db.execute("UPDATE processTacticalObjectives SET description = ?, target = ?, responsible = ?, planningData = ? WHERE id = ?", [item.ote.description, item.ote.target, item.responsible, planningData, objective.id]);
      }
      objectiveIds.set(item.name, Number(objective.id));

      let compliance = await one("SELECT id FROM processCompliances WHERE processId = ? AND requirement = ? ORDER BY id ASC LIMIT 1", [processId, item.compliance.requirement]);
      if (!compliance) {
        await db.execute(
          "INSERT INTO processCompliances (processId, tacticalObjectiveId, requirement, description, regulation, obligationType, status, dueDate, responsible, completed, completionPercentage, evaluationMode, validFrom, validUntil) VALUES (?, ?, ?, ?, ?, 'Sistema de Gestion', 'En Progreso', ?, ?, 'NO', ?, 'vigencia', '2026-01-01', '2026-12-31')",
          [processId, objective.id, item.compliance.requirement, "Registro demostrativo de cumplimiento anual.", "Procedimiento interno de Masa Viva", item.compliance.due, item.responsible, item.compliance.percent],
        );
      }

      let stakeholder = await one("SELECT id FROM stakeholders WHERE processId = ? AND name = ? ORDER BY id ASC LIMIT 1", [processId, item.stakeholder.name]);
      if (!stakeholder) {
        const [result] = await db.execute(
          "INSERT INTO stakeholders (processId, name, type, isInternal, needs, actions, outputs, documents, orderIndex) VALUES (?, ?, ?, 0, ?, ?, ?, ?, 1)",
          [processId, item.stakeholder.name, item.stakeholder.type, "Atención oportuna, calidad y comunicación clara.", item.stakeholder.action, "Relación fortalecida", "Registro demostrativo"],
        );
        stakeholder = { id: result.insertId };
      }
      const criticality = await one("SELECT id FROM criticalityMatrix WHERE processId = ? AND stakeholderId = ? LIMIT 1", [processId, stakeholder.id]);
      if (!criticality) {
        await db.execute(
          "INSERT INTO criticalityMatrix (processId, stakeholderId, incidence, risk, criticality, existingDefenses, actionToTake, observations, startDate, endDate, implementationStatus, completionPercentage, actionSource) VALUES (?, ?, '2', 'B', 'Media', ?, ?, ?, '2026-02-01', ?, 0, ?, 'Iniciativa propia')",
          [processId, stakeholder.id, "Comunicación periódica y responsable asignado", item.stakeholder.action, "Acción demostrativa para cierre anual", item.stakeholder.due, item.stakeholder.percent],
        );
      }
    }

    const employees = new Map();
    for (const [fullName, identityCard, hireDate, area, position] of workforce) {
      let employee = await one("SELECT id FROM payrollEmployees WHERE companyId = ? AND identityCard = ? LIMIT 1", [companyId, identityCard]);
      if (!employee) {
        const [result] = await db.execute(
          "INSERT INTO payrollEmployees (companyId, fullName, identityCard, hireDate, area, position, status) VALUES (?, ?, ?, ?, ?, ?, 'activo')",
          [companyId, fullName, identityCard, hireDate, area, position],
        );
        employee = { id: result.insertId };
      }
      employees.set(identityCard, Number(employee.id));
    }

    const positionsByProcess = new Map();
    for (const config of kpiConfigs) {
      const key = `${config.process}|${config.position}`;
      positionsByProcess.set(key, true);
    }

    const participantIds = new Map();
    for (const [key] of positionsByProcess) {
      const [processName, position] = key.split("|");
      const characterizationId = characterizationIds.get(processName);
      let participant = await one("SELECT id FROM processParticipants WHERE processCharacterizationId = ? AND position = ? ORDER BY id ASC LIMIT 1", [characterizationId, position]);
      if (!participant) {
        const [result] = await db.execute(
          "INSERT INTO processParticipants (processCharacterizationId, position, objective, responsibility, authority, orderIndex) VALUES (?, ?, ?, ?, ?, 1)",
          [characterizationId, position, `Aportar al logro de los resultados de ${processName}.`, "Ejecutar y reportar los indicadores del cargo.", "Proponer mejoras dentro de su ámbito de responsabilidad."],
        );
        participant = { id: result.insertId };
      }
      participantIds.set(key, Number(participant.id));
    }

    for (const config of kpiConfigs) {
      const participantId = participantIds.get(`${config.process}|${config.position}`);
      const employeeId = employees.get(config.employee);
      let assignment = await one("SELECT id FROM participantWorkerAssignments WHERE processParticipantId = ? AND payrollEmployeeId = ? LIMIT 1", [participantId, employeeId]);
      if (!assignment) {
        const [result] = await db.execute(
          "INSERT INTO participantWorkerAssignments (processParticipantId, payrollEmployeeId) VALUES (?, ?)",
          [participantId, employeeId],
        );
        assignment = { id: result.insertId };
      }
      let kpi = await one("SELECT id FROM participantWorkerKpis WHERE participantWorkerAssignmentId = ? AND year = 2026 AND name = ? ORDER BY id ASC LIMIT 1", [assignment.id, config.name]);
      if (!kpi) {
        const [result] = await db.execute(
          "INSERT INTO participantWorkerKpis (participantWorkerAssignmentId, year, name, monthlyTarget) VALUES (?, 2026, ?, ?)",
          [assignment.id, config.name, config.target],
        );
        kpi = { id: result.insertId };
      }
      for (let index = 0; index < config.values.length; index += 1) {
        await db.execute(
          "INSERT INTO participantWorkerKpiValues (participantWorkerKpiId, month, actualValue) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE actualValue = VALUES(actualValue)",
          [kpi.id, index + 1, config.values[index]],
        );
      }
    }

    await db.commit();
    console.log(JSON.stringify({ success: true, companyId, processIds: Object.fromEntries(processIds), employees: workforce.length, kpis: kpiConfigs.length }, null, 2));
  } catch (error) {
    await db.rollback();
    throw error;
  } finally {
    await db.end();
  }
}

await run();
