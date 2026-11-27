import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/mysql-core";
import * as schema from "../../drizzle/schema";
import { getDatabasePool, getDb } from "../db";
import { appRouter } from "../routers";
import type { TrpcContext } from "../_core/context";
import { assertAnnualIntegrationDatabase } from "./helpers/annualTestSafety";
import { closeAnnualWorkspace, createAnnualWorkspace, getWorkspaceForScope, PRESERVE_STRATEGY } from "../annual/store";
import { quoteIdentifier } from "../annual/manifest";
import { listAnnualHistory, resolveAnnualHistory } from "../annual/history";

// Refuse before connecting. No review/production fallback or availability skip.
assertAnnualIntegrationDatabase();
const C = 998740001, OTHER = 998740002;
const OWN = 998740011, READ = 998740012, NONE = 998740013, WRITE = 998740014, FOREIGN = 998740015;
const M = 998740021, A = 998740022, B = 998740023, F = 998740024;
const R = 998740201;
const managerEmail = "granular-manager-998740@example.invalid";
let db: NonNullable<Awaited<ReturnType<typeof getDb>>>;
let base: Awaited<ReturnType<typeof getWorkspaceForScope>>;
let target: Awaited<ReturnType<typeof getWorkspaceForScope>>;
const owned = new Map<any, number[]>();
let claimedCompany = false;
const pool = () => getDatabasePool();
const q = async (sql: string, args: any[] = []) => { const [rows] = await pool().query(sql, args); return rows as any[]; };

function context(account: number | "manager", year = 2026): TrpcContext {
  const companyId = account === F ? OTHER : C;
  return {
    req: { headers: { "x-isge-company-id": String(companyId), "x-isge-year": String(year) } } as never,
    res: {} as never, user: null,
    manager: account === "manager" ? { companyId: C, companyName: "Granular fixture", managerEmail } : null,
    processLeader: account === "manager" ? null : {
      processLeaderId: account, processId: account === F ? FOREIGN : OWN,
      companyId, companyName: "Granular fixture", leaderName: `Synthetic ${account}`,
      leaderEmail: `granular-${account}@example.invalid`,
    },
  };
}
const caller = (account: number | "manager" = A, year = 2026) => appRouter.createCaller(context(account, year));
async function seed(table: any, values: any[]) {
  await db.insert(table).values(values);
  owned.set(table, [...(owned.get(table) ?? []), ...values.map(row => row.id)]);
}
async function grant(accountId: number, moduleChanges: Array<{ module: "strategy" | "management_systems" | "change_management" | "company_foda" | "organization_personnel"; accessLevel: "none" | "read" | "write" }> = [], processAccess?: Array<{ processId: number; accessLevel?: "read" | "write" }>, year = 2026) {
  return caller("manager", year).teamAccess.setDetailedAccess({ companyId: C, accountId, moduleChanges, ...(processAccess === undefined ? {} : { processAccess }) });
}
const forbidden = async (promise: Promise<unknown>) => expect(promise).rejects.toMatchObject({ code: "FORBIDDEN" });
const fixtureTables = [schema.accounts, schema.companies, schema.accountRoles, schema.processes, schema.companyInfo, schema.companyValues, schema.policies, schema.companyCompliances, schema.managementPrograms, schema.programActions, schema.linkedCommitments, schema.linkedCommitmentEvidence, schema.meetingTypes, schema.processMeetings, schema.meetingFiles, schema.processTrainings, schema.processScheduleActivities, schema.processIndicators, schema.stakeholderCriticalities, schema.processCharacterizations, schema.processRiskMatrices, schema.procedures, schema.procedureRecords, schema.processOutputReleaseControls, schema.processOutputReleasePeriods, schema.processOutputReleaseEvidence];

// Preflight every ID we actually claim. Other suites can leave unrelated
// auto-increment IDs inside this numeric interval; those are not ours to delete.
const fixtureIds = new Map<any, number[]>(fixtureTables.map(table => [table, [R]]));
fixtureIds.set(schema.accounts, [M, A, B, F]);
fixtureIds.set(schema.companies, [C, OTHER]);
fixtureIds.set(schema.processes, [OWN, READ, NONE, WRITE, FOREIGN]);
fixtureIds.set(schema.accountRoles, [R, R + 1, R + 2, R + 3]);
for (const table of [schema.companyCompliances, schema.programActions]) fixtureIds.set(table, [R, R + 1]);
for (const table of [schema.processCharacterizations, schema.processTrainings, schema.processScheduleActivities, schema.processIndicators, schema.stakeholderCriticalities, schema.processRiskMatrices]) fixtureIds.set(table, [R, R + 1, R + 2, R + 3]);
fixtureIds.set(schema.linkedCommitments, [R, R + 1, R + 2, R + 3, R + 10, R + 11]);

beforeAll(async () => {
  assertAnnualIntegrationDatabase();
  db = (await getDb())!;
  if (!db) throw new Error("Dedicated MySQL TEST database required");
  // Refuse collisions instead of cleaning/overwriting a previous run's rows.
  for (const table of fixtureTables) {
    const name = getTableConfig(table).name;
    const ids = fixtureIds.get(table)!;
    if ((await q(`SELECT id FROM ${quoteIdentifier(name)} WHERE id IN (${ids.map(() => "?").join(",")})`, ids)).length) throw new Error(`Fixture ownership collision in ${name}`);
  }
  if ((await q("SELECT id FROM annualWorkspaces WHERE companyId IN (?,?)", [C, OTHER])).length) throw new Error("Fixture company workspace collision");
  for (const table of [schema.companyTeamModuleAccess, schema.companyTeamProcessAccess, schema.companyTeamAccessAudit]) {
    // Bootstrap belongs to parent: a missing additive ACL table is a hard fail.
    if ((await q(`SELECT id FROM ${quoteIdentifier(getTableConfig(table).name)} WHERE companyId IN (?,?)`, [C, OTHER])).length) throw new Error("Fixture grant collision");
  }
  const roleRows = await db.select().from(schema.roles).where(inArray(schema.roles.slug, ["company_manager", "process_leader"]));
  const managerRole = roleRows.find(row => row.slug === "company_manager")?.id;
  const leaderRole = roleRows.find(row => row.slug === "process_leader")?.id;
  if (!managerRole || !leaderRole) throw new Error("Bootstrap canonical TEST roles before running granular suite");
  await seed(schema.accounts, [M, A, B, F].map(id => ({ id, openId: `granular-fixture-${id}`, name: `Synthetic ${id}`, email: id === M ? managerEmail : `granular-${id}@example.invalid`, status: "active" })));
  await seed(schema.companies, [{ id: C, name: "Granular fixture company", ownerAccountId: M, status: "Activa" }, { id: OTHER, name: "Granular foreign fixture", ownerAccountId: M, status: "Activa" }]);
  claimedCompany = true;
  await seed(schema.processes, [OWN, READ, NONE, WRITE, FOREIGN].map(id => ({ id, companyId: id === FOREIGN ? OTHER : C, name: `Synthetic process ${id}`, description: `PRIVATE CONTENT ${id}`, processType: "soporte" })));
  await seed(schema.accountRoles, [
    { id: R, accountId: M, companyId: C, processId: 0, roleId: managerRole, status: "active" },
    { id: R + 1, accountId: A, companyId: C, processId: OWN, roleId: leaderRole, status: "active" },
    { id: R + 2, accountId: B, companyId: C, processId: OWN, roleId: leaderRole, status: "active" },
    { id: R + 3, accountId: F, companyId: OTHER, processId: FOREIGN, roleId: leaderRole, status: "active" },
  ]);
  await seed(schema.companyInfo, [{ id: R, companyId: C, proposito: "Strategy purpose", mision: "Strategy mission", vision: "Strategy vision" }]);
  await seed(schema.companyValues, [{ id: R, companyId: OTHER, value: "FOREIGN VALUE", orderIndex: 0 }]);
  await seed(schema.policies, [{ id: R, companyId: C, versionNo: "fixture", policyText: "Strategy policy" }]);
  await seed(schema.companyCompliances, [{ id: R, companyId: C, requirement: "PRIVATE SG REQUIREMENT", obligationType: "Legal" }, { id: R + 1, companyId: OTHER, requirement: "FOREIGN SG REQUIREMENT", obligationType: "Legal" }]);
  await seed(schema.managementPrograms, [{ id: R, companyId: C, programName: "PRIVATE SG PROGRAM", managementSystem: "Synthetic" }]);
  await seed(schema.programActions, [{ id: R, companyId: C, programId: R, action: "Assigned SG action" }, { id: R + 1, companyId: C, programId: R, action: "PRIVATE UNASSIGNED SG ACTION" }]);
  await seed(schema.linkedCommitments, [OWN, READ, NONE, WRITE].map((processId, i) => ({ id: R + i, companyId: C, processId, sourceType: "own", kind: "own", title: `Assigned duty ${processId}` })).concat([
    { id: R + 10, companyId: C, processId: OWN, sourceType: "program_action", sourceId: R, sourceSubId: R, kind: "action", title: "Own assigned corporate responsibility" } as any,
    { id: R + 11, companyId: C, processId: READ, sourceType: "program_action", sourceId: R, sourceSubId: R, kind: "action", title: "Read-process assigned responsibility" } as any,
  ]));
  await seed(schema.linkedCommitmentEvidence, [{ id: R, linkedCommitmentId: R + 1, companyId: C, fileName: "dummy.pdf", fileKey: "uploads/granular-fixture/dummy.pdf", fileUrl: "/synthetic-not-used", mimeType: "application/pdf" }]);
  const processRows = [OWN, READ, NONE, FOREIGN];
  await seed(schema.processCharacterizations, processRows.map((processId, i) => ({ id: R + i, processId, responsible: "Fixture", objective: `PRIVATE characterization ${processId}` })));
  for (const table of [schema.processTrainings, schema.processScheduleActivities, schema.processIndicators, schema.stakeholderCriticalities]) await seed(table, processRows.map((processId, i) => ({ id: R + i, processId, name: `PRIVATE process row ${processId}` })));
  await seed(schema.processRiskMatrices, processRows.map((processId, i) => ({ id: R + i, processId, description: `PRIVATE risk ${processId}` })));
  await seed(schema.meetingTypes, [{ id: R, companyId: C, processId: READ, name: "Private delegated meeting type" }]);
  await seed(schema.processMeetings, [{ id: R, companyId: C, processId: READ, meetingTypeId: R, meetingDate: new Date("2026-11-01T00:00:00Z"), objective: "PRIVATE delegated meeting" }]);
  await seed(schema.meetingFiles, [{ id: R, companyId: C, meetingId: R, fileName: "dummy.pdf", fileKey: "uploads/granular-fixture/meeting.pdf", fileUrl: "/synthetic-not-used", mimeType: "application/pdf" }]);
  await seed(schema.procedures, [{ id: R, processId: READ, name: "Private read-only procedure", code: "P-FIX", version: "1" }]);
  await seed(schema.procedureRecords, [{ id: R, procedureId: R, name: "Private procedure evidence", code: "R-FIX", version: "1" }]);
  await seed(schema.processOutputReleaseControls, [{ id: R, processId: READ, sourceOutputKey: "fixture-output", outputSnapshot: "Private read-only output" }]);
  await seed(schema.processOutputReleasePeriods, [{ id: R, processId: READ, controlId: R, periodKey: "fixture-2026-11-01", scheduledDate: new Date("2026-11-01T00:00:00Z") }]);
  await seed(schema.processOutputReleaseEvidence, [{ id: R, periodId: R, companyId: C, fileName: "dummy.pdf", fileKey: "uploads/granular-fixture/release.pdf", fileUrl: "/synthetic-not-used", mimeType: "application/pdf" }]);
  base = await getWorkspaceForScope(C, 2026);
}, 60_000);

afterAll(async () => {
  if (!db || !owned.size) return;
  if (claimedCompany) {
  // Canonical fixture company was absent before seeding; generated rows belong
  // exclusively to this suite. Never delete broad ID intervals or drop namespaces.
  const ws = await q("SELECT id FROM annualWorkspaces WHERE companyId=?", [C]);
  for (const table of ["annualHistoricalResolutions", "annualFileRetentions", "annualEntityLineage", "annualProcessStates"]) {
    if (ws.length) await q(`DELETE FROM ${quoteIdentifier(table)} WHERE ${table === "annualHistoricalResolutions" ? "targetWorkspaceId" : "workspaceId"} IN (${ws.map(() => "?").join(",")})`, ws.map(row => row.id));
  }
  if (ws.length) await q("DELETE FROM annualWorkspaces WHERE companyId=?", [C]);
  for (const table of [schema.companyTeamAccessAudit, schema.companyTeamProcessAccess, schema.companyTeamModuleAccess, schema.companyOnlineCourseAccessAudit, schema.companyOnlineCourseAccess, schema.accessAuditLog, schema.companyManagementAccess]) await db.delete(table).where(eq(table.companyId, C));
  // Delete rows generated by tested APIs only in the owned company's processes.
  await db.delete(schema.linkedCommitmentEvidence).where(eq(schema.linkedCommitmentEvidence.companyId, C));
  await db.delete(schema.linkedCommitments).where(eq(schema.linkedCommitments.companyId, C));
  }
  for (const table of [...fixtureTables].reverse()) {
    const ids = owned.get(table);
    if (ids?.length) await db.delete(table).where(inArray(table.id, ids));
  }
}, 60_000);

describe("granular team access — real MySQL TEST only", () => {
  it("isolates grants per person even for two chiefs assigned to the same process", async () => {
    await grant(A, [{ module: "strategy", accessLevel: "write" }], [{ processId: READ }]);
    const a = await caller(A).teamAccess.getMyDetailedAccess({ companyId: C });
    const b = await caller(B).teamAccess.getMyDetailedAccess({ companyId: C });
    expect(a).toMatchObject({ ownProcessId: OWN, moduleAccess: { strategy: "write" }, processAccess: [{ processId: READ, accessLevel: "read" }] });
    expect(b).toMatchObject({ ownProcessId: OWN, moduleAccess: { strategy: "read" }, processAccess: [] });
    const leaders = await caller("manager").teamAccess.listProcessLeaders({ companyId: C });
    expect(leaders.filter(row => row.processId === OWN).map(row => row.accountId).sort()).toEqual([A, B]);
    await forbidden(caller(B).processCharacterization.getByProcessId({ processId: READ }));
  });

  it("rejects foreign company accounts and process grants atomically", async () => {
    const before = await caller().teamAccess.getMyDetailedAccess({ companyId: C });
    await forbidden(grant(A, [{ module: "strategy", accessLevel: "none" }], [{ processId: FOREIGN, accessLevel: "write" }]));
    await expect(grant(F, [], [{ processId: READ }])).rejects.toBeDefined();
    await forbidden(caller().teamAccess.getMyDetailedAccess({ companyId: OTHER }));
    await forbidden(caller("manager").teamAccess.setDetailedAccess({ companyId: OTHER, accountId: F, moduleChanges: [] }));
    expect(await caller().teamAccess.getMyDetailedAccess({ companyId: C })).toEqual(before);
    await forbidden(caller().processMap.get({ processId: FOREIGN }));
    await forbidden(caller().processIndicators.list({ processId: FOREIGN }));
  });

  it("strategy write does not grant SG edits, personnel changes, invitations or account management", async () => {
    await expect(caller().companyInfo.upsert({ companyId: C, proposito: "Allowed strategy update" })).resolves.toBeDefined();
    await forbidden(caller().managementPrograms.create({ companyId: C, programName: "Rejected SG", managementSystem: "Synthetic" }));
    await forbidden(caller().teamAccess.setDetailedAccess({ companyId: C, accountId: B, moduleChanges: [{ module: "strategy", accessLevel: "write" }] }));
    await forbidden(caller().teamAccess.suspendProcessLeader({ companyId: C, processId: OWN, accountId: B }));
    await forbidden(caller().processMap.rename({ companyId: C, processId: OWN, name: "Rejected structural rename", processType: "soporte" }));
  });

  it("lists own plus explicit selected processes; selectors do not expose unauthorized contents", async () => {
    expect((await caller().processMap.list({ companyId: C, filterProcessId: NONE })).map(row => row.id).sort()).toEqual([OWN, READ]);
    await expect(caller().processMap.get({ processId: READ })).resolves.toMatchObject({ id: READ });
    await expect(caller().processCharacterization.getByProcessId({ processId: READ })).resolves.toBeDefined();
    await expect(caller().linkedCommitments.listByProcess({ companyId: C, processId: READ })).resolves.toHaveLength(2);
    await expect(caller().meetings.list({ companyId: C, processId: READ })).resolves.toHaveLength(1);
    await forbidden(caller().processMap.get({ processId: NONE }));
    await expect(caller().processes.get({ processId: READ })).resolves.toMatchObject({ id: READ });
    await forbidden(caller().processes.get({ processId: NONE }));
    expect((await caller().processes.list({ companyId: C })).map(row => row.id).sort()).toEqual([OWN, READ]);
    await forbidden(caller().processes.update({ processId: READ, name: "Rejected inline edit", processType: "soporte" }));
    await forbidden(caller().processes.update({ processId: NONE, name: "Rejected nonselected edit", processType: "soporte" }));
    await forbidden(caller().processCharacterization.getByProcessId({ processId: NONE }));
    await forbidden(caller().linkedCommitments.listByProcess({ companyId: C, processId: NONE }));
    await forbidden(caller().meetings.list({ companyId: C, processId: NONE }));
    for (const name of ["processTrainings", "processSchedule", "processIndicators", "stakeholderCriticality"] as const) {
      await expect(caller()[name].list({ processId: READ })).resolves.toHaveLength(1);
      await forbidden(caller()[name].list({ processId: NONE }));
    }
  });

  it("read grants cannot mutate process records by ID-only URLs, evidence, delete or autosave", async () => {
    const rowBefore = await q("SELECT * FROM processIndicators WHERE id=?", [R + 1]);
    const attempts = [
      () => caller().processTrainings.update({ trainingId: R + 1, name: "Rejected" }), () => caller().processTrainings.delete({ trainingId: R + 1 }),
      () => caller().processSchedule.update({ activityId: R + 1, name: "Rejected" }), () => caller().processSchedule.delete({ activityId: R + 1 }),
      () => caller().processIndicators.update({ indicatorId: R + 1, name: "Rejected" }), () => caller().processIndicators.delete({ indicatorId: R + 1 }),
      () => caller().stakeholderCriticality.update({ criticalityId: R + 1, name: "Rejected" }), () => caller().stakeholderCriticality.delete({ criticalityId: R + 1 }),
      () => caller().processCharacterization.update({ processId: READ, objective: "Rejected autosave" }),
      () => caller().processRiskMatrix.update({ riskId: R + 1, description: "Rejected" }),
      () => caller().linkedCommitments.createOwn({ companyId: C, processId: READ, title: "Rejected" }),
      () => caller().linkedCommitments.updateProgress({ companyId: C, id: R + 1, status: "completed" }),
      () => caller().linkedCommitments.delete({ companyId: C, id: R + 1 }),
      () => caller().linkedCommitments.deleteEvidence({ companyId: C, id: R }),
      () => caller().meetings.updateMeeting({ companyId: C, id: R, objective: "Rejected" }),
      () => caller().meetings.deleteMeetingFile({ companyId: C, id: R }),
      () => caller().processOutputRelease.archive({ id: R }),
      () => caller().processOutputRelease.updatePeriod({ periodId: R, status: "released" }),
      () => caller().processOutputRelease.deleteEvidence({ id: R }),
      () => caller().procedures.delete({ id: R }),
      () => caller().procedures.deleteRecord({ id: R }),
    ];
    for (const [index, attempt] of attempts.entries()) await expect(attempt(), `ID-only denied-write case ${index}`).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await q("SELECT * FROM processIndicators WHERE id=?", [R + 1])).toEqual(rowBefore);
    await forbidden(caller().processCharacterizationCopy.execute({ companyId: C, sourceProcessId: OWN, targetProcessIds: [READ], modules: ["participants"] }));
  });

  it("SG denial blocks corporate APIs/direct URLs, but preserves strategy, own responsibilities and independent online-course rights", async () => {
    await grant(A, [{ module: "management_systems", accessLevel: "none" }, { module: "change_management", accessLevel: "none" }, { module: "company_foda", accessLevel: "none" }, { module: "organization_personnel", accessLevel: "none" }]);
    await forbidden(caller().managementPrograms.list({ companyId: C }));
    await forbidden(caller().managementPrograms.listActions({ companyId: C, programId: R }));
    await forbidden(caller().companyCompliances.list({ companyId: C }));
    await forbidden(caller().companyCompliancesLegacy.list({ companyId: C }));
    await forbidden(caller().companyTrainings.list({ companyId: C }));
    await forbidden(caller().payroll.list({ companyId: C }));
    await expect(caller().companyInfo.get({ companyId: C })).resolves.toMatchObject({ proposito: "Allowed strategy update" });
    await expect(caller().linkedCommitments.listByProcess({ companyId: C, processId: OWN })).resolves.toContainEqual(expect.objectContaining({ title: "Own assigned corporate responsibility" }));
    await expect(caller().linkedCommitments.updateProgress({ companyId: C, id: R, notes: "Own progress remains editable" })).resolves.toMatchObject({ success: true });
    await expect(caller().teamAccess.getMyOnlineCourseManagementAccess({ companyId: C })).resolves.toMatchObject({ accessLevel: "standard" });
    await expect(caller("manager").teamAccess.setOnlineCourseManagementAccess({ companyId: C, accountId: A, accessLevel: "online_course_manager" })).resolves.toMatchObject({ success: true });
    await expect(caller().teamAccess.getMyOnlineCourseManagementAccess({ companyId: C })).resolves.toMatchObject({ accessLevel: "online_course_manager" });
  });

  it("corporate linking can select all same-company targets without opening their process contents", async () => {
    await grant(A, [{ module: "management_systems", accessLevel: "write" }]);
    const targets = await caller().linkedCommitments.listAssignableComplianceProcesses({ companyId: C, sourceId: R });
    expect(targets.map(row => row.id).sort()).toEqual([OWN, READ, NONE, WRITE]);
    expect(targets.every(row => !("description" in row))).toBe(true);
    await expect(caller().linkedCommitments.createLinks({ companyId: C, sourceType: "company_compliance", sourceId: R, processIds: [NONE] })).resolves.toMatchObject({ created: 1 });
    await forbidden(caller().processMap.get({ processId: NONE }));
    await forbidden(caller().linkedCommitments.listByProcess({ companyId: C, processId: NONE }));
    await forbidden(caller().linkedCommitments.createLinks({ companyId: C, sourceType: "company_compliance", sourceId: R, processIds: [FOREIGN] }));
    await forbidden(caller().companyCompliancesLegacy.update({ id: R + 1, requirement: "Rejected foreign edit" }));
    await forbidden(caller().companyCompliancesLegacy.delete({ id: R + 1 }));
    await forbidden(caller().companyValues.delete({ valueId: R }));
    expect((await q("SELECT value FROM companyValues WHERE id=?", [R]))[0].value).toBe("FOREIGN VALUE");
    expect((await q("SELECT requirement FROM companyCompliances WHERE id=?", [R + 1]))[0].requirement).toBe("FOREIGN SG REQUIREMENT");
    await grant(A, [{ module: "management_systems", accessLevel: "none" }]);
  });

  it("partial replacement defaults extras to read, never revokes own write, and omitted extras preserve grants", async () => {
    await grant(A, [], [{ processId: OWN, accessLevel: "read" }, { processId: READ }, { processId: WRITE, accessLevel: "write" }]);
    await grant(A, [{ module: "strategy", accessLevel: "read" }]);
    expect((await caller().teamAccess.getMyDetailedAccess({ companyId: C })).processAccess).toEqual([{ processId: READ, accessLevel: "read" }, { processId: WRITE, accessLevel: "write" }]);
    await expect(caller().linkedCommitments.updateProgress({ companyId: C, id: R + 3, notes: "Explicit delegated write" })).resolves.toMatchObject({ success: true });
    await expect(caller().processIndicators.update({ indicatorId: R, name: "Own process remains writable" })).resolves.toMatchObject({ success: true });
    await forbidden(caller().processIndicators.update({ indicatorId: R + 1, name: "Read remains read" }));
    await grant(A, [{ module: "strategy", accessLevel: "write" }]);
  });

  it("canonical grants apply across years; denied raw history is filtered and read-process history cannot resolve", async () => {
    await grant(A, [{ module: "management_systems", accessLevel: "none" }]);
    target = await createAnnualWorkspace({ companyId: C, year: 2027, sourceYear: 2026, strategy: { ...PRESERVE_STRATEGY }, actor: { role: "manager", companyId: C, accountId: M } });
    const a2026 = await caller().teamAccess.getMyDetailedAccess({ companyId: C });
    expect(await caller(A, 2027).teamAccess.getMyDetailedAccess({ companyId: C })).toEqual(a2026);
    expect((await caller(A, 2027).processMap.list({ companyId: C })).map(row => row.id).sort()).toEqual([OWN, READ, WRITE]);
    const history = await listAnnualHistory({ companyId: C, year: 2027 }, context(A, 2027));
    expect(history.items.some(item => item.processId === OWN)).toBe(true);
    expect(history.items.some(item => item.processId === READ)).toBe(true);
    expect(history.items.every(item => item.processId !== null)).toBe(true);
    const readItem = history.items.find(item => item.processId === READ)!;
    await forbidden(resolveAnnualHistory({ companyId: C, year: 2027, id: readItem.id, status: "completed", notes: "Rejected read-only history" }, context(A, 2027)));
    const historical = await caller(A, 2027).annualWorkspaces.historicalPendings({ companyId: C, year: 2027 });
    expect(historical.programActions ?? []).toEqual([]);
    expect(historical.inspectionFindings ?? []).toEqual([]);
    expect(historical.items.every((item: any) => [OWN, READ, WRITE].includes(item.processId))).toBe(true);
    await forbidden(caller(A, 2027).managementPrograms.list({ companyId: C }));
    await grant(A, [{ module: "strategy", accessLevel: "read" }], [{ processId: READ }], 2027);
    expect((await caller(A, 2026).teamAccess.getMyDetailedAccess({ companyId: C })).moduleAccess.strategy).toBe("read");
    await grant(A, [{ module: "strategy", accessLevel: "write" }]);
  });

  it("a closed year stays read-only even with process/module write; canonical grants remain manageable across years", async () => {
    await closeAnnualWorkspace({ companyId: C, year: 2026, actor: { role: "manager", companyId: C, accountId: M } });
    await expect(caller().processIndicators.list({ processId: OWN })).resolves.toHaveLength(1);
    await forbidden(caller().processIndicators.update({ indicatorId: R, name: "Rejected closed year" }));
    await forbidden(caller("manager").companyCompliancesLegacy.update({ id: R, requirement: "Rejected closed year" }));
    await forbidden(caller().companyInfo.upsert({ companyId: C, proposito: "Rejected closed strategy" }));
    await expect(grant(A, [{ module: "strategy", accessLevel: "read" }], undefined, 2026)).resolves.toMatchObject({ success: true });
    expect((await caller(A, 2027).teamAccess.getMyDetailedAccess({ companyId: C })).moduleAccess.strategy).toBe("read");
    expect((await q("SELECT proposito FROM companyInfo WHERE companyId=?", [C]))[0].proposito).toBe("Allowed strategy update");
  });

  it("suspending one selected account does not suspend the other chief on the same process", async () => {
    await caller("manager", 2027).teamAccess.suspendProcessLeader({ companyId: C, processId: OWN, accountId: A });
    const assignments = await db.select().from(schema.accountRoles).where(and(eq(schema.accountRoles.companyId, C), eq(schema.accountRoles.processId, OWN)));
    expect(assignments.find(row => row.accountId === A)?.status).toBe("suspended");
    expect(assignments.find(row => row.accountId === B)?.status).toBe("active");
    await forbidden(caller(A, 2027).processMap.list({ companyId: C }));
    await expect(caller(B, 2027).processMap.list({ companyId: C })).resolves.toHaveLength(1);
    await caller("manager", 2027).teamAccess.reactivateProcessLeader({ companyId: C, processId: OWN, accountId: A });
    await expect(caller(A, 2027).processMap.list({ companyId: C })).resolves.toHaveLength(2);
  });
});
