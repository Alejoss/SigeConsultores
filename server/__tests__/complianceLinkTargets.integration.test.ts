import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import {
  accountRoles,
  accounts,
  companies,
  companyCompliances,
  companyManagementAccess,
  linkedCommitments,
  processCharacterizations,
  processes,
  roles,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { linkedCommitmentsRouter } from "../routers/linkedCommitments";
import { processCharacterizationRouter } from "../routers/processCharacterization";
import { processMapRouter } from "../routers/processMap";

// Prefijo exclusivo de esta suite; no reutiliza fixture9991 ni datos existentes.
const prefix = "compliance-link-targets-994704";
const ids = {
  manager: 994704001,
  coordinator: 994704002,
  standardLeader: 994704003,
  foreignManager: 994704004,
  foreignCoordinator: 994704005,
  unrelatedUser: 994704006,
  company: 994704101,
  foreignCompany: 994704102,
  ownProcess: 994704201,
  otherProcess: 994704202,
  strategicProcess: 994704203,
  foreignProcess: 994704204,
  characterization: 994704301,
  compliance: 994704401,
  foreignCompliance: 994704402,
  linkCompliance: 994704403,
  missingCompliance: 994704499,
  coordinatorRole: 994704501,
  standardRole: 994704502,
  foreignRole: 994704503,
  coordinatorAccess: 994704601,
  foreignAccess: 994704602,
  existingLink: 994704701,
};
const created = {
  accounts: [] as number[],
  companies: [] as number[],
  processes: [] as number[],
  characterizations: [] as number[],
  compliances: [] as number[],
  accountRoles: [] as number[],
  access: [] as number[],
  links: [] as number[],
};
let db: NonNullable<Awaited<ReturnType<typeof getDb>>>;

function context(
  overrides: Partial<Record<"user" | "manager" | "processLeader", unknown>>
) {
  return {
    user: null,
    manager: null,
    processLeader: null,
    req: {} as never,
    res: {} as never,
    ...overrides,
  } as never;
}

function leaderContext(accountId = ids.coordinator, foreign = false) {
  return context({
    processLeader: {
      processLeaderId: accountId,
      leaderName: `${prefix} jefe sintético`,
      leaderEmail: `${prefix}-${accountId}@example.test`,
      processId: foreign ? ids.foreignProcess : ids.ownProcess,
      companyId: foreign ? ids.foreignCompany : ids.company,
      companyName: prefix,
    },
  });
}

function managerContext() {
  return context({
    manager: {
      companyId: ids.company,
      companyName: prefix,
      managerEmail: `${prefix}-${ids.manager}@example.test`,
    },
  });
}

function adminContext() {
  return context({ user: { id: ids.unrelatedUser, role: "admin" } });
}

const expectedTargets = [
  { id: ids.ownProcess, name: `${prefix} propio`, processType: "soporte" },
  { id: ids.otherProcess, name: `${prefix} alterno`, processType: "misional" },
  {
    id: ids.strategicProcess,
    name: `${prefix} estratégico`,
    processType: "estrategico",
  },
];
const sourceInput = { companyId: ids.company, sourceId: ids.compliance };

beforeAll(async () => {
  const databaseUrl = process.env.DATABASE_URL;
  if (
    !databaseUrl ||
    !["localhost", "127.0.0.1", "[::1]"].includes(new URL(databaseUrl).hostname)
  ) {
    throw new Error("Esta integración sólo admite una base MySQL local.");
  }
  const connection = await getDb();
  if (!connection)
    throw new Error("Base local no disponible para Cumplimientos.");
  db = connection;

  const [role] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.slug, "process_leader"))
    .limit(1);
  if (!role) throw new Error("Rol process_leader no disponible.");
  const missing = await db
    .select({ id: companyCompliances.id })
    .from(companyCompliances)
    .where(eq(companyCompliances.id, ids.missingCompliance));
  if (missing.length)
    throw new Error("La referencia inválida de prueba está ocupada.");

  const accountIds = [
    ids.manager,
    ids.coordinator,
    ids.standardLeader,
    ids.foreignManager,
    ids.foreignCoordinator,
    ids.unrelatedUser,
  ];
  await db.insert(accounts).values(
    accountIds.map(id => ({
      id,
      openId: `${prefix}-${id}`,
      name: `${prefix} cuenta ${id}`,
      email: `${prefix}-${id}@example.test`,
      status: "active" as const,
    }))
  );
  created.accounts.push(...accountIds);

  await db.insert(companies).values([
    { id: ids.company, name: prefix, ownerAccountId: ids.manager },
    {
      id: ids.foreignCompany,
      name: `${prefix} ajena`,
      ownerAccountId: ids.foreignManager,
    },
  ]);
  created.companies.push(ids.company, ids.foreignCompany);

  await db.insert(processes).values([
    { ...expectedTargets[0], companyId: ids.company, processType: "soporte" },
    { ...expectedTargets[1], companyId: ids.company, processType: "misional" },
    {
      ...expectedTargets[2],
      companyId: ids.company,
      processType: "estrategico",
    },
    {
      id: ids.foreignProcess,
      companyId: ids.foreignCompany,
      name: `${prefix} ajeno`,
      processType: "misional",
    },
  ]);
  created.processes.push(
    ...expectedTargets.map(target => target.id),
    ids.foreignProcess
  );

  await db.insert(processCharacterizations).values({
    id: ids.characterization,
    processId: ids.otherProcess,
    objective: `${prefix} objetivo protegido`,
  });
  created.characterizations.push(ids.characterization);

  await db.insert(accountRoles).values([
    {
      id: ids.coordinatorRole,
      accountId: ids.coordinator,
      roleId: role.id,
      companyId: ids.company,
      processId: ids.ownProcess,
    },
    {
      id: ids.standardRole,
      accountId: ids.standardLeader,
      roleId: role.id,
      companyId: ids.company,
      processId: ids.ownProcess,
    },
    {
      id: ids.foreignRole,
      accountId: ids.foreignCoordinator,
      roleId: role.id,
      companyId: ids.foreignCompany,
      processId: ids.foreignProcess,
    },
  ]);
  created.accountRoles.push(
    ids.coordinatorRole,
    ids.standardRole,
    ids.foreignRole
  );

  await db.insert(companyManagementAccess).values([
    {
      id: ids.coordinatorAccess,
      companyId: ids.company,
      accountId: ids.coordinator,
      accessLevel: "coordinator",
      grantedByAccountId: ids.manager,
    },
    {
      id: ids.foreignAccess,
      companyId: ids.foreignCompany,
      accountId: ids.foreignCoordinator,
      accessLevel: "coordinator",
      grantedByAccountId: ids.foreignManager,
    },
  ]);
  created.access.push(ids.coordinatorAccess, ids.foreignAccess);

  await db.insert(companyCompliances).values([
    {
      id: ids.compliance,
      companyId: ids.company,
      requirement: `${prefix} cumplimiento existente`,
      obligationType: "Legal",
      evaluationMode: "vigencia",
      completed: "SI",
      validFrom: new Date("2026-01-01T00:00:00.000Z"),
      validUntil: new Date("2026-12-31T00:00:00.000Z"),
    },
    {
      id: ids.foreignCompliance,
      companyId: ids.foreignCompany,
      requirement: `${prefix} cumplimiento ajeno`,
      obligationType: "Legal",
    },
    {
      id: ids.linkCompliance,
      companyId: ids.company,
      requirement: `${prefix} cumplimiento para vincular`,
      obligationType: "Legal",
      evaluationMode: "vigencia",
      completed: "NO",
      validFrom: new Date("2026-01-01T00:00:00.000Z"),
      validUntil: new Date("2026-12-31T00:00:00.000Z"),
    },
  ]);
  created.compliances.push(
    ids.compliance,
    ids.foreignCompliance,
    ids.linkCompliance
  );

  // Progreso corporativo preexistente en un proceso distinto del Coordinador.
  await db.insert(linkedCommitments).values({
    id: ids.existingLink,
    companyId: ids.company,
    processId: ids.otherProcess,
    sourceType: "company_compliance",
    sourceId: ids.compliance,
    sourceSubId: ids.compliance,
    kind: "vigency",
    title: `${prefix} cumplimiento existente`,
    status: "completed",
    renewedValidFrom: new Date("2026-01-01T00:00:00.000Z"),
    renewedValidUntil: new Date("2026-12-31T00:00:00.000Z"),
  });
  created.links.push(ids.existingLink);
});

afterAll(async () => {
  if (!db) return;
  // createLinks no devuelve IDs: recuperarlos sólo dentro de las referencias
  // sintéticas creadas por esta suite, y eliminar cada fila por su ID exacto.
  if (created.compliances.length && created.processes.length) {
    const links = await db
      .select({ id: linkedCommitments.id })
      .from(linkedCommitments)
      .where(
        and(
          inArray(linkedCommitments.companyId, created.companies),
          eq(linkedCommitments.sourceType, "company_compliance"),
          inArray(linkedCommitments.sourceId, created.compliances),
          inArray(linkedCommitments.processId, created.processes)
        )
      );
    created.links.push(...links.map(link => link.id));
  }
  if (created.links.length)
    await db
      .delete(linkedCommitments)
      .where(inArray(linkedCommitments.id, created.links));
  if (created.compliances.length)
    await db
      .delete(companyCompliances)
      .where(inArray(companyCompliances.id, created.compliances));
  if (created.characterizations.length)
    await db
      .delete(processCharacterizations)
      .where(inArray(processCharacterizations.id, created.characterizations));
  if (created.access.length)
    await db
      .delete(companyManagementAccess)
      .where(inArray(companyManagementAccess.id, created.access));
  if (created.accountRoles.length)
    await db
      .delete(accountRoles)
      .where(inArray(accountRoles.id, created.accountRoles));
  if (created.processes.length)
    await db.delete(processes).where(inArray(processes.id, created.processes));
  if (created.companies.length)
    await db.delete(companies).where(inArray(companies.id, created.companies));
  if (created.accounts.length)
    await db.delete(accounts).where(inArray(accounts.id, created.accounts));
});

describe("Selector de vinculación de Cumplimientos: integración local", () => {
  it("ofrece al Coordinador todos los procesos de su empresa y sólo los campos del selector", async () => {
    const targets = await linkedCommitmentsRouter
      .createCaller(leaderContext())
      .listAssignableComplianceProcesses(sourceInput);
    expect([...targets].sort((a, b) => a.id - b.id)).toEqual(expectedTargets);
  });

  it.each([
    ["Gerente", managerContext],
    ["Administrador", adminContext],
  ] as const)(
    "conserva todos los destinos para %s",
    async (_role, makeContext) => {
      const targets = await linkedCommitmentsRouter
        .createCaller(makeContext())
        .listAssignableComplianceProcesses(sourceInput);
      expect([...targets].sort((a, b) => a.id - b.id)).toEqual(expectedTargets);
    }
  );

  it.each([
    ["Jefe sin coordinación", () => leaderContext(ids.standardLeader)],
    [
      "Coordinador de otra empresa",
      () => leaderContext(ids.foreignCoordinator, true),
    ],
    [
      "usuario de plataforma ajeno",
      () => context({ user: { id: ids.unrelatedUser, role: "user" } }),
    ],
  ] as const)(
    "deniega destinos y vínculos a %s",
    async (_role, makeContext) => {
      const caller = linkedCommitmentsRouter.createCaller(makeContext());
      await expect(
        caller.listAssignableComplianceProcesses(sourceInput)
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        caller.createLinks({
          companyId: ids.company,
          sourceType: "company_compliance",
          sourceId: ids.linkCompliance,
          processIds: [ids.otherProcess],
        })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      const links = await db
        .select({ id: linkedCommitments.id })
        .from(linkedCommitments)
        .where(eq(linkedCommitments.sourceId, ids.linkCompliance));
      expect(links).toEqual([]);
    }
  );

  it("rechaza una fuente inválida, inexistente o perteneciente a otra empresa", async () => {
    const caller = linkedCommitmentsRouter.createCaller(leaderContext());
    await expect(
      caller.listAssignableComplianceProcesses({ ...sourceInput, sourceId: 0 })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    for (const sourceId of [ids.missingCompliance, ids.foreignCompliance]) {
      await expect(
        caller.listAssignableComplianceProcesses({ ...sourceInput, sourceId })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(
        caller.createLinks({
          companyId: ids.company,
          sourceType: "company_compliance",
          sourceId,
          processIds: [ids.otherProcess],
        })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    }
  });

  it("vincula a otro proceso de su empresa sin duplicarlo al repetir", async () => {
    const caller = linkedCommitmentsRouter.createCaller(leaderContext());
    const input = {
      companyId: ids.company,
      sourceType: "company_compliance" as const,
      sourceId: ids.linkCompliance,
      processIds: [ids.otherProcess],
    };
    await expect(caller.createLinks(input)).resolves.toMatchObject({
      created: 1,
      alreadyLinked: 0,
    });
    await expect(caller.createLinks(input)).resolves.toMatchObject({
      created: 0,
      alreadyLinked: 1,
    });
    const links = await db
      .select({ processId: linkedCommitments.processId })
      .from(linkedCommitments)
      .where(
        and(
          eq(linkedCommitments.companyId, ids.company),
          eq(linkedCommitments.sourceType, "company_compliance"),
          eq(linkedCommitments.sourceId, ids.linkCompliance)
        )
      );
    expect(links).toEqual([{ processId: ids.otherProcess }]);
  });

  it("rechaza destinos de otra empresa sin crear vínculos parciales", async () => {
    const caller = linkedCommitmentsRouter.createCaller(leaderContext());
    await expect(
      caller.createLinks({
        companyId: ids.company,
        sourceType: "company_compliance",
        sourceId: ids.linkCompliance,
        processIds: [ids.strategicProcess, ids.foreignProcess],
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const links = await db
      .select({ id: linkedCommitments.id })
      .from(linkedCommitments)
      .where(
        and(
          eq(linkedCommitments.sourceId, ids.linkCompliance),
          inArray(linkedCommitments.processId, [
            ids.strategicProcess,
            ids.foreignProcess,
          ])
        )
      );
    expect(links).toEqual([]);
  });

  it("mantiene el mapa limitado al propio y deniega consulta y caracterización ajenas aun con coordinación", async () => {
    const processMap = processMapRouter.createCaller(leaderContext());
    await expect(
      processMap.list({
        companyId: ids.company,
        filterProcessId: ids.otherProcess,
      })
    ).resolves.toEqual([expect.objectContaining({ id: ids.ownProcess })]);
    await expect(
      processMap.get({ processId: ids.otherProcess })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      processCharacterizationRouter.createCaller(leaderContext()).update({
        processId: ids.otherProcess,
        objective: `${prefix} cambio no autorizado`,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const [characterization] = await db
      .select({ objective: processCharacterizations.objective })
      .from(processCharacterizations)
      .where(eq(processCharacterizations.id, ids.characterization));
    expect(characterization.objective).toBe(`${prefix} objetivo protegido`);
  });

  it("conserva la consulta existente de progreso corporativo sobre otro proceso", async () => {
    await expect(
      linkedCommitmentsRouter.createCaller(leaderContext()).listSourceProgress({
        ...sourceInput,
        sourceType: "company_compliance",
      })
    ).resolves.toMatchObject({
      sourceType: "company_compliance",
      sourceId: ids.compliance,
      total: 1,
      fulfilled: 1,
      processIds: [ids.otherProcess],
    });
  });
});
