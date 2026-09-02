import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import {
  audits,
  inspections,
  linkedCommitments,
  operationalFindingBaselines,
  operationalFindings,
  processes,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { getConsolidatedScheduleActivities } from "../lib/consolidatedScheduleActivities";
import { linkedCommitmentsRouter } from "../routers/linkedCommitments";
import { operationalFindingsRouter } from "../routers/operationalFindings";

const companyId = 991003;
let db: NonNullable<Awaited<ReturnType<typeof getDb>>>;
let auditId = 0;
let inspectionId = 0;
let processOneId = 0;
let processTwoId = 0;
let auditFindingId = 0;
let inspectionFindingId = 0;

function managerCaller() {
  return operationalFindingsRouter.createCaller({
    user: { role: "admin" },
    manager: null,
    processLeader: null,
    req: {} as never,
    res: {} as never,
  } as never);
}

function linkManagerCaller() {
  return linkedCommitmentsRouter.createCaller({
    user: { role: "admin" },
    manager: null,
    processLeader: null,
    req: {} as never,
    res: {} as never,
  } as never);
}

function leaderCaller(processId: number) {
  return linkedCommitmentsRouter.createCaller({
    user: null,
    manager: null,
    processLeader: {
      processLeaderId: 1,
      leaderName: "Jefe de prueba",
      leaderEmail: "hallazgos-prueba@example.test",
      processId,
      companyId,
      companyName: "Empresa temporal de hallazgos",
    },
    req: {} as never,
    res: {} as never,
  } as never);
}

beforeAll(async () => {
  db = (await getDb()) as NonNullable<Awaited<ReturnType<typeof getDb>>>;
  if (!db) throw new Error("La base aislada de hallazgos no está disponible.");
  await db.delete(linkedCommitments).where(eq(linkedCommitments.companyId, companyId));
  await db.delete(operationalFindings).where(eq(operationalFindings.companyId, companyId));
  await db.delete(operationalFindingBaselines).where(eq(operationalFindingBaselines.companyId, companyId));
  await db.delete(processes).where(eq(processes.companyId, companyId));
  await db.delete(audits).where(eq(audits.companyId, companyId));
  await db.delete(inspections).where(eq(inspections.companyId, companyId));

  const firstProcess = await db.insert(processes).values({
    companyId,
    name: "Proceso temporal uno",
    processType: "misional",
  });
  const secondProcess = await db.insert(processes).values({
    companyId,
    name: "Proceso temporal dos",
    processType: "soporte",
  });
  processOneId = Number(firstProcess[0].insertId);
  processTwoId = Number(secondProcess[0].insertId);

  const audit = await db.insert(audits).values({
    companyId,
    managementSystem: "Auditoría temporal",
    findingsMajorNC: 2,
    closuresMajorNC: 1,
    orderIndex: 0,
  });
  auditId = Number(audit[0].insertId);
  const inspection = await db.insert(inspections).values({
    companyId,
    managementSystem: "Inspección temporal",
    findings: 3,
    closures: 1,
    orderIndex: 0,
  });
  inspectionId = Number(inspection[0].insertId);
});

afterAll(async () => {
  if (!db) return;
  await db.delete(linkedCommitments).where(eq(linkedCommitments.companyId, companyId));
  await db.delete(operationalFindings).where(eq(operationalFindings.companyId, companyId));
  await db.delete(operationalFindingBaselines).where(eq(operationalFindingBaselines.companyId, companyId));
  await db.delete(processes).where(eq(processes.companyId, companyId));
  await db.delete(audits).where(eq(audits.companyId, companyId));
  await db.delete(inspections).where(eq(inspections.companyId, companyId));
});

describe("Hallazgos operativos: integración aislada", () => {
  it("preserva el histórico de Auditoría y bloquea cierres manuales fuera del proceso vinculado", async () => {
    const manager = managerCaller();
    const created = await manager.create({
      companyId,
      sourceType: "audit",
      sourceId: auditId,
      classification: "observation",
      finding: "Hallazgo temporal de auditoría",
      closureTask: "Corregir el hallazgo temporal",
      targetDate: "2026-10-15",
    });
    auditFindingId = created.id;

    let [audit] = await db.select().from(audits).where(eq(audits.id, auditId));
    expect(audit).toMatchObject({
      findingsMajorNC: 0,
      closuresMajorNC: 0,
      findingsObservations: 1,
      closuresObservations: 0,
    });

    await expect(manager.update({ id: auditFindingId, companyId, completed: true })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    [audit] = await db.select().from(audits).where(eq(audits.id, auditId));
    expect(audit.closuresObservations).toBe(0);
  });

  it("solo cierra el hallazgo de Auditoría cuando todos los procesos vinculados cumplen y lo muestra en Cronograma", async () => {
    const links = await linkManagerCaller().createLinks({
      companyId,
      sourceType: "audit_finding",
      sourceId: auditFindingId,
      processIds: [processOneId, processTwoId],
    });
    expect(links.created).toBe(2);

    const rows = await db
      .select()
      .from(linkedCommitments)
      .where(and(eq(linkedCommitments.companyId, companyId), eq(linkedCommitments.sourceType, "audit_finding")));
    await leaderCaller(processOneId).updateProgress({
      id: rows.find(row => row.processId === processOneId)!.id,
      companyId,
      status: "completed",
    });
    let [finding] = await db.select().from(operationalFindings).where(eq(operationalFindings.id, auditFindingId));
    expect(finding.completed).toBe(false);

    await leaderCaller(processTwoId).updateProgress({
      id: rows.find(row => row.processId === processTwoId)!.id,
      companyId,
      status: "completed",
    });
    [finding] = await db.select().from(operationalFindings).where(eq(operationalFindings.id, auditFindingId));
    expect(finding.completed).toBe(true);

    const [audit] = await db.select().from(audits).where(eq(audits.id, auditId));
    expect(audit.closuresObservations).toBe(1);
    const schedule = await getConsolidatedScheduleActivities(processOneId);
    expect(schedule.some(item => item.id === `linked-commitment-${rows[0].id}`)).toBe(true);
  });

  it("elimina desde Auditorías el hallazgo y todas sus responsabilidades vinculadas", async () => {
    const manager = managerCaller();
    await manager.delete({ id: auditFindingId, companyId });

    const deletedFinding = await db
      .select()
      .from(operationalFindings)
      .where(eq(operationalFindings.id, auditFindingId));
    expect(deletedFinding).toHaveLength(0);
    const remainingLinks = await db
      .select()
      .from(linkedCommitments)
      .where(and(eq(linkedCommitments.companyId, companyId), eq(linkedCommitments.sourceType, "audit_finding")));
    expect(remainingLinks).toHaveLength(0);
    const [audit] = await db.select().from(audits).where(eq(audits.id, auditId));
    expect(audit).toMatchObject({ findingsObservations: 0, closuresObservations: 0 });
    const schedule = await getConsolidatedScheduleActivities(processOneId);
    expect(schedule.some(item => item.id.startsWith("linked-commitment-"))).toBe(false);
  });

  it("aplica el mismo detalle y cierre automático en Inspecciones y Simulacros", async () => {
    const manager = managerCaller();
    const created = await manager.create({
      companyId,
      sourceType: "inspection",
      sourceId: inspectionId,
      classification: "major_nc",
      finding: "Hallazgo temporal de inspección",
      closureTask: "Corregir condición identificada",
      targetDate: "2026-11-20",
    });
    inspectionFindingId = created.id;
    let [inspection] = await db.select().from(inspections).where(eq(inspections.id, inspectionId));
    expect(inspection).toMatchObject({ findings: 1, closures: 0 });

    await linkManagerCaller().createLinks({
      companyId,
      sourceType: "inspection_finding",
      sourceId: inspectionFindingId,
      processIds: [processOneId],
    });
    const [link] = await db
      .select()
      .from(linkedCommitments)
      .where(and(eq(linkedCommitments.companyId, companyId), eq(linkedCommitments.sourceType, "inspection_finding")));
    await leaderCaller(processOneId).updateProgress({ id: link.id, companyId, status: "completed" });

    [inspection] = await db.select().from(inspections).where(eq(inspections.id, inspectionId));
    expect(inspection).toMatchObject({ findings: 1, closures: 1 });
  });
});
