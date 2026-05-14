import {
  companyAccessRequests,
  accessAuditLog,
  companies,
  processes,
  userCompanyAccess,
  processOwners,
  companyManagers,
  accounts,
  accountRoles,
  authInvitations,
} from "../../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { randomBytes } from "crypto";
import { getDb } from "../db";
import { getRoleIdBySlug } from "../accountAuth";

const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user?.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can access this resource" });
  }
  return next({ ctx });
});

export const adminOperationsRouter = router({
  getCompanyAccessRequests: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    return db
      .select({
        id: companyAccessRequests.id,
        companyName: companyAccessRequests.companyName,
        contactName: companyAccessRequests.contactName,
        email: companyAccessRequests.email,
        phone: companyAccessRequests.phone,
        status: companyAccessRequests.status,
        createdAt: companyAccessRequests.createdAt,
        approvalDate: companyAccessRequests.approvalDate,
      })
      .from(companyAccessRequests)
      .orderBy(desc(companyAccessRequests.createdAt));
  }),

  getCompaniesWithStats: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    return db
      .select({
        id: companies.id,
        name: companies.name,
        status: companies.status,
        createdAt: companies.createdAt,
        cancelledAt: companies.cancelledAt,
      })
      .from(companies)
      .orderBy(desc(companies.createdAt));
  }),

  getCompanyManagers: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    return db
      .select({
        id: companyManagers.id,
        accountId: companyManagers.accountId,
        managerEmail: accounts.email,
        companyName: companies.name,
        companyStatus: companies.status,
        isActive: accounts.status,
        createdAt: companyManagers.createdAt,
      })
      .from(companyManagers)
      .innerJoin(accounts, eq(companyManagers.accountId, accounts.id))
      .innerJoin(companies, eq(companyManagers.companyId, companies.id))
      .orderBy(desc(companyManagers.createdAt));
  }),

  getProcessOwners: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    return db
      .select({
        id: processOwners.id,
        companyName: companies.name,
        processName: processes.name,
        accountId: processOwners.accountId,
        createdAt: processOwners.createdAt,
      })
      .from(processOwners)
      .innerJoin(companies, eq(processOwners.companyId, companies.id))
      .innerJoin(processes, eq(processOwners.processId, processes.id))
      .orderBy(desc(processOwners.createdAt));
  }),

  getProcessLeaders: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const plRoleId = await getRoleIdBySlug(db, "process_leader");
    if (plRoleId == null) return [];

    return db
      .select({
        id: accountRoles.id,
        processId: accountRoles.processId,
        leaderEmail: accounts.email,
        leaderName: accounts.name,
        isActive: accounts.status,
        createdAt: accountRoles.createdAt,
      })
      .from(accountRoles)
      .innerJoin(accounts, eq(accountRoles.accountId, accounts.id))
      .where(eq(accountRoles.roleId, plRoleId))
      .orderBy(desc(accountRoles.createdAt));
  }),

  getProcessLeaderInvitations: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const rows = await db
      .select()
      .from(authInvitations)
      .where(eq(authInvitations.kind, "process_leader"))
      .orderBy(desc(authInvitations.createdAt));

    return rows.map((r) => ({
      id: r.id,
      leaderEmail: r.email,
      leaderName: r.inviteeName,
      processId: r.processId,
      expiresAt: r.expiresAt,
      usedAt: r.acceptedAt,
      createdAt: r.createdAt,
    }));
  }),

  deactivateManager: adminProcedure.input(z.object({ managerId: z.number() })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const cm = await db.select().from(companyManagers).where(eq(companyManagers.id, input.managerId)).limit(1);
    if (!cm.length) throw new TRPCError({ code: "NOT_FOUND", message: "Manager not found" });

    const roleId = await getRoleIdBySlug(db, "company_manager");
    if (roleId != null) {
      await db
        .delete(accountRoles)
        .where(
          and(
            eq(accountRoles.accountId, cm[0].accountId),
            eq(accountRoles.roleId, roleId),
            eq(accountRoles.companyId, cm[0].companyId)
          )
        );
    }

    await db.delete(companyManagers).where(eq(companyManagers.id, input.managerId));

    await db.insert(accessAuditLog).values({
      eventType: "company_manager_deactivated",
      companyId: cm[0].companyId,
      accountId: cm[0].accountId,
      description: `Company manager row ${input.managerId} removed`,
    });

    return { success: true };
  }),

  deactivateLeader: adminProcedure.input(z.object({ leaderId: z.number() })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const row = await db.select().from(accountRoles).where(eq(accountRoles.id, input.leaderId)).limit(1);
    if (!row.length) throw new TRPCError({ code: "NOT_FOUND", message: "Assignment not found" });

    await db.delete(accountRoles).where(eq(accountRoles.id, input.leaderId));

    await db.insert(accessAuditLog).values({
      eventType: "process_leader_deactivated",
      description: `Process leader assignment ${input.leaderId} removed by admin`,
    });

    return { success: true };
  }),

  reactivateLeader: protectedProcedure.input(z.object({ leaderId: z.number() })).mutation(async () => {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Reactivar jefe de proceso no está disponible; crea una nueva invitación.",
    });
  }),

  approveAccessRequest: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const request = await db
      .select()
      .from(companyAccessRequests)
      .where(eq(companyAccessRequests.id, input.id))
      .limit(1);

    if (!request.length) throw new Error("Access request not found");

    await db
      .update(companyAccessRequests)
      .set({ status: "approved", approvalDate: new Date() })
      .where(eq(companyAccessRequests.id, input.id));

    const invitationToken = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await db.insert(authInvitations).values({
      kind: "company_setup",
      email: request[0].email,
      invitationToken,
      companyAccessRequestId: input.id,
      expiresAt,
    });

    await db.insert(accessAuditLog).values({
      eventType: "company_approved",
      description: `Access request ID ${input.id} for ${request[0].email} has been approved`,
    });

    return { success: true, invitationToken };
  }),

  rejectAccessRequest: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    await db.update(companyAccessRequests).set({ status: "rejected" }).where(eq(companyAccessRequests.id, input.id));

    await db.insert(accessAuditLog).values({
      eventType: "company_rejected",
      description: `Access request ID ${input.id} has been rejected`,
    });

    return { success: true };
  }),

  getAllCompanies: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    return db
      .select({
        id: companies.id,
        name: companies.name,
        description: companies.description,
      })
      .from(companies)
      .orderBy(companies.name);
  }),

  getUserCompanies: protectedProcedure.input(z.object({ accountId: z.number() })).query(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    if (ctx.user?.role === "admin") {
      return db
        .select({
          id: companies.id,
          name: companies.name,
          description: companies.description,
        })
        .from(companies)
        .orderBy(companies.name);
    }

    return db
      .select({
        id: companies.id,
        name: companies.name,
        description: companies.description,
      })
      .from(companies)
      .innerJoin(userCompanyAccess, eq(companies.id, userCompanyAccess.companyId))
      .where(eq(userCompanyAccess.accountId, input.accountId))
      .orderBy(companies.name);
  }),

  getCompanyById: publicProcedure.input(z.object({ companyId: z.number() })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const company = await db.select().from(companies).where(eq(companies.id, input.companyId)).limit(1);

    return company.length > 0 ? company[0] : null;
  }),
});
