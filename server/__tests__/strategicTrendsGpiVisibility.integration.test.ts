import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { companies, criticalityMatrix, processes, stakeholders } from "../../drizzle/schema";
import { getDb } from "../db";
import { strategicTrendsRouter } from "../routers/strategicTrends";

let db: NonNullable<Awaited<ReturnType<typeof getDb>>>;
let companyId = 0;
let processId = 0;
let stakeholderId = 0;
const caller = () => strategicTrendsRouter.createCaller({
  user: { role: "admin" }, manager: null, processLeader: null,
  req: {} as never, res: {} as never,
} as never);

describe("Visibilidad GPI de portada: metadata aditiva sin cambiar el indicador", () => {
  beforeAll(async () => {
    db = (await getDb())!;
    if (!db) throw new Error("Se requiere MySQL de integración.");
    const company = await db.insert(companies).values({ name: `Prueba ficticia anillos GPI ${Date.now()}`, ownerAccountId: 1, status: "En Proceso" });
    companyId = Number(company[0].insertId);
    const process = await db.insert(processes).values({ companyId, name: "Proceso ficticio GPI", processType: "soporte" });
    processId = Number(process[0].insertId);
    const stakeholder = await db.insert(stakeholders).values({ processId, name: "Parte interesada ficticia", type: "cliente", isInternal: false, orderIndex: 0 });
    stakeholderId = Number(stakeholder[0].insertId);
    await db.insert(criticalityMatrix).values({ processId, stakeholderId, incidence: "1", risk: "A", criticality: "1A", actionToTake: "  ", implementationStatus: false });
  });
  afterAll(async () => {
    if (!db) return;
    if (processId) await db.delete(criticalityMatrix).where(eq(criticalityMatrix.processId, processId));
    if (processId) await db.delete(stakeholders).where(eq(stakeholders.processId, processId));
    if (processId) await db.delete(processes).where(eq(processes.id, processId));
    if (companyId) await db.delete(companies).where(eq(companies.id, companyId));
  });
  it("no infiere planificación de una parte interesada identificada", async () => {
    const rows = await caller().getStakeholdersByArea({ companyId });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ processId, totalStakeholders: 1, internalCount: 0, externalCount: 1, implemented: 0, percentImplemented: 0, plannedActions: 0 });
  });
  it("distingue una acción planificada no cumplida del caso sin planificación", async () => {
    await db.update(criticalityMatrix).set({ actionToTake: "Gestionar la acción ficticia" }).where(eq(criticalityMatrix.stakeholderId, stakeholderId));
    const rows = await caller().getStakeholdersByArea({ companyId });
    expect(rows[0]).toMatchObject({ totalStakeholders: 1, implemented: 0, percentImplemented: 0, plannedActions: 1 });
  });
  it("conserva el porcentaje y numerador anteriores al marcarla implementada", async () => {
    await db.update(criticalityMatrix).set({ implementationStatus: true }).where(eq(criticalityMatrix.stakeholderId, stakeholderId));
    const rows = await caller().getStakeholdersByArea({ companyId });
    expect(rows[0]).toMatchObject({ totalStakeholders: 1, implemented: 1, percentImplemented: 100, plannedActions: 1 });
    expect(Object.keys(rows[0]).sort()).toEqual(["processId", "processName", "totalStakeholders", "implemented", "percentImplemented", "internalCount", "externalCount", "plannedActions"].sort());
  });
});
