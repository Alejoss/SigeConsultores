import { afterAll, beforeAll, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { eq, inArray } from "drizzle-orm";
import { onlineCoursesRouter } from "../routers/onlineCourses";
import { courseRegCodesRouter } from "../routers/courseRegCodes";
import { getDb } from "../db";
import { createAuthSession } from "../authSessionRepository";
import { resetCourseLoginLimiter } from "../onlineCourses/service";
import { COOKIE_NAME } from "@shared/const";
import {
  accountRoles,
  accounts,
  authSessions,
  companies,
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
  roles,
} from "../../drizzle/schema";

const stamp = Date.now();
const adminEmail = `curso-admin-${stamp}@example.test`;
const managerEmail = `curso-gerente-${stamp}@example.test`;
const regCode = `CUR${String(stamp).slice(-6)}`;
const staffPassword = "Curso123!";
const workerCedula = `17${String(stamp).slice(-8)}`;
const questions = [0, 1, 2, 3, 4].map(index => ({
  q: `Pregunta ${index + 1}`,
  orden: [
    { id: "a", text: "Correcta" },
    { id: "b", text: "Incorrecta" },
  ],
  correct: index === 4 ? "b" : "a",
}));
const passing = ["a", "a", "a", "a", "b"];
const failing = ["b", "b", "b", "b", "a"];

function lessonFile(title: string) {
  return { title, objetivo: "Objetivo de prueba", icono: "escudo", preguntas: questions };
}

function harness() {
  let cookie = "";
  const res = {
    setHeader(name: string, value: string) {
      if (name.toLowerCase() !== "set-cookie") return;
      const match = /course_sid=([^;]*)/.exec(value);
      cookie = match?.[1] ? `course_sid=${match[1]}` : "";
    },
  };
  return {
    caller() {
      return onlineCoursesRouter.createCaller({
        user: null,
        manager: null,
        processLeader: null,
        req: { headers: { cookie }, socket: { remoteAddress: "203.0.113.15" } },
        res,
      } as never);
    },
  };
}

function regCodesCaller(ctx: { user?: { id: number; role: "admin" | "user" }; manager?: unknown; processLeader?: unknown }) {
  return courseRegCodesRouter.createCaller({
    user: ctx.user ? { openId: `t-${ctx.user.id}`, name: null, email: null, ...ctx.user } : null,
    manager: ctx.manager ?? null,
    processLeader: ctx.processLeader ?? null,
    req: { headers: {} },
    res: {},
  } as never);
}

describe("online courses flow", () => {
  let db: NonNullable<Awaited<ReturnType<typeof getDb>>>;
  let companyId = 0;
  let adminAccountId = 0;
  let managerAccountId = 0;
  let fieldId = 0;
  let closedFieldId = 0;
  let firstModuleId = 0;
  let secondModuleId = 0;
  let closedModuleId = 0;
  let firstLessonId = 0;
  let secondLessonId = 0;
  let privateModuleId = 0;

  beforeAll(async () => {
    resetCourseLoginLimiter();
    db = (await getDb()) as NonNullable<Awaited<ReturnType<typeof getDb>>>;
    if (!db) throw new Error("Base local no disponible para capacitaciones.");
    const roleRows = await db.select().from(roles);
    const adminRole = roleRows.find(role => role.slug === "platform_admin");
    const managerRole = roleRows.find(role => role.slug === "company_manager");
    if (!adminRole || !managerRole) throw new Error("Faltan los roles platform_admin o company_manager.");
    const passwordHash = await bcrypt.hash(staffPassword, 4);
    const admin = await db.insert(accounts).values({
      openId: `course-admin-${stamp}`,
      name: "Admin Capacitaciones",
      email: adminEmail,
      passwordHash,
      status: "active",
    });
    adminAccountId = Number(admin[0].insertId);
    const manager = await db.insert(accounts).values({
      openId: `course-manager-${stamp}`,
      name: "Gerente Capacitaciones",
      email: managerEmail,
      passwordHash,
      status: "active",
    });
    managerAccountId = Number(manager[0].insertId);
    const company = await db.insert(companies).values({
      name: `Empresa cursos ${stamp}`,
      ownerAccountId: managerAccountId,
      status: "Activa",
    });
    companyId = Number(company[0].insertId);
    await db.insert(accountRoles).values([
      { accountId: adminAccountId, roleId: adminRole.id, companyId: 0, processId: 0, status: "active" },
      { accountId: managerAccountId, roleId: managerRole.id, companyId, processId: 0, status: "active" },
    ]);
  });

  afterAll(async () => {
    if (!db) return;
    const workers = companyId
      ? await db.select({ id: courseWorkers.id }).from(courseWorkers).where(eq(courseWorkers.companyId, companyId))
      : [];
    const workerIds = workers.map(worker => worker.id);
    const catalogFieldIds = [fieldId, closedFieldId].filter(id => id > 0);
    const modules = catalogFieldIds.length
      ? await db.select({ id: courseModules.id }).from(courseModules).where(inArray(courseModules.fieldId, catalogFieldIds))
      : [];
    const privateFields = companyId
      ? await db.select({ id: courseFields.id }).from(courseFields).where(eq(courseFields.companyId, companyId))
      : [];
    const moduleIds = [...modules.map(moduleRow => moduleRow.id), privateModuleId, closedModuleId].filter(id => id > 0);
    const fieldIds = [...catalogFieldIds, ...privateFields.map(field => field.id)].filter(id => id > 0);
    if (workerIds.length) {
      await db.delete(courseResults).where(inArray(courseResults.workerId, workerIds));
      await db.delete(courseModuleCertificates).where(inArray(courseModuleCertificates.workerId, workerIds));
      await db.delete(courseFieldCertificates).where(inArray(courseFieldCertificates.workerId, workerIds));
      await db.delete(courseModuleVisits).where(inArray(courseModuleVisits.workerId, workerIds));
      await db.delete(courseWorkerOverrides).where(inArray(courseWorkerOverrides.workerId, workerIds));
      await db.delete(courseSessions).where(inArray(courseSessions.workerId, workerIds));
      await db.delete(courseWorkers).where(inArray(courseWorkers.id, workerIds));
    }
    if (moduleIds.length) {
      await db.delete(courseLessons).where(inArray(courseLessons.moduleId, moduleIds));
      await db.delete(courseModuleAccess).where(inArray(courseModuleAccess.moduleId, moduleIds));
      await db.delete(courseModules).where(inArray(courseModules.id, moduleIds));
    }
    if (fieldIds.length) await db.delete(courseFields).where(inArray(courseFields.id, fieldIds));
    if (companyId) await db.delete(courseCompanySettings).where(eq(courseCompanySettings.companyId, companyId));
    const accountIds = [adminAccountId, managerAccountId].filter(id => id > 0);
    if (accountIds.length) {
      await db.delete(authSessions).where(inArray(authSessions.accountId, accountIds));
      await db.delete(courseSessions).where(inArray(courseSessions.accountId, accountIds));
      await db.delete(accountRoles).where(inArray(accountRoles.accountId, accountIds));
      if (companyId) await db.delete(companies).where(eq(companies.id, companyId));
      await db.delete(accounts).where(inArray(accounts.id, accountIds));
    }
  });

  it("lets an ISGE administrator open the catalog with the platform session", async () => {
    const adminSession = await createAuthSession({ accountId: adminAccountId });
    const adminCaller = onlineCoursesRouter.createCaller({
      user: null,
      manager: null,
      processLeader: null,
      req: { headers: { cookie: `${COOKIE_NAME}=${adminSession.plainToken}` }, socket: { remoteAddress: "203.0.113.16" } },
      res: { setHeader() {} },
    } as never);
    expect(await adminCaller.whoami()).toMatchObject({ role: "platform_admin", name: "Admin Capacitaciones" });
    expect(await adminCaller.catalogOverview()).toMatchObject({ fields: expect.any(Array) });

    const managerSession = await createAuthSession({ accountId: managerAccountId });
    const managerCaller = onlineCoursesRouter.createCaller({
      user: null,
      manager: null,
      processLeader: null,
      req: { headers: { cookie: `${COOKIE_NAME}=${managerSession.plainToken}` }, socket: { remoteAddress: "203.0.113.17" } },
      res: { setHeader() {} },
    } as never);
    expect(await managerCaller.whoami()).toMatchObject({ role: "company_admin", name: "Gerente Capacitaciones" });
  });

  it("lets the manager and the general admin edit the registration code from ISGE 360", async () => {
    const asAdmin = regCodesCaller({ user: { id: adminAccountId, role: "admin" } });
    const generated = await asAdmin.set({ companyId });
    expect(generated.regCode).toMatch(/^EMPRES-[0-9A-F]{4}$/);
    expect((await asAdmin.list()).find(row => row.companyId === companyId)?.regCode).toBe(generated.regCode);

    const asManager = regCodesCaller({ manager: { companyId, companyName: "x", managerEmail } });
    expect((await asManager.mine()).regCode).toBe(generated.regCode);
    const managerCode = `GER${String(stamp).slice(-6)}`;
    expect((await asManager.setMine({ regCode: managerCode })).regCode).toBe(managerCode);
    expect((await asManager.mine()).regCode).toBe(managerCode);
    await expect(asManager.setMine({ regCode: "ab" })).rejects.toThrow(/4 caracteres/);
    await expect(asManager.list()).rejects.toThrow();

    const asLeader = regCodesCaller({
      processLeader: { processLeaderId: 1, leaderName: "x", leaderEmail: "x@example.test", processId: 1, companyId, companyName: "x" },
    });
    await expect(asLeader.setMine({ regCode: "LIDER1" })).rejects.toThrow(/gerente/);
    await expect(regCodesCaller({ user: { id: 9, role: "user" } }).mine()).rejects.toThrow();
  });

  it("grades on the server, keeps companies apart, and issues cascade certificates", async () => {
    const admin = harness();
    const adminApi = admin.caller();
    expect((await adminApi.login({ identificacion: adminEmail, password: staffPassword })).role).toBe("platform_admin");
    fieldId = (await admin.caller().createField({ name: `SSO ${stamp}` })).id;
    firstModuleId = (await admin.caller().createModule({ fieldId, name: "Conceptos" })).id;
    secondModuleId = (await admin.caller().createModule({ fieldId, name: "Aplicación" })).id;
    firstLessonId = (await admin.caller().createLesson({ moduleId: firstModuleId, file: lessonFile("Qué es SSO") })).id;
    secondLessonId = (await admin.caller().createLesson({ moduleId: secondModuleId, file: lessonFile("Cómo se aplica") })).id;
    closedFieldId = (await admin.caller().createField({ name: `Cerrado ${stamp}` })).id;
    closedModuleId = (await admin.caller().createModule({ fieldId: closedFieldId, name: "Sin abrir" })).id;
    await admin.caller().createLesson({ moduleId: closedModuleId, file: lessonFile("Cerrada") });
    expect((await regCodesCaller({ user: { id: adminAccountId, role: "admin" } }).set({ companyId, regCode })).regCode).toBe(regCode);

    const manager = harness();
    expect((await manager.caller().login({ identificacion: managerEmail, password: staffPassword })).role).toBe("company_admin");
    await expect(
      manager.caller().createLesson({ moduleId: firstModuleId, file: lessonFile("No permitido") })
    ).rejects.toThrow(/catálogo|tuyo/i);
    const privateFieldId = (await manager.caller().createField({ name: `Privado ${stamp}` })).id;
    privateModuleId = (await manager.caller().createModule({ fieldId: privateFieldId, name: "Interno" })).id;
    await expect(
      admin.caller().createLesson({ moduleId: privateModuleId, file: lessonFile("Tampoco") })
    ).rejects.toThrow(/catálogo/);

    await manager.caller().setModuleAccess({ moduleId: firstModuleId, open: true });
    await manager.caller().setModuleAccess({ moduleId: secondModuleId, open: true });
    const worker = harness();
    await worker.caller().register({
      cedula: workerCedula,
      nombre: "Ana Trabajadora",
      password: "clave123",
      codigo: regCode,
      cargo: "Analista",
      centro: "Planta",
    });
    await expect(worker.caller().module({ moduleId: closedModuleId })).rejects.toThrow(/cerró el acceso/);
    const opened = await worker.caller().module({ moduleId: firstModuleId });
    expect(opened.lessons[0].questions.every(question => !("correct" in question))).toBe(true);
    await expect(worker.caller().evaluate({ lessonId: secondLessonId, answers: passing })).rejects.toThrow(/módulo anterior/);

    const failed = await worker.caller().evaluate({ lessonId: firstLessonId, answers: failing });
    expect(failed.passed).toBe(false);
    await expect(worker.caller().certificate({ kind: "capacitacion", id: firstLessonId })).rejects.toThrow(/no disponible/);
    const passed = await worker.caller().evaluate({ lessonId: firstLessonId, answers: passing });
    expect(passed.passed).toBe(true);
    expect(passed.scoreTenths).toBe(100);
    const lessonCertificate = await worker.caller().certificate({ kind: "capacitacion", id: firstLessonId });
    expect(lessonCertificate.code.startsWith("CAP-")).toBe(true);

    const second = await worker.caller().evaluate({ lessonId: secondLessonId, answers: passing });
    expect(second.passed).toBe(true);
    const moduleCertificate = await worker.caller().certificate({ kind: "modulo", id: secondModuleId });
    const fieldCertificate = await worker.caller().certificate({ kind: "campo", id: fieldId });
    expect(moduleCertificate.code.startsWith("MOD-")).toBe(true);
    expect(fieldCertificate.code.startsWith("CERT-")).toBe(true);
    const tree = await worker.caller().tree();
    expect(tree.fields.some(field => field.certificate)).toBe(true);
  });
});
