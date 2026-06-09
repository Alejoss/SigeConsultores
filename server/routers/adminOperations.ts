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
  procedures,
  procedureRecords,
  documents,
  managementSystemFiles,
  auditFiles,
  inspectionFiles,
} from "../../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, companyProcedure, publicProcedure, router } from "../_core/trpc";
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

  /**
   * Calcula el uso de almacenamiento de una empresa sumando todos los archivos
   */
  getStorageUsage: adminProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      return calcStorageUsage(db, input.companyId);
    }),

  /**
   * Uso de almacenamiento de todas las empresas (panel admin)
   */
  getAllStorageUsage: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const allCompanies = await db
      .select({ id: companies.id, name: companies.name, storageLimitMb: companies.storageLimitMb, status: companies.status })
      .from(companies)
      .orderBy(companies.name);

    const results = [];
    for (const company of allCompanies) {
      const usage = await calcStorageUsage(db, company.id);
      results.push({ id: company.id, name: company.name, status: company.status, ...usage });
    }
    return results;
  }),

  /**
   * Actualiza el límite de almacenamiento de una empresa (solo admin)
   */
  setStorageLimit: adminProcedure
    .input(z.object({ companyId: z.number(), limitMb: z.number().min(50).max(100000) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      await db
        .update(companies)
        .set({ storageLimitMb: input.limitMb })
        .where(eq(companies.id, input.companyId));
      return { ok: true };
    }),

  /**
   * Uso de almacenamiento del cliente autenticado (para el dashboard del cliente)
   */
  getMyStorageUsage: companyProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      return calcStorageUsage(db, input.companyId);
    }),
});

/**
 * Función auxiliar: suma todos los bytes de archivos de una empresa
 */
async function calcStorageUsage(db: Awaited<ReturnType<typeof getDb>>, companyId: number) {
  if (!db) throw new Error("Database not available");

  const companyProcesses = await db
    .select({ id: processes.id })
    .from(processes)
    .where(eq(processes.companyId, companyId));
  const processIds = companyProcesses.map((p) => p.id);

  let totalBytes = 0;

  for (const pid of processIds) {
    // Procedimientos (archivo principal + flujograma)
    const procs = await db
      .select({ procedureFileSizeBytes: procedures.procedureFileSizeBytes, flowchartFileSizeBytes: procedures.flowchartFileSizeBytes })
      .from(procedures)
      .where(eq(procedures.processId, pid));
    for (const p of procs) totalBytes += (p.procedureFileSizeBytes || 0) + (p.flowchartFileSizeBytes || 0);

    // Registros de procedimientos
    const procIds = (await db.select({ id: procedures.id }).from(procedures).where(eq(procedures.processId, pid))).map((x) => x.id);
    for (const procId of procIds) {
      const recs = await db.select({ fileSizeBytes: procedureRecords.fileSizeBytes }).from(procedureRecords).where(eq(procedureRecords.procedureId, procId));
      for (const r of recs) totalBytes += r.fileSizeBytes || 0;
    }

    // Documentos
    const docs = await db.select({ fileSizeBytes: documents.fileSizeBytes }).from(documents).where(eq(documents.processId, pid));
    for (const d of docs) totalBytes += d.fileSizeBytes || 0;
  }

  // Archivos de sistemas de gestión
  const mgmtFiles = await db.select({ fileSizeBytes: managementSystemFiles.fileSizeBytes }).from(managementSystemFiles).where(eq(managementSystemFiles.companyId, companyId));
  for (const f of mgmtFiles) totalBytes += f.fileSizeBytes || 0;

  // Archivos de auditorías
  const auditFileRows = await db.select({ fileSizeBytes: auditFiles.fileSizeBytes }).from(auditFiles).where(eq(auditFiles.companyId, companyId));
  for (const f of auditFileRows) totalBytes += f.fileSizeBytes || 0;

  // Archivos de inspecciones
  const inspFileRows = await db.select({ fileSizeBytes: inspectionFiles.fileSizeBytes }).from(inspectionFiles).where(eq(inspectionFiles.companyId, companyId));
  for (const f of inspFileRows) totalBytes += f.fileSizeBytes || 0;

  // Límite de la empresa
  const companyRow = await db
    .select({ storageLimitMb: companies.storageLimitMb })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  const storageLimitMb = companyRow[0]?.storageLimitMb ?? 500;

  return {
    usedBytes: totalBytes,
    usedMb: Math.round((totalBytes / (1024 * 1024)) * 100) / 100,
    limitMb: storageLimitMb,
    percentUsed: storageLimitMb > 0 ? Math.round((totalBytes / (storageLimitMb * 1024 * 1024)) * 100) : 0,
  };
}
