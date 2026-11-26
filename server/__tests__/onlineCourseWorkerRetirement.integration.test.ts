import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { and, asc, eq, inArray } from "drizzle-orm";
import { COOKIE_NAME } from "@shared/const";
import { getDb } from "../db";
import { createAuthSession } from "../authSessionRepository";
import { onlineCoursesRouter } from "../routers/onlineCourses";
import {
  accountRoles,
  accounts,
  authSessions,
  companies,
  companyOnlineCourseAccess,
  courseCompanySettings,
  courseFieldCertificates,
  courseFields,
  courseLessons,
  courseModuleAccess,
  courseModuleCertificates,
  courseModuleVisits,
  courseModules,
  courseResults,
  courseSessions,
  courseWorkerOverrides,
  courseWorkers,
  payrollEmployees,
  processes,
  roles,
} from "../../drizzle/schema";

const suffix = randomUUID().replace(/-/g, "").slice(0, 12);
const staffPassword = "RetiroPersonal123!";
const originalPassword = "RetiroTrabajador123!";
const resetWhileRetiredPassword = "RetiroNoReactivar123!";
const newPassword = "Reincorporado123!";
const sameCedula = `RT${suffix}`;
const regCodeA = `RETA${suffix}`;
const regCodeB = `RETB${suffix}`;
const mainName = `Persona retiro sintética ${suffix}`;
const otherName = `Persona empresa B sintética ${suffix}`;
const guardName = `Persona permisos sintética ${suffix}`;
const passing = ["a", "a", "a", "a", "b"];
const failing = ["b", "b", "b", "b", "a"];
const questions = passing.map((correct, index) => ({
  q: `Pregunta sintética ${index + 1}`,
  orden: [
    { id: "a", text: "Opción A" },
    { id: "b", text: "Opción B" },
  ],
  correct,
}));

function lessonFile(title: string) {
  return {
    title,
    objetivo: "Objetivo sintético de integración",
    icono: "escudo",
    preguntas: questions,
  };
}

/** Real course cookies: never inject an actor or a worker ID into the context. */
function browser(initialCookie = "") {
  let cookie = initialCookie;
  const setCookies: string[] = [];
  return {
    get cookie() {
      return cookie;
    },
    setCookies,
    caller() {
      return onlineCoursesRouter.createCaller({
        user: null,
        manager: null,
        processLeader: null,
        req: { headers: { cookie }, socket: { remoteAddress: "203.0.113.75" } },
        res: {
          setHeader(name: string, value: string | string[]) {
            if (name.toLowerCase() !== "set-cookie") return;
            for (const header of Array.isArray(value) ? value : [value]) {
              setCookies.push(header);
              const match = /(?:^|\s)course_sid=([^;]*)/.exec(header);
              if (match) cookie = match[1] ? `course_sid=${match[1]}` : "";
            }
          },
        },
      } as never);
    },
  };
}

type Browser = ReturnType<typeof browser>;
type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

/** Keep the entire mutable lifecycle in one test; other tests use a separate guard worker. */
describe("retiro seguro de trabajadores de cursos (MySQL local)", () => {
  let db: Db;
  const accountIds: number[] = [];
  const companyIds: number[] = [];
  const processIds: number[] = [];
  const fieldIds: number[] = [];
  let adminAccountId = 0;
  let managerAAccountId = 0;
  let managerBAccountId = 0;
  let companyAId = 0;
  let companyBId = 0;
  let workerId = 0;
  let otherWorkerId = 0;
  let guardWorkerId = 0;
  let peerWorkerId = 0;
  let payrollId = 0;
  let publicFieldId = 0;
  let publicModuleId = 0;
  let publicLessonId = 0;
  let privateFieldId = 0;
  let privateModuleId = 0;
  let privateLessonId = 0;
  let visitModuleId = 0;
  let admin: Browser;
  let managerA: Browser;
  let managerB: Browser;
  let standardLeader: Browser;
  let delegatedLeader: Browser;
  let worker: Browser;
  let secondWorkerSession: Browser;
  let otherWorker: Browser;
  let guardWorker: Browser;
  let peerWorker: Browser;
  const platformBrowsers: Browser[] = [];
  let platformAdmin: Browser;

  function confirmation(id = workerId, name = mainName, cedula = sameCedula) {
    return { workerId: id, confirmationCedula: cedula, confirmationName: name };
  }

  async function workerRow(id: number) {
    const [row] = await db
      .select()
      .from(courseWorkers)
      .where(eq(courseWorkers.id, id));
    expect(row).toBeDefined();
    return row!;
  }

  async function history(id: number) {
    // Compare complete rows, including attempts, dates and certificate codes, not just counts.
    return {
      results: await db
        .select()
        .from(courseResults)
        .where(eq(courseResults.workerId, id))
        .orderBy(asc(courseResults.lessonId)),
      visits: await db
        .select()
        .from(courseModuleVisits)
        .where(eq(courseModuleVisits.workerId, id))
        .orderBy(asc(courseModuleVisits.moduleId)),
      moduleCertificates: await db
        .select()
        .from(courseModuleCertificates)
        .where(eq(courseModuleCertificates.workerId, id))
        .orderBy(asc(courseModuleCertificates.moduleId)),
      fieldCertificates: await db
        .select()
        .from(courseFieldCertificates)
        .where(eq(courseFieldCertificates.workerId, id))
        .orderBy(asc(courseFieldCertificates.fieldId)),
      overrides: await db
        .select()
        .from(courseWorkerOverrides)
        .where(eq(courseWorkerOverrides.workerId, id))
        .orderBy(asc(courseWorkerOverrides.moduleId)),
    };
  }

  async function administrativeRows() {
    return {
      accounts: await db
        .select()
        .from(accounts)
        .where(inArray(accounts.id, accountIds))
        .orderBy(asc(accounts.id)),
      roles: await db
        .select()
        .from(accountRoles)
        .where(inArray(accountRoles.accountId, accountIds))
        .orderBy(asc(accountRoles.id)),
      sessions: await db
        .select()
        .from(authSessions)
        .where(inArray(authSessions.accountId, accountIds))
        .orderBy(asc(authSessions.id)),
      courseSessions: await db
        .select()
        .from(courseSessions)
        .where(inArray(courseSessions.accountId, accountIds))
        .orderBy(asc(courseSessions.id)),
      delegatedAccess: await db
        .select()
        .from(companyOnlineCourseAccess)
        .where(inArray(companyOnlineCourseAccess.companyId, companyIds))
        .orderBy(
          asc(companyOnlineCourseAccess.companyId),
          asc(companyOnlineCourseAccess.accountId)
        ),
    };
  }

  async function assertWorkerSessionsBlocked() {
    for (const session of [worker, secondWorkerSession]) {
      expect(await session.caller().whoami()).toBeNull();
      await expect(session.caller().tree()).rejects.toMatchObject({
        code: "UNAUTHORIZED",
      });
      await expect(
        session.caller().module({ moduleId: publicModuleId })
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
      await expect(
        session
          .caller()
          .evaluate({ lessonId: publicLessonId, answers: passing })
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
      await expect(
        session.caller().certificate({ kind: "campo", id: publicFieldId })
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
      await expect(
        session
          .caller()
          .changePassword({ actual: originalPassword, nueva: newPassword })
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    }
  }

  beforeAll(async () => {
    // This suite is intentionally local-only: refuse a remote URL before opening a connection.
    const rawUrl = process.env.DATABASE_URL?.trim();
    if (
      !rawUrl ||
      !["localhost", "127.0.0.1", "[::1]", "::1"].includes(
        new URL(rawUrl).hostname
      )
    ) {
      throw new Error(
        "Este test requiere DATABASE_URL de un MySQL local aislado (loopback)."
      );
    }
    db = (await getDb()) as Db;
    if (!db)
      throw new Error("Base local no disponible para retiro seguro de cursos.");
    const roleRows = await db.select().from(roles);
    const roleId = (slug: string) => {
      const role = roleRows.find(row => row.slug === slug);
      if (!role) throw new Error(`Falta el rol requerido: ${slug}`);
      return role.id;
    };
    const adminRoleId = roleId("platform_admin");
    const managerRoleId = roleId("company_manager");
    const leaderRoleId = roleId("process_leader");
    const passwordHash = await bcrypt.hash(staffPassword, 4);
    async function staff(kind: string) {
      const email = `retirement-${kind}-${suffix}@example.test`;
      const result = await db
        .insert(accounts)
        .values({
          openId: `retirement-${kind}-${suffix}`,
          name: `Personal sintético ${kind}`,
          email,
          passwordHash,
          status: "active",
        });
      const id = Number(result[0].insertId);
      accountIds.push(id);
      return { id, email };
    }
    const adminFixture = await staff("admin");
    const managerAFixture = await staff("manager-a");
    const managerBFixture = await staff("manager-b");
    const standardFixture = await staff("standard-leader");
    const delegatedFixture = await staff("delegated-leader");
    adminAccountId = adminFixture.id;
    managerAAccountId = managerAFixture.id;
    managerBAccountId = managerBFixture.id;
    for (const [name, ownerAccountId] of [
      [`Empresa retiro A ${suffix}`, managerAAccountId],
      [`Empresa retiro B ${suffix}`, managerBAccountId],
    ] as const) {
      const result = await db
        .insert(companies)
        .values({ name, ownerAccountId, status: "Activa" });
      companyIds.push(Number(result[0].insertId));
    }
    [companyAId, companyBId] = companyIds;
    const processInsert = await db
      .insert(processes)
      .values({
        companyId: companyAId,
        name: `Proceso sintético ${suffix}`,
        processType: "soporte",
      });
    const processId = Number(processInsert[0].insertId);
    processIds.push(processId);
    await db.insert(accountRoles).values([
      {
        accountId: adminAccountId,
        roleId: adminRoleId,
        companyId: 0,
        processId: 0,
        status: "active",
      },
      {
        accountId: managerAAccountId,
        roleId: managerRoleId,
        companyId: companyAId,
        processId: 0,
        status: "active",
      },
      {
        accountId: managerBAccountId,
        roleId: managerRoleId,
        companyId: companyBId,
        processId: 0,
        status: "active",
      },
      {
        accountId: standardFixture.id,
        roleId: leaderRoleId,
        companyId: companyAId,
        processId,
        status: "active",
      },
      {
        accountId: delegatedFixture.id,
        roleId: leaderRoleId,
        companyId: companyAId,
        processId,
        status: "active",
      },
    ]);
    await db
      .insert(companyOnlineCourseAccess)
      .values({
        companyId: companyAId,
        accountId: delegatedFixture.id,
        accessLevel: "online_course_manager",
      });
    await db.insert(courseCompanySettings).values([
      { companyId: companyAId, regCode: regCodeA },
      { companyId: companyBId, regCode: regCodeB },
    ]);
    admin = browser();
    managerA = browser();
    managerB = browser();
    expect(
      await admin
        .caller()
        .login({ identificacion: adminFixture.email, password: staffPassword })
    ).toMatchObject({ role: "platform_admin" });
    expect(
      await managerA
        .caller()
        .login({
          identificacion: managerAFixture.email,
          password: staffPassword,
        })
    ).toMatchObject({ role: "company_admin" });
    expect(
      await managerB
        .caller()
        .login({
          identificacion: managerBFixture.email,
          password: staffPassword,
        })
    ).toMatchObject({ role: "company_admin" });
    for (const account of [
      adminFixture,
      managerAFixture,
      managerBFixture,
      standardFixture,
      delegatedFixture,
    ]) {
      const session = await createAuthSession({ accountId: account.id });
      platformBrowsers.push(browser(`${COOKIE_NAME}=${session.plainToken}`));
    }
    platformAdmin = platformBrowsers[0];
    standardLeader = platformBrowsers[3];
    delegatedLeader = platformBrowsers[4];

    publicFieldId = (
      await admin
        .caller()
        .createField({ name: `Campo general retiro ${suffix}` })
    ).id;
    fieldIds.push(publicFieldId);
    publicModuleId = (
      await admin
        .caller()
        .createModule({
          fieldId: publicFieldId,
          name: "Módulo general sintético",
        })
    ).id;
    publicLessonId = (
      await admin
        .caller()
        .createLesson({
          moduleId: publicModuleId,
          file: lessonFile("Capacitación general sintética"),
        })
    ).id;
    privateFieldId = (
      await managerA
        .caller()
        .createField({ name: `Campo privado retiro ${suffix}` })
    ).id;
    fieldIds.push(privateFieldId);
    privateModuleId = (
      await managerA
        .caller()
        .createModule({
          fieldId: privateFieldId,
          name: "Módulo privado aprobado",
        })
    ).id;
    privateLessonId = (
      await managerA
        .caller()
        .createLesson({
          moduleId: privateModuleId,
          file: lessonFile("Capacitación privada sintética"),
        })
    ).id;
    visitModuleId = (
      await managerA
        .caller()
        .createModule({
          fieldId: privateFieldId,
          name: "Módulo con visita sin resultado",
        })
    ).id;
    await managerA
      .caller()
      .createLesson({
        moduleId: visitModuleId,
        file: lessonFile("Capacitación pendiente sintética"),
      });
    for (const moduleId of [publicModuleId, privateModuleId, visitModuleId])
      await managerA.caller().setModuleAccess({ moduleId, open: true });
    await managerB
      .caller()
      .setModuleAccess({ moduleId: publicModuleId, open: true });

    async function register(
      nombre: string,
      cedula: string,
      codigo: string,
      companyId: number
    ) {
      const session = browser();
      expect(
        await session
          .caller()
          .register({
            nombre,
            cedula,
            codigo,
            password: originalPassword,
            cargo: "Cargo sintético",
            centro: "Centro sintético",
          })
      ).toMatchObject({ ok: true });
      const [row] = await db
        .select({ id: courseWorkers.id })
        .from(courseWorkers)
        .where(
          and(
            eq(courseWorkers.companyId, companyId),
            eq(courseWorkers.cedula, cedula)
          )
        );
      expect(row).toBeDefined();
      return { session, id: row!.id };
    }
    const main = await register(mainName, sameCedula, regCodeA, companyAId);
    worker = main.session;
    workerId = main.id;
    const other = await register(otherName, sameCedula, regCodeB, companyBId);
    otherWorker = other.session;
    otherWorkerId = other.id;
    const guard = await register(
      guardName,
      `GD${suffix}`,
      regCodeA,
      companyAId
    );
    guardWorker = guard.session;
    guardWorkerId = guard.id;
    const peer = await register(
      `Persona activa sintética ${suffix}`,
      `PR${suffix}`,
      regCodeA,
      companyAId
    );
    peerWorker = peer.session;
    peerWorkerId = peer.id;
    secondWorkerSession = browser();
    expect(
      await secondWorkerSession
        .caller()
        .login({
          identificacion: sameCedula,
          password: originalPassword,
          codigo: regCodeA,
        })
    ).toMatchObject({ role: "worker" });
    // Login replaces the registration session under the existing single-session policy.
    worker = secondWorkerSession;
    secondWorkerSession = browser(worker.cookie);
    expect(workerId).not.toBe(otherWorkerId);
    await managerA
      .caller()
      .setOverride({ workerId, moduleId: publicModuleId, value: "abrir" });
    await worker.caller().module({ moduleId: publicModuleId });
    expect(
      await worker
        .caller()
        .evaluate({ lessonId: publicLessonId, answers: failing })
    ).toMatchObject({ passed: false });
    expect(
      await worker
        .caller()
        .evaluate({ lessonId: publicLessonId, answers: passing })
    ).toMatchObject({ passed: true, scoreTenths: 100 });
    await worker.caller().module({ moduleId: privateModuleId });
    expect(
      await worker
        .caller()
        .evaluate({ lessonId: privateLessonId, answers: passing })
    ).toMatchObject({ passed: true });
    await worker.caller().module({ moduleId: visitModuleId });
    await otherWorker.caller().module({ moduleId: publicModuleId });
    expect(
      await otherWorker
        .caller()
        .evaluate({ lessonId: publicLessonId, answers: passing })
    ).toMatchObject({ passed: true });
    // Independent payroll fixture deliberately shares company/identity, without assuming a linkage.
    const payroll = await db
      .insert(payrollEmployees)
      .values({
        companyId: companyAId,
        fullName: mainName,
        identityCard: sameCedula,
        hireDate: new Date("2026-01-15T12:00:00Z"),
        area: "Área sintética",
        position: "Cargo sintético",
        status: "activo",
      });
    payrollId = Number(payroll[0].insertId);
  }, 60_000);

  afterAll(async () => {
    if (!db) return;
    const workers = companyIds.length
      ? await db
          .select({ id: courseWorkers.id })
          .from(courseWorkers)
          .where(inArray(courseWorkers.companyId, companyIds))
      : [];
    const workerIds = workers.map(row => row.id);
    if (workerIds.length) {
      await db
        .delete(courseResults)
        .where(inArray(courseResults.workerId, workerIds));
      await db
        .delete(courseModuleCertificates)
        .where(inArray(courseModuleCertificates.workerId, workerIds));
      await db
        .delete(courseFieldCertificates)
        .where(inArray(courseFieldCertificates.workerId, workerIds));
      await db
        .delete(courseModuleVisits)
        .where(inArray(courseModuleVisits.workerId, workerIds));
      await db
        .delete(courseWorkerOverrides)
        .where(inArray(courseWorkerOverrides.workerId, workerIds));
      await db
        .delete(courseSessions)
        .where(inArray(courseSessions.workerId, workerIds));
      await db
        .delete(courseWorkers)
        .where(inArray(courseWorkers.id, workerIds));
    }
    const modules = fieldIds.length
      ? await db
          .select({ id: courseModules.id })
          .from(courseModules)
          .where(inArray(courseModules.fieldId, fieldIds))
      : [];
    const moduleIds = modules.map(row => row.id);
    if (moduleIds.length) {
      await db
        .delete(courseLessons)
        .where(inArray(courseLessons.moduleId, moduleIds));
      await db
        .delete(courseModuleAccess)
        .where(inArray(courseModuleAccess.moduleId, moduleIds));
      await db
        .delete(courseModules)
        .where(inArray(courseModules.id, moduleIds));
    }
    if (fieldIds.length)
      await db.delete(courseFields).where(inArray(courseFields.id, fieldIds));
    if (payrollId)
      await db
        .delete(payrollEmployees)
        .where(eq(payrollEmployees.id, payrollId));
    if (companyIds.length) {
      await db
        .delete(courseModuleAccess)
        .where(inArray(courseModuleAccess.companyId, companyIds));
      await db
        .delete(courseCompanySettings)
        .where(inArray(courseCompanySettings.companyId, companyIds));
      await db
        .delete(companyOnlineCourseAccess)
        .where(inArray(companyOnlineCourseAccess.companyId, companyIds));
    }
    if (accountIds.length) {
      await db
        .delete(authSessions)
        .where(inArray(authSessions.accountId, accountIds));
      await db
        .delete(courseSessions)
        .where(inArray(courseSessions.accountId, accountIds));
      await db
        .delete(accountRoles)
        .where(inArray(accountRoles.accountId, accountIds));
    }
    if (processIds.length)
      await db.delete(processes).where(inArray(processes.id, processIds));
    if (companyIds.length)
      await db.delete(companies).where(inArray(companies.id, companyIds));
    if (accountIds.length)
      await db.delete(accounts).where(inArray(accounts.id, accountIds));
  });

  it("retira idempotentemente, conserva historial, bloquea autenticación y reincorpora el mismo ID sin restaurar sesiones", async () => {
    const before = await workerRow(workerId);
    const historyBefore = await history(workerId);
    expect(before.retiredAt).toBeNull();
    expect(historyBefore.results).toHaveLength(2);
    expect(
      historyBefore.results.find(row => row.lessonId === publicLessonId)
        ?.attempts
    ).toBe(2);
    expect(historyBefore.visits).toHaveLength(3);
    expect(historyBefore.moduleCertificates).toHaveLength(2);
    expect(historyBefore.fieldCertificates).toHaveLength(1);
    expect(historyBefore.overrides).toHaveLength(1);
    const certificateInputs = [
      { kind: "capacitacion", id: publicLessonId },
      { kind: "modulo", id: publicModuleId },
      { kind: "campo", id: publicFieldId },
    ] as const;
    const certificatesBefore = await Promise.all(
      certificateInputs.map(input => worker.caller().certificate(input))
    );
    const overviewBefore = await managerA.caller().companyOverview();
    const trackingBefore = overviewBefore.workers.find(
      row => row.id === workerId
    )!;
    expect(trackingBefore.modules[publicModuleId]).toMatchObject({
      done: 1,
      status: "aprobado",
      scoreTenths: 100,
    });
    expect(trackingBefore.modules[visitModuleId]).toMatchObject({
      done: 0,
      status: "en_curso",
    });
    const exportBefore = await managerA.caller().exportCsv();
    expect(exportBefore.rows.some(row => row[0] === mainName)).toBe(true);
    const catalogBefore = await admin.caller().catalogOverview();
    const catalogCountBefore = catalogBefore.companies.find(
      row => row.id === companyAId
    )!.workers;
    const otherCompanyBefore = await managerB.caller().companyOverview();
    const otherExportBefore = await managerB.caller().exportCsv();
    const otherRowBefore = await workerRow(otherWorkerId);
    const otherHistoryBefore = await history(otherWorkerId);
    const otherSessionsBefore = await db
      .select()
      .from(courseSessions)
      .where(eq(courseSessions.workerId, otherWorkerId))
      .orderBy(asc(courseSessions.id));
    const peerBefore = await workerRow(peerWorkerId);
    const adminBefore = await administrativeRows();
    const payrollBefore = await db
      .select()
      .from(payrollEmployees)
      .where(eq(payrollEmployees.id, payrollId));
    expect(await worker.caller().whoami()).toMatchObject({
      role: "worker",
      name: mainName,
    });
    expect(await secondWorkerSession.caller().whoami()).toMatchObject({
      role: "worker",
      name: mainName,
    });

    await managerA.caller().retireWorker(confirmation());
    const retired = await workerRow(workerId);
    expect(retired.retiredAt).toBeInstanceOf(Date);
    expect(retired.retiredByAccountId).toBe(managerAAccountId);
    expect({
      ...retired,
      retiredAt: before.retiredAt,
      retiredByAccountId: before.retiredByAccountId,
    }).toEqual(before);
    await managerA.caller().retireWorker(confirmation());
    expect(await workerRow(workerId)).toEqual(retired);
    expect(await history(workerId)).toEqual(historyBefore);
    await assertWorkerSessionsBlocked();

    const retiredOverview = await managerA.caller().companyOverview();
    expect(retiredOverview.workerCount).toBe(overviewBefore.workerCount - 1);
    expect(retiredOverview.workers.map(row => row.id)).not.toContain(workerId);
    expect(retiredOverview.workers.map(row => row.id)).toEqual(
      expect.arrayContaining([guardWorkerId, peerWorkerId])
    );
    expect(
      retiredOverview.retiredWorkers.filter(row => row.id === workerId)
    ).toHaveLength(1);
    const retiredTracking = retiredOverview.retiredWorkers.find(
      row => row.id === workerId
    )!;
    expect(retiredTracking.retiredAt).toBeTruthy();
    expect(retiredTracking).toMatchObject(trackingBefore);
    const catalogRetired = await admin.caller().catalogOverview();
    expect(
      catalogRetired.companies.find(row => row.id === companyAId)?.workers
    ).toBe(catalogCountBefore - 1);
    expect(
      catalogRetired.companies.find(row => row.id === companyBId)?.workers
    ).toBe(catalogBefore.companies.find(row => row.id === companyBId)?.workers);
    const retiredExport = await managerA.caller().exportCsv();
    expect(retiredExport.filename).toBe(
      "seguimiento-detallado-capacitaciones.xlsx"
    );
    expect(retiredExport.headers).toEqual(exportBefore.headers);
    expect(retiredExport.rows).toEqual(
      exportBefore.rows.filter(row => row[0] !== mainName)
    );
    expect(retiredExport.csv).not.toContain(mainName);
    expect(retiredExport.csv).not.toContain(sameCedula);
    expect(
      (await platformAdmin.caller().exportCsv({ companyId: companyAId })).rows
    ).toEqual(retiredExport.rows);

    const rejectedLogin = browser();
    await expect(
      rejectedLogin
        .caller()
        .login({
          identificacion: sameCedula,
          password: originalPassword,
          codigo: regCodeA,
        })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(rejectedLogin.cookie).toBe("");
    expect(await rejectedLogin.caller().whoami()).toBeNull();
    const registration = browser();
    await expect(
      registration
        .caller()
        .register({
          cedula: sameCedula,
          nombre: mainName,
          password: originalPassword,
          codigo: regCodeA,
        })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(registration.cookie).toBe("");
    expect(await workerRow(workerId)).toEqual(retired);
    expect(
      await db
        .select({ id: courseWorkers.id })
        .from(courseWorkers)
        .where(
          and(
            eq(courseWorkers.companyId, companyAId),
            eq(courseWorkers.cedula, sameCedula)
          )
        )
    ).toEqual([{ id: workerId }]);

    // Reset may be refused for a retired account or change its password; neither policy may reactivate it.
    const resetOutcome = await managerA
      .caller()
      .resetWorkerPassword({ workerId, password: resetWhileRetiredPassword })
      .then(
        () => null,
        (error: unknown) => error
      );
    if (resetOutcome)
      expect(resetOutcome).toMatchObject({
        code: expect.stringMatching(/^(BAD_REQUEST|CONFLICT|FORBIDDEN)$/),
      });
    const afterReset = await workerRow(workerId);
    expect(afterReset.retiredAt).toEqual(retired.retiredAt);
    expect(afterReset.retiredByAccountId).toBe(retired.retiredByAccountId);
    await expect(
      browser()
        .caller()
        .login({
          identificacion: sameCedula,
          password: resetWhileRetiredPassword,
          codigo: regCodeA,
        })
    ).rejects.toThrow();
    await assertWorkerSessionsBlocked();
    expect(
      (await managerA.caller().companyOverview()).workers.map(row => row.id)
    ).not.toContain(workerId);
    expect(await history(workerId)).toEqual(historyBefore);

    // Failed confirmations must also leave a retired row intact on reinstatement.
    for (const input of [
      confirmation(workerId, "Nombre equivocado"),
      confirmation(workerId, mainName, `INC${suffix}`),
    ]) {
      await expect(
        managerA.caller().reinstateWorker(input)
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(await workerRow(workerId)).toEqual(afterReset);
    }
    await managerA.caller().reinstateWorker(confirmation());
    const reinstated = await workerRow(workerId);
    expect(reinstated).toMatchObject({
      id: workerId,
      companyId: companyAId,
      cedula: sameCedula,
      name: mainName,
      retiredAt: null,
      retiredByAccountId: null,
      createdAt: before.createdAt,
    });
    expect(await history(workerId)).toEqual(historyBefore);
    await assertWorkerSessionsBlocked();
    expect(managerA.cookie).toBeTruthy();
    expect(await managerA.caller().whoami()).toMatchObject({
      role: "company_admin",
    });
    const sessionless = browser();
    expect(await sessionless.caller().whoami()).toBeNull();
    expect(
      await db
        .select()
        .from(courseSessions)
        .where(eq(courseSessions.workerId, workerId))
    ).toHaveLength(0);
    await managerA
      .caller()
      .resetWorkerPassword({ workerId, password: newPassword });
    await expect(
      browser()
        .caller()
        .login({
          identificacion: sameCedula,
          password: originalPassword,
          codigo: regCodeA,
        })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(
      browser()
        .caller()
        .login({
          identificacion: sameCedula,
          password: resetWhileRetiredPassword,
          codigo: regCodeA,
        })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    const freshLogin = browser();
    expect(
      await freshLogin
        .caller()
        .login({
          identificacion: sameCedula,
          password: newPassword,
          codigo: regCodeA,
        })
    ).toMatchObject({ role: "worker" });
    expect(await freshLogin.caller().whoami()).toMatchObject({
      role: "worker",
      name: mainName,
      cedula: sameCedula,
    });
    expect(
      await Promise.all(
        certificateInputs.map(input => freshLogin.caller().certificate(input))
      )
    ).toEqual(certificatesBefore);
    expect(await history(workerId)).toEqual(historyBefore);
    const restoredOverview = await managerA.caller().companyOverview();
    expect(restoredOverview.workerCount).toBe(overviewBefore.workerCount);
    expect(
      restoredOverview.workers.find(row => row.id === workerId)
    ).toMatchObject(trackingBefore);
    expect(restoredOverview.retiredWorkers.map(row => row.id)).not.toContain(
      workerId
    );
    expect((await managerA.caller().exportCsv()).rows).toEqual(
      exportBefore.rows
    );
    expect(
      (await admin.caller().catalogOverview()).companies.find(
        row => row.id === companyAId
      )?.workers
    ).toBe(catalogCountBefore);

    expect(await workerRow(otherWorkerId)).toEqual(otherRowBefore);
    expect(await history(otherWorkerId)).toEqual(otherHistoryBefore);
    expect(
      await db
        .select()
        .from(courseSessions)
        .where(eq(courseSessions.workerId, otherWorkerId))
        .orderBy(asc(courseSessions.id))
    ).toEqual(otherSessionsBefore);
    expect(await otherWorker.caller().whoami()).toMatchObject({
      role: "worker",
      name: otherName,
    });
    expect(await managerB.caller().companyOverview()).toEqual(
      otherCompanyBefore
    );
    expect(await managerB.caller().exportCsv()).toEqual(otherExportBefore);
    const otherFreshLogin = browser();
    expect(
      await otherFreshLogin
        .caller()
        .login({
          identificacion: sameCedula,
          password: originalPassword,
          codigo: regCodeB,
        })
    ).toMatchObject({ role: "worker" });
    expect(await otherFreshLogin.caller().whoami()).toMatchObject({
      role: "worker",
      name: otherName,
    });
    expect(await workerRow(peerWorkerId)).toEqual(peerBefore);
    expect(await peerWorker.caller().whoami()).toMatchObject({
      role: "worker",
    });
    expect(await administrativeRows()).toEqual(adminBefore);
    expect(
      await db
        .select()
        .from(payrollEmployees)
        .where(eq(payrollEmployees.id, payrollId))
    ).toEqual(payrollBefore);
    expect(await platformBrowsers[1].caller().whoami()).toMatchObject({
      role: "company_admin",
    });
    expect(await platformBrowsers[2].caller().whoami()).toMatchObject({
      role: "company_admin",
    });
    expect(await platformAdmin.caller().whoami()).toMatchObject({
      role: "platform_admin",
    });
  }, 60_000);

  it("rechaza confirmaciones erróneas y límites de entrada sin modificar el trabajador activo", async () => {
    const before = await workerRow(guardWorkerId);
    const valid = confirmation(guardWorkerId, guardName, `GD${suffix}`);
    for (const action of ["retireWorker", "reinstateWorker"] as const) {
      for (const input of [
        { ...valid, confirmationName: "Nombre equivocado" },
        { ...valid, confirmationCedula: `INC${suffix}` },
        { ...valid, confirmationName: "" },
        { ...valid, confirmationCedula: "" },
        { ...valid, confirmationName: "N".repeat(101) },
        { ...valid, confirmationCedula: "C".repeat(33) },
        { ...valid, workerId: 0 },
        { ...valid, workerId: -1 },
        { ...valid, workerId: 1.5 },
        { ...valid, companyId: 0 },
        { ...valid, companyId: -1 },
        { ...valid, companyId: 1.5 },
      ]) {
        await expect(managerA.caller()[action](input)).rejects.toMatchObject({
          code: "BAD_REQUEST",
        });
        expect(await workerRow(guardWorkerId)).toEqual(before);
      }
    }
  });

  it("prohíbe workerId ajeno aunque se envíe el companyId de otra empresa", async () => {
    const before = await workerRow(guardWorkerId);
    const otherBefore = await workerRow(otherWorkerId);
    for (const action of ["retireWorker", "reinstateWorker"] as const) {
      await expect(
        managerA
          .caller()
          [
            action
          ]({ ...confirmation(otherWorkerId, otherName), companyId: companyBId })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        managerB
          .caller()
          [
            action
          ]({ ...confirmation(guardWorkerId, guardName, `GD${suffix}`), companyId: companyAId })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(await workerRow(guardWorkerId)).toEqual(before);
      expect(await workerRow(otherWorkerId)).toEqual(otherBefore);
    }
  });

  it("bloquea trabajador, anónimo y Jefe estándar sin conceder roles ni alterar cuentas", async () => {
    const before = await workerRow(guardWorkerId);
    const staffBefore = await administrativeRows();
    expect(await standardLeader.caller().whoami()).toBeNull();
    for (const action of ["retireWorker", "reinstateWorker"] as const) {
      for (const unauthorised of [browser(), standardLeader]) {
        await expect(
          unauthorised
            .caller()
            [action](confirmation(guardWorkerId, guardName, `GD${suffix}`))
        ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
      }
      await expect(
        peerWorker
          .caller()
          [action](confirmation(guardWorkerId, guardName, `GD${suffix}`))
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(await workerRow(guardWorkerId)).toEqual(before);
    }
    expect(await administrativeRows()).toEqual(staffBefore);
  });

  it("permite administrador general con empresa explícita y Jefe delegado solo en su empresa", async () => {
    const before = await workerRow(guardWorkerId);
    const valid = confirmation(guardWorkerId, guardName, `GD${suffix}`);
    const staffBefore = await administrativeRows();
    expect(await delegatedLeader.caller().whoami()).toMatchObject({
      role: "company_admin",
    });
    for (const action of ["retireWorker", "reinstateWorker"] as const) {
      await expect(platformAdmin.caller()[action](valid)).rejects.toMatchObject(
        { code: "FORBIDDEN" }
      );
      await expect(
        platformAdmin.caller()[action]({ ...valid, companyId: companyBId })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        delegatedLeader
          .caller()
          [
            action
          ]({ ...confirmation(otherWorkerId, otherName), companyId: companyBId })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(await workerRow(guardWorkerId)).toEqual(before);
    }
    try {
      await platformAdmin
        .caller()
        .retireWorker({ ...valid, companyId: companyAId });
      expect(await workerRow(guardWorkerId)).toMatchObject({
        retiredAt: expect.any(Date),
        retiredByAccountId: adminAccountId,
      });
      await platformAdmin
        .caller()
        .reinstateWorker({ ...valid, companyId: companyAId });
      expect(await workerRow(guardWorkerId)).toEqual(before);
      // companyId is ignored for non-platform actors: the delegated leader still operates A.
      await delegatedLeader
        .caller()
        .retireWorker({ ...valid, companyId: companyBId });
      expect(await workerRow(guardWorkerId)).toMatchObject({
        retiredAt: expect.any(Date),
      });
      await delegatedLeader
        .caller()
        .reinstateWorker({ ...valid, companyId: companyBId });
      expect(await workerRow(guardWorkerId)).toEqual(before);
      expect(await administrativeRows()).toEqual(staffBefore);
    } finally {
      // Restore this test's own guard even when an assertion fails; no dependence on test order.
      if ((await workerRow(guardWorkerId)).retiredAt)
        await managerA.caller().reinstateWorker(valid);
    }
  });
});
