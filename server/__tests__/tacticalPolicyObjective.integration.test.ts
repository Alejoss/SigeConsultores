import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import {
  accounts,
  accountRoles,
  companies,
  policies,
  policyObjectives,
  processTacticalObjectives,
  processes,
  roles,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { processTacticalObjectivesRouter } from "../routers/processTacticalObjectives";

const suffix = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
const policyObjectiveText = [
  "Asegurar de forma sostenida el cumplimiento de los requisitos de clientes,",
  "partes interesadas y normativa aplicable mediante la planificación, ejecución,",
  "seguimiento y mejora continua de los procesos de la organización.",
].join(" ");
let db: NonNullable<Awaited<ReturnType<typeof getDb>>>;
let companyId = 0;
let otherCompanyId = 0;
let processId = 0;
let accountId = 0;
let policyObjectiveId = 0;
let foreignPolicyObjectiveId = 0;
let tacticalObjectiveId = 0;

function leaderContext() {
  return {
    user: null,
    manager: null,
    processLeader: {
      processLeaderId: accountId,
      leaderName: "Jefe de proceso OTE",
      leaderEmail: "jefe.ote@example.test",
      processId,
      companyId,
      companyName: `Empresa OTE ${suffix}`,
    },
    req: {} as never,
    res: {} as never,
  } as never;
}

beforeAll(async () => {
  db = (await getDb()) as NonNullable<Awaited<ReturnType<typeof getDb>>>;
  if (!db) throw new Error("Base local no disponible para la prueba OTE.");

  const [processLeaderRole] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.slug, "process_leader"))
    .limit(1);
  if (!processLeaderRole) throw new Error("Rol process_leader no disponible.");

  const account = await db.insert(accounts).values({
    openId: `tactical-policy-leader-${suffix}`,
    name: "Jefe OTE de Prueba",
    email: `jefe.ote.${suffix}@example.test`,
    status: "active",
  });
  accountId = Number(account[0].insertId);

  const company = await db.insert(companies).values({
    name: `Empresa OTE ${suffix}`,
    ownerAccountId: accountId,
    status: "En Proceso",
  });
  companyId = Number(company[0].insertId);

  const otherCompany = await db.insert(companies).values({
    name: `Empresa ajena OTE ${suffix}`,
    ownerAccountId: accountId,
    status: "En Proceso",
  });
  otherCompanyId = Number(otherCompany[0].insertId);

  const [policy] = await db.insert(policies).values({
    companyId,
    versionNo: "1.0",
    policyText: "Política de pruebas de OTE.",
  });
  const policyId = Number(policy.insertId);

  const [otherPolicy] = await db.insert(policies).values({
    companyId: otherCompanyId,
    versionNo: "1.0",
    policyText: "Política ajena de pruebas de OTE.",
  });
  const otherPolicyId = Number(otherPolicy.insertId);

  const policyObjective = await db.insert(policyObjectives).values({
    policyId,
    objective: policyObjectiveText,
    description: "Descripción de Objetivo de la Política de prueba.",
    orderIndex: 1,
  });
  policyObjectiveId = Number(policyObjective[0].insertId);

  const foreignObjective = await db.insert(policyObjectives).values({
    policyId: otherPolicyId,
    objective: "Objetivo de otra empresa",
    description: "No debe poder vincularse.",
    orderIndex: 1,
  });
  foreignPolicyObjectiveId = Number(foreignObjective[0].insertId);

  const process = await db.insert(processes).values({
    companyId,
    name: "Proceso de prueba OTE",
    processType: "soporte",
  });
  processId = Number(process[0].insertId);

  await db.insert(accountRoles).values({
    accountId,
    roleId: processLeaderRole.id,
    companyId,
    processId,
    status: "active",
  });
});

afterAll(async () => {
  if (!db) return;
  if (processId) {
    await db.delete(processTacticalObjectives).where(eq(processTacticalObjectives.processId, processId));
    await db.delete(accountRoles).where(eq(accountRoles.processId, processId));
    await db.delete(processes).where(eq(processes.id, processId));
  }
  const companyIds = [companyId, otherCompanyId].filter(Boolean);
  if (companyIds.length) {
    const policyRows = await db.select({ id: policies.id }).from(policies).where(inArray(policies.companyId, companyIds));
    const policyIds = policyRows.map(row => row.id);
    if (policyIds.length) await db.delete(policyObjectives).where(inArray(policyObjectives.policyId, policyIds));
    await db.delete(policies).where(inArray(policies.companyId, companyIds));
    await db.delete(companies).where(inArray(companies.id, companyIds));
  }
  if (accountId) await db.delete(accounts).where(eq(accounts.id, accountId));
});

describe("OTE: Objetivos de la Política", () => {
  it("vincula el OTE con el Objetivo de la Política de su misma empresa", async () => {
    const caller = processTacticalObjectivesRouter.createCaller(leaderContext());
    const created = await caller.create({
      processId,
      name: "OTE de prueba",
      description: "Verifica el vínculo corporativo correcto.",
      policyObjectiveId,
      strategicObjective: "Objetivo Estratégico de prueba",
    });
    tacticalObjectiveId = created.id;

    const [saved] = await db
      .select()
      .from(processTacticalObjectives)
      .where(eq(processTacticalObjectives.id, tacticalObjectiveId));

    expect(saved.policyObjectiveId).toBe(policyObjectiveId);
    expect(saved.policyObjective).toBe(policyObjectiveText);
    expect(saved.policyObjectiveDescription).toBe("Descripción de Objetivo de la Política de prueba.");

    const planning = await caller.loadPlanningData({ processId });
    expect(planning).toContainEqual(expect.objectContaining({
      objectiveId: tacticalObjectiveId,
      policyObjective: policyObjectiveText,
      strategicObjective: "Objetivo Estratégico de prueba",
    }));
  });

  it("impide vincular un Objetivo de la Política de otra empresa", async () => {
    const caller = processTacticalObjectivesRouter.createCaller(leaderContext());
    await expect(caller.create({
      processId,
      name: "OTE inválido",
      policyObjectiveId: foreignPolicyObjectiveId,
      strategicObjective: "Objetivo Estratégico de prueba",
    })).rejects.toThrow("no pertenece a la empresa");
  });

  it("permite quitar el vínculo sin tocar los datos de planificación", async () => {
    const caller = processTacticalObjectivesRouter.createCaller(leaderContext());
    await caller.savePlanning({
      objectiveId: tacticalObjectiveId,
      goal: "Meta preservada",
      resultKeys: [{ id: "oo-1", description: "Objetivo operativo preservado" }],
    });

    await caller.update({
      objectiveId: tacticalObjectiveId,
      name: "OTE de prueba actualizado",
      policyObjectiveId: null,
      strategicObjective: "Objetivo Estratégico de prueba",
    });

    const [saved] = await db
      .select()
      .from(processTacticalObjectives)
      .where(eq(processTacticalObjectives.id, tacticalObjectiveId));

    expect(saved.policyObjectiveId).toBeNull();
    expect(saved.policyObjective).toBeNull();
    expect(JSON.parse(saved.planningData || "{}")).toMatchObject({
      goal: "Meta preservada",
      resultKeys: [{ id: "oo-1", description: "Objetivo operativo preservado" }],
    });
  });
});
