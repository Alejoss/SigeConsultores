import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { accounts, companies, policies, policyObjectives, processes, processFODA } from "../../drizzle/schema";
import { getDb } from "../db";
import { processFODARouter } from "../routers/processFODA";

let db: NonNullable<Awaited<ReturnType<typeof getDb>>>;
let accountId = 0, companyId = 0, foreignCompanyId = 0, policyId = 0, foreignPolicyId = 0;
let processId = 0, foreignProcessId = 0, currentId = 0, foreignId = 0, removedId = 0;
const suffix = `foda-links-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const current = () => ({ id: 1, fodaElementId: "current-row", policyObjectiveId: currentId,
  policyObjective: "Objetivo vigente", policyObjectiveDescription: "Descripción vigente",
  selectedObjectiveContent: "Objetivo vigente\n\nDescripción vigente", subprocess: "Finanzas",
  statement: "Hallazgo vigente", description: "Información original" });
const historical = () => ({ id: 2, fodaElementId: "historical-row", policyObjectiveId: removedId,
  policyObjective: "Objetivo anterior", policyObjectiveDescription: "Descripción anterior",
  selectedObjectiveContent: "Objetivo anterior\n\nDescripción anterior", subprocess: "Finanzas",
  statement: "Hallazgo anterior", description: "Conservar este texto" });
const matrix = () => [{ id: "otg-history", policyObjectiveId: removedId, objetivoPolitica: "Objetivo anterior",
  policyObjectiveDescription: "Descripción anterior", situacionInicial: "Conservar narrativa",
  objetivoTactico: "Conservar OTG", puntoPartida: 150, puntoLlegada: 250, alcanzado: 190,
  acciones: [{ id: "task", accion: "Acción original", ponderacion: 100, alcanzado: 50 }] }];
function caller() {
  return processFODARouter.createCaller({ user: null, manager: { companyId, companyName: suffix,
    managerEmail: "foda-review@example.test" }, processLeader: null, req: {} as never, res: {} as never } as never);
}
const read = async () => (await db.select().from(processFODA).where(eq(processFODA.processId, processId)))[0];
const save = (rows: unknown[], opportunities: unknown[] = []) => caller().upsert({ processId,
  strengths: JSON.stringify(rows), opportunities: JSON.stringify(opportunities), weaknesses: "[]", threats: "[]" });

beforeAll(async () => {
  db = (await getDb())!;
  if (!db) throw new Error("Se requiere MySQL de pruebas.");
  const [account] = await db.insert(accounts).values({ openId: suffix, name: "Revisión FODA", status: "active" });
  accountId = Number(account.insertId);
  const [company] = await db.insert(companies).values({ name: suffix, ownerAccountId: accountId, status: "En Proceso" });
  companyId = Number(company.insertId);
  const [foreign] = await db.insert(companies).values({ name: `${suffix}-foreign`, ownerAccountId: accountId, status: "En Proceso" });
  foreignCompanyId = Number(foreign.insertId);
  const [policy] = await db.insert(policies).values({ companyId, versionNo: "1", policyText: "Política ficticia" });
  policyId = Number(policy.insertId);
  const [foreignPolicy] = await db.insert(policies).values({ companyId: foreignCompanyId, versionNo: "1", policyText: "Política ajena" });
  foreignPolicyId = Number(foreignPolicy.insertId);
  const [objective] = await db.insert(policyObjectives).values({ policyId, objective: "Objetivo vigente", description: "Descripción vigente", orderIndex: 1 });
  currentId = Number(objective.insertId);
  const [foreignObjective] = await db.insert(policyObjectives).values({ policyId: foreignPolicyId, objective: "Objetivo ajeno", orderIndex: 1 });
  foreignId = Number(foreignObjective.insertId);
  const [removed] = await db.insert(policyObjectives).values({ policyId, objective: "Objetivo anterior", orderIndex: 2 });
  removedId = Number(removed.insertId);
  await db.delete(policyObjectives).where(eq(policyObjectives.id, removedId));
  const [process] = await db.insert(processes).values({ companyId, name: "Finanzas ficticias", processType: "soporte" });
  processId = Number(process.insertId);
  const [foreignProcess] = await db.insert(processes).values({ companyId: foreignCompanyId, name: "Proceso ajeno", processType: "soporte" });
  foreignProcessId = Number(foreignProcess.insertId);
  await db.insert(processFODA).values({ processId });
});
beforeEach(async () => {
  await db.update(processFODA).set({ strengths: JSON.stringify([current(), historical()]), opportunities: "[]",
    weaknesses: "[]", threats: "[]", matrixData: JSON.stringify(matrix()) }).where(eq(processFODA.processId, processId));
});
afterAll(async () => {
  if (!db) return;
  const processIds = [processId, foreignProcessId].filter(Boolean);
  if (processIds.length) {
    await db.delete(processFODA).where(inArray(processFODA.processId, processIds));
    await db.delete(processes).where(inArray(processes.id, processIds));
  }
  const policyIds = [policyId, foreignPolicyId].filter(Boolean);
  if (policyIds.length) {
    await db.delete(policyObjectives).where(inArray(policyObjectives.policyId, policyIds));
    await db.delete(policies).where(inArray(policies.id, policyIds));
  }
  const companyIds = [companyId, foreignCompanyId].filter(Boolean);
  if (companyIds.length) await db.delete(companies).where(inArray(companies.id, companyIds));
  if (accountId) await db.delete(accounts).where(eq(accounts.id, accountId));
});

describe("FODA: referencias de política vigentes e históricas", () => {
  it("lista desde la empresa del proceso, sin cambios en el FODA", async () => {
    const before = await read();
    const list = await caller().listPolicyObjectives({ processId });
    expect(list.map(row => row.id)).toContain(currentId);
    expect(list.map(row => row.id)).not.toContain(foreignId);
    expect(list.map(row => row.id)).not.toContain(removedId);
    expect(await read()).toEqual(before);
  });
  it("rechaza consultar un proceso ajeno", async () => {
    await expect(caller().listPolicyObjectives({ processId: foreignProcessId })).rejects.toThrow();
  });
  it("admite repetir el objetivo en filas y categorías", async () => {
    const before = await read();
    await save([current(), { ...current(), id: 3, fodaElementId: "repeat", statement: "Otro hallazgo" }],
      [{ ...current(), id: 4, fodaElementId: "opportunity" }]);
    const after = await read();
    expect(JSON.parse(after.strengths!).map((row: any) => row.policyObjectiveId)).toEqual([currentId, currentId]);
    expect(JSON.parse(after.opportunities!)[0].policyObjectiveId).toBe(currentId);
    expect(after.matrixData).toBe(before.matrixData);
  });
  it("permite guardar un nuevo vínculo sin que otra fila histórica bloquee el FODA", async () => {
    await save([{ ...current(), description: "Nuevo comentario" }, historical()]);
    const after = await read();
    expect(JSON.parse(after.strengths!)[1]).toEqual(historical());
    expect(after.matrixData).toBe(JSON.stringify(matrix()));
  });
  it("conserva texto histórico al editar su hallazgo", async () => {
    await save([current(), { ...historical(), statement: "Hallazgo corregido", description: "Comentario nuevo" }]);
    expect(JSON.parse((await read()).strengths!)[1]).toMatchObject({ policyObjectiveId: removedId,
      policyObjective: "Objetivo anterior", selectedObjectiveContent: historical().selectedObjectiveContent, statement: "Hallazgo corregido" });
  });
  it("permite reemplazar el histórico por un vigente y refresca el contenido", async () => {
    await save([current(), { ...historical(), policyObjectiveId: currentId }]);
    expect(JSON.parse((await read()).strengths!)[1]).toMatchObject({ policyObjectiveId: currentId,
      policyObjective: "Objetivo vigente", selectedObjectiveContent: current().selectedObjectiveContent });
  });
  it.each([true, -1, 1.5, "no-id"])("rechaza ID malformado %s sin escribir", async invalid => {
    const before = await read();
    await expect(save([{ ...current(), policyObjectiveId: invalid }, historical()])).rejects.toThrow("identificador");
    expect(await read()).toEqual(before);
  });
  it.each(["foreign", "missing", "new-history", "tampered-history"])("rechaza %s sin cambios", async kind => {
    const before = await read();
    const bad = kind === "foreign" ? { ...current(), policyObjectiveId: foreignId }
      : kind === "missing" ? { ...current(), policyObjectiveId: removedId }
      : kind === "new-history" ? { ...historical(), id: 9, fodaElementId: "invented" }
      : { ...historical(), policyObjective: "Texto histórico inventado" };
    await expect(save([current(), bad])).rejects.toThrow();
    expect(await read()).toEqual(before);
  });
  it("no considera histórico un ID ajeno que antes estuviera guardado", async () => {
    const bad = { ...historical(), policyObjectiveId: foreignId };
    await db.update(processFODA).set({ strengths: JSON.stringify([bad]) }).where(eq(processFODA.processId, processId));
    const before = await read();
    await expect(save([bad])).rejects.toThrow("no pertenece");
    expect(await read()).toEqual(before);
  });
  it("conserva texto libre histórico sin ID", async () => {
    await save([{ ...current(), policyObjectiveId: null, policyObjective: "Texto antiguo" }]);
    expect(JSON.parse((await read()).strengths!)[0].policyObjective).toBe("Texto antiguo");
  });
  it("guarda tareas de matriz con vínculo eliminado sin alterar el FODA", async () => {
    const before = await read();
    const next = matrix(); next[0].acciones[0].alcanzado = 75;
    await caller().saveMatrixData({ processId, matrixData: JSON.stringify(next) });
    const after = await read();
    expect(after.strengths).toBe(before.strengths);
    expect(JSON.parse(after.matrixData!)[0]).toMatchObject({ policyObjectiveId: removedId, objetivoPolitica: "Objetivo anterior",
      situacionInicial: "Conservar narrativa", acciones: [{ alcanzado: 75 }] });
  });
  it("permite IDs repetidos en matriz y mantiene narrativas omitidas", async () => {
    const first: any = { ...matrix()[0], policyObjectiveId: currentId }; delete first.situacionInicial;
    await caller().saveMatrixData({ processId, matrixData: JSON.stringify([first, { ...first, id: "otg-new" }]) });
    const rows = JSON.parse((await read()).matrixData!);
    expect(rows.map((row: any) => row.policyObjectiveId)).toEqual([currentId, currentId]);
    expect(rows[0].situacionInicial).toBe("Conservar narrativa");
  });
  it("rechaza nuevo ID eliminado o ajeno en matriz sin cambios", async () => {
    for (const id of [foreignId, removedId]) {
      const before = await read();
      await expect(caller().saveMatrixData({ processId, matrixData: JSON.stringify([{ ...matrix()[0], id: "new", policyObjectiveId: id }]) })).rejects.toThrow();
      expect(await read()).toEqual(before);
    }
  });
});
