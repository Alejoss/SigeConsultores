import { afterAll, beforeAll, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { and, eq, inArray } from "drizzle-orm";
import { onlineCoursesRouter } from "../routers/onlineCourses";
import { teamAccessRouter } from "../routers/teamAccess";
import { createAuthSession } from "../authSessionRepository";
import { getDb } from "../db";
import { selectCourseCompanyForPlatformSession } from "../onlineCourses/service";
import { COOKIE_NAME } from "@shared/const";
import {
  accounts,
  accountRoles,
  authSessions,
  companies,
  companyOnlineCourseAccess,
  companyOnlineCourseAccessAudit,
  courseCompanySettings,
  courseSessions,
  processes,
  roles,
} from "../../drizzle/schema";

const stamp = Date.now();
const password = "CursosSeguro123!";
const managerEmail = `manager-cursos-${stamp}@example.test`;
const leaderEmail = `lider-cursos-${stamp}@example.test`;
const otherLeaderEmail = `lider-otro-${stamp}@example.test`;

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

function courseCaller(cookie: string) {
  return onlineCoursesRouter.createCaller({
    user: null,
    manager: null,
    processLeader: null,
    req: { headers: { cookie }, socket: { remoteAddress: "203.0.113.25" } },
    res: { setHeader() {} },
  } as never);
}

function managerCaller(companyId: number) {
  return teamAccessRouter.createCaller(
    context({
      manager: {
        companyId,
        companyName: `Empresa cursos ${stamp}`,
        managerEmail,
      },
    })
  );
}

describe("acceso delegado a Capacitaciones en Línea", () => {
  let db: NonNullable<Awaited<ReturnType<typeof getDb>>>;
  let companyId = 0;
  let otherCompanyId = 0;
  let processId = 0;
  let otherProcessId = 0;
  let managerAccountId = 0;
  let leaderAccountId = 0;
  let otherLeaderAccountId = 0;
  let processLeaderRoleId = 0;

  beforeAll(async () => {
    db = (await getDb()) as NonNullable<Awaited<ReturnType<typeof getDb>>>;
    if (!db) throw new Error("Base local no disponible para prueba de cursos.");
    const roleRows = await db.select().from(roles);
    const managerRole = roleRows.find(role => role.slug === "company_manager");
    const processLeaderRole = roleRows.find(
      role => role.slug === "process_leader"
    );
    if (!managerRole || !processLeaderRole) {
      throw new Error("Faltan los roles requeridos para la prueba de cursos.");
    }
    processLeaderRoleId = processLeaderRole.id;
    const passwordHash = await bcrypt.hash(password, 4);
    const manager = await db.insert(accounts).values({
      openId: `online-course-manager-${stamp}`,
      name: "Gerente de cursos de prueba",
      email: managerEmail,
      passwordHash,
      status: "active",
    });
    managerAccountId = Number(manager[0].insertId);
    const leader = await db.insert(accounts).values({
      openId: `online-course-leader-${stamp}`,
      name: "Jefe de cursos de prueba",
      email: leaderEmail,
      passwordHash,
      status: "active",
    });
    leaderAccountId = Number(leader[0].insertId);
    const otherLeader = await db.insert(accounts).values({
      openId: `online-course-other-leader-${stamp}`,
      name: "Jefe ajeno de prueba",
      email: otherLeaderEmail,
      passwordHash,
      status: "active",
    });
    otherLeaderAccountId = Number(otherLeader[0].insertId);

    const company = await db.insert(companies).values({
      name: `Empresa cursos ${stamp}`,
      ownerAccountId: managerAccountId,
      status: "En Proceso",
    });
    companyId = Number(company[0].insertId);
    const otherCompany = await db.insert(companies).values({
      name: `Empresa ajena cursos ${stamp}`,
      ownerAccountId: managerAccountId,
      status: "En Proceso",
    });
    otherCompanyId = Number(otherCompany[0].insertId);
    const process = await db.insert(processes).values({
      companyId,
      name: "Proceso con Jefe autorizado",
      processType: "soporte",
    });
    processId = Number(process[0].insertId);
    const otherProcess = await db.insert(processes).values({
      companyId: otherCompanyId,
      name: "Proceso de empresa ajena",
      processType: "soporte",
    });
    otherProcessId = Number(otherProcess[0].insertId);
    await db.insert(accountRoles).values([
      {
        accountId: managerAccountId,
        roleId: managerRole.id,
        companyId,
        processId: 0,
        status: "active",
      },
      {
        accountId: leaderAccountId,
        roleId: processLeaderRole.id,
        companyId,
        processId,
        status: "active",
      },
      {
        accountId: otherLeaderAccountId,
        roleId: processLeaderRole.id,
        companyId: otherCompanyId,
        processId: otherProcessId,
        status: "active",
      },
    ]);
    await db.insert(courseCompanySettings).values({
      companyId,
      regCode: `INI${String(stamp).slice(-6)}`,
    });
  });

  afterAll(async () => {
    if (!db) return;
    const accountIds = [
      managerAccountId,
      leaderAccountId,
      otherLeaderAccountId,
    ].filter(Boolean);
    if (companyId || otherCompanyId) {
      await db
        .delete(companyOnlineCourseAccessAudit)
        .where(
          inArray(
            companyOnlineCourseAccessAudit.companyId,
            [companyId, otherCompanyId].filter(Boolean)
          )
        );
      await db
        .delete(companyOnlineCourseAccess)
        .where(
          inArray(
            companyOnlineCourseAccess.companyId,
            [companyId, otherCompanyId].filter(Boolean)
          )
        );
      await db
        .delete(courseCompanySettings)
        .where(
          inArray(
            courseCompanySettings.companyId,
            [companyId, otherCompanyId].filter(Boolean)
          )
        );
      await db
        .delete(accountRoles)
        .where(
          inArray(
            accountRoles.companyId,
            [companyId, otherCompanyId].filter(Boolean)
          )
        );
      await db
        .delete(processes)
        .where(
          inArray(processes.id, [processId, otherProcessId].filter(Boolean))
        );
      await db
        .delete(companies)
        .where(
          inArray(companies.id, [companyId, otherCompanyId].filter(Boolean))
        );
    }
    if (accountIds.length) {
      await db
        .delete(authSessions)
        .where(inArray(authSessions.accountId, accountIds));
      await db
        .delete(courseSessions)
        .where(inArray(courseSessions.accountId, accountIds));
      await db.delete(accounts).where(inArray(accounts.id, accountIds));
    }
  });

  it("mantiene bloqueados a los Jefes estándar, incluso si el navegador conserva una sesión de cursos ajena", async () => {
    const leaderSession = await createAuthSession({
      accountId: leaderAccountId,
    });
    const leader = courseCaller(`${COOKIE_NAME}=${leaderSession.plainToken}`);
    expect(await leader.whoami()).toBeNull();
    await expect(leader.companyOverview()).rejects.toThrow("Inicia sesión");

    let managerCourseCookie = "";
    const managerCourse = onlineCoursesRouter.createCaller({
      user: null,
      manager: null,
      processLeader: null,
      req: {
        headers: { cookie: "" },
        socket: { remoteAddress: "203.0.113.26" },
      },
      res: {
        setHeader(_name: string, value: string) {
          const match = /course_sid=([^;]*)/.exec(value);
          if (match?.[1]) managerCourseCookie = `course_sid=${match[1]}`;
        },
      },
    } as never);
    await managerCourse.login({ identificacion: managerEmail, password });
    const mixedIdentity = courseCaller(
      `${COOKIE_NAME}=${leaderSession.plainToken}; ${managerCourseCookie}`
    );
    expect(await mixedIdentity.whoami()).toBeNull();
  });

  it("permite al Gerente autorizar solamente el panel de cursos y lo registra", async () => {
    const grant = await managerCaller(
      companyId
    ).setOnlineCourseManagementAccess({
      companyId,
      accountId: leaderAccountId,
      accessLevel: "online_course_manager",
    });
    expect(grant.accessLevel).toBe("online_course_manager");

    const [access] = await db
      .select()
      .from(companyOnlineCourseAccess)
      .where(
        and(
          eq(companyOnlineCourseAccess.companyId, companyId),
          eq(companyOnlineCourseAccess.accountId, leaderAccountId)
        )
      )
      .limit(1);
    expect(access?.accessLevel).toBe("online_course_manager");
    const [audit] = await db
      .select({ eventType: companyOnlineCourseAccessAudit.eventType })
      .from(companyOnlineCourseAccessAudit)
      .where(
        and(
          eq(companyOnlineCourseAccessAudit.companyId, companyId),
          eq(companyOnlineCourseAccessAudit.accountId, leaderAccountId),
          eq(companyOnlineCourseAccessAudit.eventType, "granted")
        )
      )
      .limit(1);
    expect(audit?.eventType).toBe("granted");

    const session = await createAuthSession({ accountId: leaderAccountId });
    const leader = courseCaller(`${COOKIE_NAME}=${session.plainToken}`);
    expect(await leader.whoami()).toMatchObject({
      role: "company_admin",
      name: "Jefe de cursos de prueba",
    });
    const overview = await leader.companyOverview({
      companyId: otherCompanyId,
    });
    expect(overview.companyName).toBe(`Empresa cursos ${stamp}`);
    await expect(leader.catalogOverview()).rejects.toThrow(
      "administrador general"
    );

    await leader.setRegCode({
      companyId: otherCompanyId,
      codigo: `OWN${String(stamp).slice(-6)}`,
    });
    const ownSettings = await db
      .select()
      .from(courseCompanySettings)
      .where(eq(courseCompanySettings.companyId, companyId))
      .limit(1);
    const otherSettings = await db
      .select()
      .from(courseCompanySettings)
      .where(eq(courseCompanySettings.companyId, otherCompanyId))
      .limit(1);
    expect(ownSettings[0]?.regCode).toMatch(/^OWN/);
    expect(otherSettings).toHaveLength(0);

    await db.insert(companyOnlineCourseAccess).values({
      companyId: otherCompanyId,
      accountId: leaderAccountId,
      accessLevel: "online_course_manager",
    });
    await db.insert(accountRoles).values({
      accountId: leaderAccountId,
      roleId: processLeaderRoleId,
      companyId: otherCompanyId,
      processId: otherProcessId,
      status: "active",
    });
    const multipleCompaniesSession = await createAuthSession({
      accountId: leaderAccountId,
    });
    const multipleCompanies = courseCaller(
      `${COOKIE_NAME}=${multipleCompaniesSession.plainToken}`
    );
    expect(await multipleCompanies.whoami()).toBeNull();

    expect(
      await selectCourseCompanyForPlatformSession(
        multipleCompaniesSession.plainToken,
        companyId
      )
    ).toBe(true);
    expect(await multipleCompanies.whoami()).toMatchObject({
      role: "company_admin",
    });
    expect((await multipleCompanies.companyOverview()).companyName).toBe(
      `Empresa cursos ${stamp}`
    );

    expect(
      await selectCourseCompanyForPlatformSession(
        multipleCompaniesSession.plainToken,
        otherCompanyId
      )
    ).toBe(true);
    expect((await multipleCompanies.companyOverview()).companyName).toBe(
      `Empresa ajena cursos ${stamp}`
    );
    expect(
      await selectCourseCompanyForPlatformSession(
        multipleCompaniesSession.plainToken,
        999999999
      )
    ).toBe(false);
    expect((await multipleCompanies.companyOverview()).companyName).toBe(
      `Empresa ajena cursos ${stamp}`
    );

    await db
      .update(companyOnlineCourseAccess)
      .set({ accessLevel: "standard" })
      .where(
        and(
          eq(companyOnlineCourseAccess.companyId, otherCompanyId),
          eq(companyOnlineCourseAccess.accountId, leaderAccountId)
        )
      );
  });

  it("aplica revocación y suspensión inmediatamente a la sesión compartida existente", async () => {
    const session = await createAuthSession({ accountId: leaderAccountId });
    const leader = courseCaller(`${COOKIE_NAME}=${session.plainToken}`);
    expect(await leader.whoami()).toMatchObject({ role: "company_admin" });

    await managerCaller(companyId).setOnlineCourseManagementAccess({
      companyId,
      accountId: leaderAccountId,
      accessLevel: "standard",
    });
    expect(await leader.whoami()).toBeNull();
    await expect(leader.exportCsv()).rejects.toThrow("Inicia sesión");

    await managerCaller(companyId).setOnlineCourseManagementAccess({
      companyId,
      accountId: leaderAccountId,
      accessLevel: "online_course_manager",
    });
    expect(await leader.whoami()).toMatchObject({ role: "company_admin" });
    await db
      .update(accountRoles)
      .set({ status: "suspended", suspendedAt: new Date() })
      .where(
        and(
          eq(accountRoles.accountId, leaderAccountId),
          eq(accountRoles.companyId, companyId)
        )
      );
    expect(await leader.whoami()).toBeNull();
  });
});
