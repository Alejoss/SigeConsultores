import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  accounts,
  companies,
  processOutputReleaseControls,
  processOutputReleaseEvidence,
  processOutputReleasePeriods,
  processes,
  subprocessMaps,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { processOutputReleaseRouter } from "../routers/processOutputRelease";
import { consolidatedScheduleRouter } from "../routers/consolidatedSchedule";

function adminContext(accountId: number) {
  return {
    user: {
      id: accountId,
      openId: `output-release-admin-${accountId}`,
      name: "Administrador de pruebas",
      email: "output-release@example.test",
      role: "admin" as const,
    },
    manager: null,
    processLeader: null,
  };
}

describe("Control y liberación de salidas", () => {
  let db: Awaited<ReturnType<typeof getDb>>;
  let accountId = 0;
  let companyId = 0;
  let processId = 0;
  let controlId = 0;
  let firstPeriodId = 0;

  beforeAll(async () => {
    db = await getDb();
    if (!db) throw new Error("Base de datos local no disponible");
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const account = await db.insert(accounts).values({
      openId: `output-release-${suffix}`,
      email: `output-release-${suffix}@example.test`,
      name: "Cuenta de prueba de salidas",
    });
    accountId = Number(account[0].insertId);
    const company = await db.insert(companies).values({
      name: `Empresa de control de salidas ${suffix}`,
      ownerAccountId: accountId,
    });
    companyId = Number(company[0].insertId);
    const process = await db.insert(processes).values({
      companyId,
      name: "Proceso de prueba de salidas",
      macroProcess: "Pruebas",
      processType: "misional",
    });
    processId = Number(process[0].insertId);
    await db.insert(subprocessMaps).values({
      processId,
      entrada: "[]",
      subprocesos: JSON.stringify([{ id: 1, subproceso: "Preparar entrega", acciones: "Preparar" }]),
      salida: JSON.stringify([
        {
          id: 1,
          sourceOutputKey: "output-release-test-key",
          salidas: "Informe de prueba",
          entregables: "Informe aprobado",
          doc: "Procedimiento de prueba",
        },
      ]),
    });
  });

  afterAll(async () => {
    if (!db || !processId) return;
    const controls = await db.select({ id: processOutputReleaseControls.id })
      .from(processOutputReleaseControls)
      .where(eq(processOutputReleaseControls.processId, processId));
    const controlIds = controls.map(row => row.id);
    if (controlIds.length) {
      const periods = await db.select({ id: processOutputReleasePeriods.id })
        .from(processOutputReleasePeriods)
        .where(eq(processOutputReleasePeriods.processId, processId));
      for (const period of periods) {
        await db.delete(processOutputReleaseEvidence).where(eq(processOutputReleaseEvidence.periodId, period.id));
      }
      await db.delete(processOutputReleasePeriods).where(eq(processOutputReleasePeriods.processId, processId));
      await db.delete(processOutputReleaseControls).where(eq(processOutputReleaseControls.processId, processId));
    }
    await db.delete(subprocessMaps).where(eq(subprocessMaps.processId, processId));
    await db.delete(processes).where(eq(processes.id, processId));
    await db.delete(companies).where(eq(companies.id, companyId));
    await db.delete(accounts).where(eq(accounts.id, accountId));
  });

  it("configura una salida crítica, crea un solo período y la entrega al Cronograma", async () => {
    const caller = processOutputReleaseRouter.createCaller(adminContext(accountId));
    const created = await caller.upsert({
      processId,
      sourceOutputKey: "output-release-test-key",
      sourceSubprocessName: "Preparar entrega",
      acceptanceCriteria: "Contenido completo, revisado y aprobado",
      verificationMethod: "revision_documental",
      frequency: "semanal",
      isActive: true,
      initialScheduledDate: "2020-01-01",
    });
    controlId = created.id;

    // Reintentar el autosave confirmado no duplica el período inicial.
    await caller.upsert({
      processId,
      sourceOutputKey: "output-release-test-key",
      sourceSubprocessName: "Preparar entrega",
      acceptanceCriteria: "Contenido completo, revisado y aprobado",
      verificationMethod: "revision_documental",
      frequency: "semanal",
      isActive: true,
      initialScheduledDate: "2020-01-01",
      expectedRevision: created.revision,
    });

    const configured = await caller.list({ processId });
    expect(configured.summary).toMatchObject({
      value: 0,
      status: "measured",
      scheduledControls: 1,
      assessableControls: 1,
      overdueOpen: 1,
    });
    expect(configured.controls).toHaveLength(1);
    expect(configured.controls[0].output).toBe("Informe de prueba");
    expect(configured.controls[0].periods).toHaveLength(1);
    firstPeriodId = configured.controls[0].periods[0].id;

    const scheduleCaller = consolidatedScheduleRouter.createCaller(adminContext(accountId));
    const schedule = await scheduleCaller.getConsolidatedSchedule({ processId });
    const releases = schedule.filter(item => item.type === "output_release");
    expect(releases).toHaveLength(1);
    expect(releases[0]).toMatchObject({
      id: `output-release-${firstPeriodId}`,
      navigation: { destination: "output_release", controlId, periodId: firstPeriodId },
    });
  });

  it("libera sin evidencia obligatoria y genera sólo el siguiente período futuro", async () => {
    const caller = processOutputReleaseRouter.createCaller(adminContext(accountId));
    await caller.updatePeriod({ periodId: firstPeriodId, status: "released" });

    const configured = await caller.list({ processId });
    const periods = configured.controls[0].periods;
    expect(periods.filter(period => period.status === "released")).toHaveLength(1);
    expect(periods).toHaveLength(2);
    expect(periods.filter(period => period.status === "pending")).toHaveLength(1);
    expect(periods[0].evidenceCount).toBe(0);
  });

  it("no permite configurar una salida que no esté en el Mapa de Subprocesos", async () => {
    const caller = processOutputReleaseRouter.createCaller(adminContext(accountId));
    await expect(
      caller.upsert({
        processId,
        sourceOutputKey: "salida-inexistente",
        frequency: "por_evento",
        isActive: false,
      })
    ).rejects.toThrow("ya no existe en el Mapa de Subprocesos");
  });
});
