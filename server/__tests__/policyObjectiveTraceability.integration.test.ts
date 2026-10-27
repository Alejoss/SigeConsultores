import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import {
  accounts,
  companies,
  policies,
  policyObjectives,
  policyObjectiveProcessApplicability,
  processFODA,
  processes,
  processTacticalObjectives,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { policyObjectivesRouter } from "../routers/policyObjectives";
import { processFODARouter } from "../routers/processFODA";

const suffix = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
let db: NonNullable<Awaited<ReturnType<typeof getDb>>>;
let accountId = 0;
let companyId = 0;
let foreignCompanyId = 0;
let policyId = 0;
let policyObjectiveId = 0;
let foreignObjectiveId = 0;
let commercialProcessId = 0;
let operationsProcessId = 0;
let peopleProcessId = 0;

function managerContext() {
  return {
    user: null,
    manager: {
      companyId,
      companyName: `Empresa trazabilidad ${suffix}`,
      managerEmail: "gerencia.trazabilidad@example.test",
    },
    processLeader: null,
    req: {} as never,
    res: {} as never,
  } as never;
}

function leaderContext() {
  return {
    user: null,
    manager: null,
    processLeader: {
      processLeaderId: accountId,
      leaderName: "Jefe de proceso de prueba",
      leaderEmail: "jefe.trazabilidad@example.test",
      processId: commercialProcessId,
      companyId,
      companyName: `Empresa trazabilidad ${suffix}`,
    },
    req: {} as never,
    res: {} as never,
  } as never;
}

beforeAll(async () => {
  db = (await getDb()) as NonNullable<Awaited<ReturnType<typeof getDb>>>;
  if (!db) throw new Error("Base de pruebas no disponible para trazabilidad.");

  const account = await db.insert(accounts).values({
    openId: `policy-traceability-${suffix}`,
    name: "Gerencia de Prueba",
    email: "gerencia.trazabilidad@example.test",
    status: "active",
  });
  accountId = Number(account[0].insertId);

  const company = await db.insert(companies).values({
    name: `Empresa trazabilidad ${suffix}`,
    ownerAccountId: accountId,
    status: "En Proceso",
  });
  companyId = Number(company[0].insertId);
  const foreignCompany = await db.insert(companies).values({
    name: `Empresa ajena trazabilidad ${suffix}`,
    ownerAccountId: accountId,
    status: "En Proceso",
  });
  foreignCompanyId = Number(foreignCompany[0].insertId);

  const [policy] = await db.insert(policies).values({
    companyId,
    versionNo: "1.0",
    policyText: "Política de trazabilidad de prueba.",
  });
  policyId = Number(policy.insertId);
  const [foreignPolicy] = await db.insert(policies).values({
    companyId: foreignCompanyId,
    versionNo: "1.0",
    policyText: "Política ajena de prueba.",
  });
  const foreignPolicyId = Number(foreignPolicy.insertId);

  const objective = await db.insert(policyObjectives).values({
    policyId,
    objective: "Asegurar la satisfacción del cliente",
    description: "Objetivo de la Política para pruebas de trazabilidad.",
    orderIndex: 1,
  });
  policyObjectiveId = Number(objective[0].insertId);
  const foreignObjective = await db.insert(policyObjectives).values({
    policyId: foreignPolicyId,
    objective: "Objetivo de otra empresa",
    description: "No puede vincularse a la empresa de prueba.",
    orderIndex: 1,
  });
  foreignObjectiveId = Number(foreignObjective[0].insertId);

  const [commercialProcess] = await db.insert(processes).values({
    companyId,
    name: "Comercial",
    processType: "misional",
  });
  commercialProcessId = Number(commercialProcess.insertId);
  const [operationsProcess] = await db.insert(processes).values({
    companyId,
    name: "Operaciones",
    processType: "misional",
  });
  operationsProcessId = Number(operationsProcess.insertId);
  const [peopleProcess] = await db.insert(processes).values({
    companyId,
    name: "Talento Humano",
    processType: "soporte",
  });
  peopleProcessId = Number(peopleProcess.insertId);

  await db.insert(processFODA).values({
    processId: commercialProcessId,
    strengths: JSON.stringify([
      {
        fodaElementId: "foda-commercial-1",
        policyObjectiveId,
        policyObjective: "Asegurar la satisfacción del cliente",
        statement: "Seguimiento posventa",
      },
    ]),
    matrixData: JSON.stringify([
      {
        id: "otg-commercial-1",
        sourceFodaElementId: "foda-commercial-1",
        policyObjectiveId,
        objetivoPolitica: "Asegurar la satisfacción del cliente",
        objetivoTactico: "Mejorar atención comercial",
        acciones: [
          {
            ponderacion: 100,
            tipoSeguimiento: "puntual",
            valorPuntual: 60,
            puntoLlegadaAccion: 100,
          },
        ],
      },
    ]),
  });
  await db.insert(processTacticalObjectives).values([
    {
      processId: commercialProcessId,
      name: "OTE Comercial",
      policyObjectiveId,
      policyObjective: "Asegurar la satisfacción del cliente",
      planningData: JSON.stringify({
        puntoPartida: 0,
        metaLlegada: 100,
        avanceMeta: 80,
        ponderacion: 100,
      }),
    },
    {
      processId: operationsProcessId,
      name: "OTE Operaciones",
      policyObjectiveId,
      policyObjective: "Asegurar la satisfacción del cliente",
      planningData: JSON.stringify({
        puntoPartida: 0,
        metaLlegada: 100,
        avanceMeta: 40,
        ponderacion: 100,
      }),
    },
  ]);
});

afterAll(async () => {
  if (!db) return;
  const processIds = [
    commercialProcessId,
    operationsProcessId,
    peopleProcessId,
  ].filter(Boolean);
  if (processIds.length) {
    await db
      .delete(policyObjectiveProcessApplicability)
      .where(
        inArray(policyObjectiveProcessApplicability.processId, processIds)
      );
    await db
      .delete(processTacticalObjectives)
      .where(inArray(processTacticalObjectives.processId, processIds));
    await db
      .delete(processFODA)
      .where(inArray(processFODA.processId, processIds));
    await db.delete(processes).where(inArray(processes.id, processIds));
  }
  const policyIds = [policyId].filter(Boolean);
  if (policyIds.length)
    await db
      .delete(policyObjectives)
      .where(eq(policyObjectives.policyId, policyId));
  if (foreignCompanyId) {
    const foreignPolicies = await db
      .select({ id: policies.id })
      .from(policies)
      .where(eq(policies.companyId, foreignCompanyId));
    if (foreignPolicies.length)
      await db.delete(policyObjectives).where(
        inArray(
          policyObjectives.policyId,
          foreignPolicies.map(row => row.id)
        )
      );
    await db.delete(policies).where(eq(policies.companyId, foreignCompanyId));
  }
  if (companyId)
    await db.delete(policies).where(eq(policies.companyId, companyId));
  if (foreignCompanyId)
    await db.delete(companies).where(eq(companies.id, foreignCompanyId));
  if (companyId) await db.delete(companies).where(eq(companies.id, companyId));
  if (accountId) await db.delete(accounts).where(eq(accounts.id, accountId));
});

describe("Trazabilidad de Objetivos de la Política", () => {
  it("presenta cobertura, evidencia FODA/OTG/OTE y KPI por proceso sin inferir pendientes como cero", async () => {
    const caller = policyObjectivesRouter.createCaller(managerContext());
    const result = await caller.getTraceability({ companyId });
    const objective = result.find(
      item => item.objectiveId === policyObjectiveId
    );

    expect(objective?.summary).toMatchObject({
      totalProcesses: 3,
      applicableProcesses: 3,
      coveredProcesses: 2,
      pendingProcesses: 1,
      coveragePercentage: 67,
      processesWithKpi: 2,
      otgProgress: 60,
      oteProgress: 60,
      kpi: 55,
    });
    expect(
      objective?.processes.find(
        process => process.processId === commercialProcessId
      )
    ).toMatchObject({
      status: "covered",
      otgProgress: 60,
      oteProgress: 80,
      kpi: 70,
    });
    expect(
      objective?.processes.find(
        process => process.processId === operationsProcessId
      )
    ).toMatchObject({
      status: "covered",
      otgProgress: null,
      oteProgress: 40,
      kpi: 40,
    });
    expect(
      objective?.processes.find(
        process => process.processId === peopleProcessId
      )
    ).toMatchObject({
      status: "pending",
      kpi: null,
    });
  });

  it("requiere Gerencia y una justificación para confirmar que un objetivo no aplica", async () => {
    const manager = policyObjectivesRouter.createCaller(managerContext());
    await expect(
      manager.setProcessApplicability({
        companyId,
        policyObjectiveId,
        processId: peopleProcessId,
        action: "not_applicable",
        justification:
          "No participa en la entrega ni en la atención directa al cliente.",
      })
    ).resolves.toEqual({ success: true });

    const result = await manager.getTraceability({ companyId });
    const objective = result.find(
      item => item.objectiveId === policyObjectiveId
    );
    expect(objective?.summary).toMatchObject({
      applicableProcesses: 2,
      notApplicableProcesses: 1,
      coveredProcesses: 2,
      coveragePercentage: 100,
    });
    expect(
      objective?.processes.find(
        process => process.processId === peopleProcessId
      )?.notApplicable
    ).toMatchObject({
      justification:
        "No participa en la entrega ni en la atención directa al cliente.",
    });

    const leader = policyObjectivesRouter.createCaller(leaderContext());
    await expect(
      leader.setProcessApplicability({
        companyId,
        policyObjectiveId,
        processId: peopleProcessId,
        action: "reconsider",
      })
    ).rejects.toThrow("Solo Gerencia General o Administración");
  });

  it("rechaza que un FODA vincule el objetivo de otra empresa", async () => {
    const caller = processFODARouter.createCaller(leaderContext());
    await expect(
      caller.upsert({
        processId: commercialProcessId,
        strengths: JSON.stringify([
          { policyObjectiveId: foreignObjectiveId, statement: "Dato inválido" },
        ]),
        opportunities: "[]",
        weaknesses: "[]",
        threats: "[]",
      })
    ).rejects.toThrow("no pertenece a la empresa");
  });
});
