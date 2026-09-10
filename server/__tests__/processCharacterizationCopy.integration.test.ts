import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";
import {
  companies,
  participantWorkerAssignments,
  participantWorkerKpis,
  participantWorkerKpiValues,
  procedureRecords,
  procedures,
  processCharacterizations,
  processParticipants,
  processResources,
  processes,
  subprocessMapEntries,
  subprocessMapOutputs,
  subprocessMapSubprocesses,
  subprocessMaps,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { processCharacterizationCopyRouter } from "../routers/processCharacterizationCopy";

const testName = `Prueba copia caracterización ${Date.now()}`;
const triggerName = `copy_characterization_rollback_${Date.now()}`.slice(0, 60);

let db: NonNullable<Awaited<ReturnType<typeof getDb>>>;
let companyId = 0;
let otherCompanyId = 0;
let sourceProcessId = 0;
let targetEmptyProcessId = 0;
let targetOccupiedProcessId = 0;
let targetRollbackProcessId = 0;
let targetResourceOnlyProcessId = 0;
let otherCompanyProcessId = 0;
let sourceCharacterizationId = 0;
let targetRollbackCharacterizationId = 0;
let sourceParticipantId = 0;
let sourceProcedureId = 0;
let rollbackTriggerCreated = false;

function adminCaller() {
  return processCharacterizationCopyRouter.createCaller({
    user: { role: "admin" },
    manager: null,
    processLeader: null,
    req: {} as never,
    res: {} as never,
  } as never);
}

function leaderCaller() {
  return processCharacterizationCopyRouter.createCaller({
    user: null,
    manager: null,
    processLeader: {
      processLeaderId: 1,
      leaderName: "Jefe temporal",
      leaderEmail: "jefe-temporal@example.com",
      processId: sourceProcessId,
      companyId,
      companyName: testName,
    },
    req: {} as never,
    res: {} as never,
  } as never);
}

async function processCharacterizationId(processId: number) {
  const rows = await db
    .select()
    .from(processCharacterizations)
    .where(eq(processCharacterizations.processId, processId))
    .limit(1);
  return rows[0]?.id;
}

beforeAll(async () => {
  db = (await getDb()) as NonNullable<Awaited<ReturnType<typeof getDb>>>;
  if (!db) {
    throw new Error(
      "La base local no está disponible para pruebas de integración."
    );
  }

  const company = await db.insert(companies).values({
    name: testName,
    description:
      "Datos temporales autolimpiables para probar copia de caracterización.",
    ownerAccountId: 1,
    status: "En Proceso",
  });
  companyId = Number(company[0].insertId);

  const [
    source,
    emptyTarget,
    occupiedTarget,
    rollbackTarget,
    resourceOnlyTarget,
  ] = await Promise.all([
    db
      .insert(processes)
      .values({ companyId, name: "Origen temporal", processType: "misional" }),
    db
      .insert(processes)
      .values({
        companyId,
        name: "Destino vacío temporal",
        processType: "soporte",
      }),
    db
      .insert(processes)
      .values({
        companyId,
        name: "Destino ocupado temporal",
        processType: "estratégico",
      }),
    db
      .insert(processes)
      .values({
        companyId,
        name: "Destino rollback temporal",
        processType: "misional",
      }),
    db
      .insert(processes)
      .values({
        companyId,
        name: "Destino sólo recursos temporal",
        processType: "soporte",
      }),
  ]);
  sourceProcessId = Number(source[0].insertId);
  targetEmptyProcessId = Number(emptyTarget[0].insertId);
  targetOccupiedProcessId = Number(occupiedTarget[0].insertId);
  targetRollbackProcessId = Number(rollbackTarget[0].insertId);
  targetResourceOnlyProcessId = Number(resourceOnlyTarget[0].insertId);

  const otherCompany = await db.insert(companies).values({
    name: `${testName} externa`,
    description: "Empresa temporal externa para validar aislamiento.",
    ownerAccountId: 1,
    status: "En Proceso",
  });
  otherCompanyId = Number(otherCompany[0].insertId);
  const otherProcess = await db.insert(processes).values({
    companyId: otherCompanyId,
    name: "Proceso externo temporal",
    processType: "misional",
  });
  otherCompanyProcessId = Number(otherProcess[0].insertId);

  const sourceCharacterization = await db
    .insert(processCharacterizations)
    .values({
      processId: sourceProcessId,
      macroProcess: "Temporal",
      responsible: "No debe copiarse",
      objective: "No debe copiarse con la caracterización general",
      scope: "No debe copiarse con la caracterización general",
    });
  sourceCharacterizationId = Number(sourceCharacterization[0].insertId);
  const rollbackCharacterization = await db
    .insert(processCharacterizations)
    .values({
      processId: targetRollbackProcessId,
    });
  targetRollbackCharacterizationId = Number(
    rollbackCharacterization[0].insertId
  );

  const participant = await db.insert(processParticipants).values({
    // Simula el formato histórico de Aliaga: el puesto fue guardado con el id del proceso.
    processCharacterizationId: sourceProcessId,
    position: "Supervisor temporal",
    objective: "Coordinar las operaciones de prueba",
    responsibility: "Revisar el cumplimiento de prueba",
    authority: "Aprobar ajustes operativos de prueba",
    orderIndex: 0,
  });
  sourceParticipantId = Number(participant[0].insertId);
  const secondParticipant = await db.insert(processParticipants).values({
    processCharacterizationId: sourceProcessId,
    position: "Técnico temporal",
    objective: "Ejecutar actividades de prueba",
    responsibility: "Registrar evidencia de prueba",
    authority: "Solicitar recursos de prueba",
    orderIndex: 1,
  });

  const assignment = await db.insert(participantWorkerAssignments).values({
    processParticipantId: sourceParticipantId,
    payrollEmployeeId: 999999,
  });
  const assignmentId = Number(assignment[0].insertId);
  const kpi = await db.insert(participantWorkerKpis).values({
    participantWorkerAssignmentId: assignmentId,
    year: 2026,
    name: "KPI que no debe copiarse",
    monthlyTarget: "10.00",
  });
  const kpiId = Number(kpi[0].insertId);
  await db.insert(participantWorkerKpiValues).values({
    participantWorkerKpiId: kpiId,
    month: 1,
    actualValue: "9.00",
  });

  await db.insert(processResources).values([
    {
      processCharacterizationId: sourceCharacterizationId,
      participantId: sourceParticipantId,
      participant: "Supervisor temporal",
      resourceType: "Equipo",
      description: "Recurso asociado al puesto",
      resourceName: "Computador de prueba",
      resourceElements: "Equipo, licencia y acceso",
      orderIndex: 0,
    },
    {
      processCharacterizationId: sourceCharacterizationId,
      participantId: null,
      participant: null,
      resourceType: "Infraestructura",
      description: "Recurso común sin puesto",
      resourceName: "Sala de prueba",
      resourceElements: "Espacio compartido",
      orderIndex: 1,
    },
  ]);

  const sourceMap = await db.insert(subprocessMaps).values({
    processId: sourceProcessId,
    entrada: "Entrada de prueba",
    necesidades: "Necesidad de prueba",
    subprocesos: "Subproceso de prueba",
    salida: "Salida de prueba",
  });
  const sourceMapId = Number(sourceMap[0].insertId);
  await db.insert(subprocessMapEntries).values({
    subprocessMapId: sourceMapId,
    partesInteresadas: "Proveedor de prueba",
    internoExterno: "Externo",
    clienteProveedor: "Proveedor",
    necesidades: "Material de prueba",
    orderIndex: 0,
  });
  await db.insert(subprocessMapSubprocesses).values({
    subprocessMapId: sourceMapId,
    acciones: "Preparar prueba",
    subproceso: "Preparación",
    orderIndex: 0,
  });
  await db.insert(subprocessMapOutputs).values({
    subprocessMapId: sourceMapId,
    salidas: "Resultado de prueba",
    doc: "Registro de prueba",
    orderIndex: 0,
  });

  const procedure = await db.insert(procedures).values({
    processId: sourceProcessId,
    name: "Procedimiento temporal",
    objective: "Objetivo del procedimiento temporal",
    code: "PT-001",
    version: "1.0",
    createdDate: "2026-09-01",
    lastVersion: "0.0",
    procedureFileUrl: "https://archivos-prueba.local/procedimiento.pdf",
    procedureFileKey: "tests/procedimiento.pdf",
    procedureFileSizeBytes: 100,
    flowchartFileUrl: "https://archivos-prueba.local/flujo.pdf",
    flowchartFileKey: "tests/flujo.pdf",
    flowchartFileSizeBytes: 200,
  });
  sourceProcedureId = Number(procedure[0].insertId);
  await db.insert(procedureRecords).values({
    procedureId: sourceProcedureId,
    name: "Registro que no debe copiarse",
    code: "RG-001",
    version: "1.0",
    date: "2026-09-01",
    fileUrl: "https://archivos-prueba.local/registro.pdf",
    fileKey: "tests/registro.pdf",
    fileSizeBytes: 300,
  });

  await db.insert(subprocessMaps).values({
    processId: targetOccupiedProcessId,
    entrada: "Mapa que no debe modificarse",
    necesidades: "Necesidad existente",
    subprocesos: "Subproceso existente",
    salida: "Salida existente",
  });
  await db.insert(procedures).values({
    processId: targetOccupiedProcessId,
    name: "Procedimiento que no debe modificarse",
    objective: "Existente",
    code: "EX-001",
    version: "1.0",
  });

  expect(secondParticipant[0].insertId).toBeTruthy();
});

afterAll(async () => {
  if (!db) return;
  if (rollbackTriggerCreated) {
    await db.execute(sql.raw(`DROP TRIGGER IF EXISTS \`${triggerName}\``));
  }

  const allProcessIds = [
    sourceProcessId,
    targetEmptyProcessId,
    targetOccupiedProcessId,
    targetRollbackProcessId,
    targetResourceOnlyProcessId,
    otherCompanyProcessId,
  ].filter(Boolean);
  const maps = allProcessIds.length
    ? await db
        .select()
        .from(subprocessMaps)
        .where(inArray(subprocessMaps.processId, allProcessIds))
    : [];
  const mapIds = maps.map(map => map.id);
  if (mapIds.length) {
    await db
      .delete(subprocessMapEntries)
      .where(inArray(subprocessMapEntries.subprocessMapId, mapIds));
    await db
      .delete(subprocessMapSubprocesses)
      .where(inArray(subprocessMapSubprocesses.subprocessMapId, mapIds));
    await db
      .delete(subprocessMapOutputs)
      .where(inArray(subprocessMapOutputs.subprocessMapId, mapIds));
    await db.delete(subprocessMaps).where(inArray(subprocessMaps.id, mapIds));
  }

  const procedureRows = allProcessIds.length
    ? await db
        .select()
        .from(procedures)
        .where(inArray(procedures.processId, allProcessIds))
    : [];
  const procedureIds = procedureRows.map(procedure => procedure.id);
  if (procedureIds.length) {
    await db
      .delete(procedureRecords)
      .where(inArray(procedureRecords.procedureId, procedureIds));
    await db.delete(procedures).where(inArray(procedures.id, procedureIds));
  }

  const characterizations = allProcessIds.length
    ? await db
        .select()
        .from(processCharacterizations)
        .where(inArray(processCharacterizations.processId, allProcessIds))
    : [];
  const characterizationIds = characterizations.map(
    characterization => characterization.id
  );
  const participantReferenceIds = [...characterizationIds, ...allProcessIds];
  if (participantReferenceIds.length) {
    const participantRows = await db
      .select()
      .from(processParticipants)
      .where(
        inArray(
          processParticipants.processCharacterizationId,
          participantReferenceIds
        )
      );
    const participantIds = participantRows.map(participant => participant.id);
    if (participantIds.length) {
      const assignments = await db
        .select()
        .from(participantWorkerAssignments)
        .where(
          inArray(
            participantWorkerAssignments.processParticipantId,
            participantIds
          )
        );
      const assignmentIds = assignments.map(assignment => assignment.id);
      if (assignmentIds.length) {
        const kpis = await db
          .select()
          .from(participantWorkerKpis)
          .where(
            inArray(
              participantWorkerKpis.participantWorkerAssignmentId,
              assignmentIds
            )
          );
        const kpiIds = kpis.map(kpi => kpi.id);
        if (kpiIds.length) {
          await db
            .delete(participantWorkerKpiValues)
            .where(
              inArray(participantWorkerKpiValues.participantWorkerKpiId, kpiIds)
            );
          await db
            .delete(participantWorkerKpis)
            .where(inArray(participantWorkerKpis.id, kpiIds));
        }
        await db
          .delete(participantWorkerAssignments)
          .where(inArray(participantWorkerAssignments.id, assignmentIds));
      }
      await db
        .delete(processParticipants)
        .where(inArray(processParticipants.id, participantIds));
    }
    await db
      .delete(processResources)
      .where(
        inArray(processResources.processCharacterizationId, characterizationIds)
      );
    await db
      .delete(processCharacterizations)
      .where(inArray(processCharacterizations.id, characterizationIds));
  }

  if (allProcessIds.length) {
    await db.delete(processes).where(inArray(processes.id, allProcessIds));
  }
  if (companyId) await db.delete(companies).where(eq(companies.id, companyId));
  if (otherCompanyId)
    await db.delete(companies).where(eq(companies.id, otherCompanyId));
});

describe("Copia selectiva de Caracterización: integración local", () => {
  it("previsualiza de forma independiente los módulos vacíos y los módulos ocupados", async () => {
    const preview = await adminCaller().preview({
      companyId,
      sourceProcessId,
      targetProcessIds: [
        targetEmptyProcessId,
        targetOccupiedProcessId,
        targetEmptyProcessId,
      ],
      modules: ["participants", "resources", "subprocessMap", "procedures"],
    });

    expect(preview.targets).toHaveLength(2);
    const emptyTarget = preview.targets.find(
      target => target.id === targetEmptyProcessId
    )!;
    expect(emptyTarget.modules.every(module => module.action === "ready")).toBe(
      true
    );
    const occupiedTarget = preview.targets.find(
      target => target.id === targetOccupiedProcessId
    )!;
    expect(
      occupiedTarget.modules.find(module => module.module === "subprocessMap")
        ?.action
    ).toBe("skipped_nonempty");
    expect(
      occupiedTarget.modules.find(module => module.module === "procedures")
        ?.action
    ).toBe("skipped_nonempty");
  });

  it("copia los cuatro módulos completos sin trabajadores, KPI, archivos ni registros", async () => {
    const result = await adminCaller().execute({
      companyId,
      sourceProcessId,
      targetProcessIds: [targetEmptyProcessId, targetOccupiedProcessId],
      modules: ["participants", "resources", "subprocessMap", "procedures"],
    });
    expect(result.copied).toHaveLength(2);

    const emptyCharacterizationId =
      await processCharacterizationId(targetEmptyProcessId);
    expect(emptyCharacterizationId).toBeTruthy();
    const copiedParticipants = await db
      .select()
      .from(processParticipants)
      .where(
        eq(
          processParticipants.processCharacterizationId,
          emptyCharacterizationId!
        )
      );
    expect(copiedParticipants).toHaveLength(2);
    expect(copiedParticipants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          position: "Supervisor temporal",
          objective: "Coordinar las operaciones de prueba",
          responsibility: "Revisar el cumplimiento de prueba",
          authority: "Aprobar ajustes operativos de prueba",
        }),
        expect.objectContaining({ position: "Técnico temporal" }),
      ])
    );

    const copiedParticipantIds = copiedParticipants.map(
      participant => participant.id
    );
    const copiedAssignments = await db
      .select()
      .from(participantWorkerAssignments)
      .where(
        inArray(
          participantWorkerAssignments.processParticipantId,
          copiedParticipantIds
        )
      );
    expect(copiedAssignments).toHaveLength(0);
    const copiedKpis = await db
      .select()
      .from(participantWorkerKpis)
      .where(eq(participantWorkerKpis.participantWorkerAssignmentId, 0));
    expect(copiedKpis).toHaveLength(0);

    const copiedResources = await db
      .select()
      .from(processResources)
      .where(
        eq(processResources.processCharacterizationId, emptyCharacterizationId!)
      );
    expect(copiedResources).toHaveLength(2);
    const associatedResource = copiedResources.find(
      resource => resource.resourceName === "Computador de prueba"
    )!;
    const copiedSupervisor = copiedParticipants.find(
      participant => participant.position === "Supervisor temporal"
    )!;
    expect(associatedResource).toMatchObject({
      participantId: copiedSupervisor.id,
      participant: "Supervisor temporal",
      resourceElements: "Equipo, licencia y acceso",
    });
    expect(
      copiedResources.find(
        resource => resource.resourceName === "Sala de prueba"
      )
    ).toMatchObject({
      participantId: null,
      participant: null,
      resourceElements: "Espacio compartido",
    });

    const [copiedMap] = await db
      .select()
      .from(subprocessMaps)
      .where(eq(subprocessMaps.processId, targetEmptyProcessId));
    expect(copiedMap).toMatchObject({
      entrada: "Entrada de prueba",
      necesidades: "Necesidad de prueba",
      subprocesos: "Subproceso de prueba",
      salida: "Salida de prueba",
    });
    const [copiedEntry] = await db
      .select()
      .from(subprocessMapEntries)
      .where(eq(subprocessMapEntries.subprocessMapId, copiedMap.id));
    expect(copiedEntry).toMatchObject({
      partesInteresadas: "Proveedor de prueba",
      necesidades: "Material de prueba",
      orderIndex: 0,
    });
    const [copiedSubprocess] = await db
      .select()
      .from(subprocessMapSubprocesses)
      .where(eq(subprocessMapSubprocesses.subprocessMapId, copiedMap.id));
    expect(copiedSubprocess).toMatchObject({
      acciones: "Preparar prueba",
      subproceso: "Preparación",
    });
    const [copiedOutput] = await db
      .select()
      .from(subprocessMapOutputs)
      .where(eq(subprocessMapOutputs.subprocessMapId, copiedMap.id));
    expect(copiedOutput).toMatchObject({
      salidas: "Resultado de prueba",
      doc: "Registro de prueba",
    });

    const [copiedProcedure] = await db
      .select()
      .from(procedures)
      .where(eq(procedures.processId, targetEmptyProcessId));
    expect(copiedProcedure).toMatchObject({
      name: "Procedimiento temporal",
      objective: "Objetivo del procedimiento temporal",
      code: "PT-001",
      version: "1.0",
      procedureFileUrl: null,
      procedureFileKey: null,
      procedureFileSizeBytes: 0,
      flowchartFileUrl: null,
      flowchartFileKey: null,
      flowchartFileSizeBytes: 0,
    });
    const copiedRecords = await db
      .select()
      .from(procedureRecords)
      .where(eq(procedureRecords.procedureId, copiedProcedure.id));
    expect(copiedRecords).toHaveLength(0);

    const [untouchedMap] = await db
      .select()
      .from(subprocessMaps)
      .where(eq(subprocessMaps.processId, targetOccupiedProcessId));
    expect(untouchedMap.entrada).toBe("Mapa que no debe modificarse");
    const occupiedProcedures = await db
      .select()
      .from(procedures)
      .where(eq(procedures.processId, targetOccupiedProcessId));
    expect(occupiedProcedures).toHaveLength(1);
    expect(occupiedProcedures[0].name).toBe(
      "Procedimiento que no debe modificarse"
    );
  });

  it("no duplica ni sobrescribe información al ejecutar por segunda vez", async () => {
    await adminCaller().execute({
      companyId,
      sourceProcessId,
      targetProcessIds: [targetEmptyProcessId, targetOccupiedProcessId],
      modules: ["participants", "resources", "subprocessMap", "procedures"],
    });

    const emptyCharacterizationId =
      await processCharacterizationId(targetEmptyProcessId);
    const participants = await db
      .select()
      .from(processParticipants)
      .where(
        eq(
          processParticipants.processCharacterizationId,
          emptyCharacterizationId!
        )
      );
    const resources = await db
      .select()
      .from(processResources)
      .where(
        eq(processResources.processCharacterizationId, emptyCharacterizationId!)
      );
    const maps = await db
      .select()
      .from(subprocessMaps)
      .where(eq(subprocessMaps.processId, targetEmptyProcessId));
    const copiedProcedures = await db
      .select()
      .from(procedures)
      .where(eq(procedures.processId, targetEmptyProcessId));
    expect(participants).toHaveLength(2);
    expect(resources).toHaveLength(2);
    expect(maps).toHaveLength(1);
    expect(copiedProcedures).toHaveLength(1);
  });

  it("copia Recursos por separado y conserva la referencia textual si el puesto aún no existe en el destino", async () => {
    const result = await adminCaller().execute({
      companyId,
      sourceProcessId,
      targetProcessIds: [targetResourceOnlyProcessId],
      modules: ["resources"],
    });
    expect(result.copied[0]?.copied.resources).toBe(2);

    const characterizationId = await processCharacterizationId(
      targetResourceOnlyProcessId
    );
    expect(characterizationId).toBeTruthy();
    const resources = await db
      .select()
      .from(processResources)
      .where(
        eq(processResources.processCharacterizationId, characterizationId!)
      );
    expect(resources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          resourceName: "Computador de prueba",
          participantId: null,
          participant: "Supervisor temporal",
        }),
        expect.objectContaining({
          resourceName: "Sala de prueba",
          participantId: null,
          participant: null,
        }),
      ])
    );
  });

  it("rechaza procesos de otra empresa y a un Jefe de Proceso", async () => {
    await expect(
      adminCaller().preview({
        companyId,
        sourceProcessId,
        targetProcessIds: [otherCompanyProcessId],
        modules: ["participants"],
      })
    ).rejects.toThrow("misma empresa");

    await expect(
      leaderCaller().execute({
        companyId,
        sourceProcessId,
        targetProcessIds: [targetRollbackProcessId],
        modules: ["participants"],
      })
    ).rejects.toThrow("Sólo el Administrador o Gerente");
  });

  it("revierte las inserciones del destino que falla y conserva el destino anterior ya confirmado", async () => {
    await db.execute(
      sql.raw(
        `CREATE TRIGGER \`${triggerName}\` BEFORE INSERT ON processResources FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Fallo temporal intencional de copia'`
      )
    );
    rollbackTriggerCreated = true;

    await expect(
      adminCaller().execute({
        companyId,
        sourceProcessId,
        targetProcessIds: [targetRollbackProcessId],
        modules: ["participants", "resources"],
      })
    ).rejects.toThrow();

    const rollbackParticipants = await db
      .select()
      .from(processParticipants)
      .where(
        eq(
          processParticipants.processCharacterizationId,
          targetRollbackCharacterizationId
        )
      );
    const rollbackResources = await db
      .select()
      .from(processResources)
      .where(
        eq(
          processResources.processCharacterizationId,
          targetRollbackCharacterizationId
        )
      );
    expect(rollbackParticipants).toHaveLength(0);
    expect(rollbackResources).toHaveLength(0);

    const alreadyCopiedParticipants = await db
      .select()
      .from(processParticipants)
      .where(
        eq(
          processParticipants.processCharacterizationId,
          (await processCharacterizationId(targetEmptyProcessId)) as number
        )
      );
    expect(alreadyCopiedParticipants).toHaveLength(2);
  });
});
