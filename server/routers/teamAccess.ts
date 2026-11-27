import { TRPCError } from "@trpc/server";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import {
  accessAuditLog,
  accounts,
  accountRoles,
  companyManagementAccess,
  companyOnlineCourseAccess,
  companyOnlineCourseAccessAudit,
  companyTeamModuleAccess,
  companyTeamProcessAccess,
  companyTeamAccessAudit,
  processes,
  roles,
} from "../../drizzle/schema";
import { getRoleIdBySlug } from "../accountAuth";
import { getDb as getRequestDb } from "../db";
import { companyProcedure, router } from "../_core/trpc";
import { withoutAnnualScope } from "../annual/runtime";
import { TEAM_MODULE_KEYS, TEAM_ACCESS_LEVELS } from "../../shared/teamAccess";
import { buildTeamAccessPolicy, getDetailedTeamAccess, hydrateTeamAccessPolicy } from "../_core/teamAccessPolicy";

// Grants, role assignments, and leader catalog never live in annual namespaces.
const getDb = () => withoutAnnualScope(() => getRequestDb());

const companyInput = z.object({ companyId: z.number().int().positive() });

function requireManagerCompany(ctx: { manager: { companyId: number } | null }, companyId: number) {
  if (!ctx.manager || ctx.manager.companyId !== companyId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Solo el Gerente de esta empresa puede gestionar los accesos del equipo." });
  }
}

function requireProcessLeader(ctx: { processLeader: { processId: number } | null }, processId: number) {
  if (!ctx.processLeader || ctx.processLeader.processId !== processId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Solo el Jefe asignado a este proceso puede actualizar su cuenta." });
  }
}

async function resolveLeaderAssignment(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, input: {
  companyId: number; processId: number; accountId?: number;
}, roleId: number) {
  const matches = await db.select({ id: accountRoles.id }).from(accountRoles)
    .innerJoin(processes, eq(accountRoles.processId, processes.id))
    .where(and(eq(accountRoles.companyId, input.companyId), eq(processes.companyId, input.companyId),
      eq(accountRoles.processId, input.processId), eq(accountRoles.roleId, roleId),
      input.accountId !== undefined ? eq(accountRoles.accountId, input.accountId) : undefined));
  if (!matches.length) throw new TRPCError({ code: "NOT_FOUND", message: "No se encontró el Jefe de Proceso de esta empresa." });
  if (matches.length > 1) throw new TRPCError({ code: "BAD_REQUEST", message: "Este proceso tiene varios Jefes. Seleccione la cuenta que desea modificar." });
  return matches[0];
}

export const teamAccessRouter = router({
  getMyDetailedAccess: companyProcedure
    .input(companyInput)
    .query(async ({ input, ctx }) => {
      const policy = ctx.teamAccessPolicy?.companyId === input.companyId
        ? ctx.teamAccessPolicy : await hydrateTeamAccessPolicy(ctx, input.companyId);
      if (!policy) throw new TRPCError({ code: "FORBIDDEN", message: "No tiene acceso a esta empresa." });
      return getDetailedTeamAccess(policy);
    }),

  setDetailedAccess: companyProcedure
    .input(companyInput.extend({
      accountId: z.number().int().positive(),
      moduleChanges: z.array(z.object({ module: z.enum(TEAM_MODULE_KEYS), accessLevel: z.enum(TEAM_ACCESS_LEVELS) })).max(TEAM_MODULE_KEYS.length),
      processAccess: z.array(z.object({ processId: z.number().int().positive(), accessLevel: z.enum(["read", "write"]).default("read") })).max(5000).optional(),
    }).superRefine((value, ctx) => {
      if (new Set(value.moduleChanges.map(row => row.module)).size !== value.moduleChanges.length) ctx.addIssue({ code: "custom", message: "No repita módulos en una solicitud." });
      if (value.processAccess && new Set(value.processAccess.map(row => row.processId)).size !== value.processAccess.length) ctx.addIssue({ code: "custom", message: "No repita procesos en una solicitud." });
    }))
    .mutation(async ({ input, ctx }) => {
      requireManagerCompany(ctx, input.companyId);
      const db = await getDb();
      if (!db) throw new Error("Base de datos no disponible");
      const roleId = await getRoleIdBySlug(db, "process_leader");
      if (roleId == null) throw new Error("No se encontró el rol de Jefe de Proceso");
      await db.transaction(async tx => {
        // Serialize grant replacements for the same account, across managers/batches.
        const [account] = await tx.select({ id: accounts.id }).from(accounts)
          .where(and(eq(accounts.id, input.accountId), eq(accounts.status, "active"))).limit(1).for("update");
        if (!account) throw new TRPCError({ code: "NOT_FOUND", message: "Cuenta activa no encontrada." });
        const assignments = await tx.select({ processId: accountRoles.processId }).from(accountRoles)
          .innerJoin(processes, eq(accountRoles.processId, processes.id))
          .where(and(eq(accountRoles.accountId, input.accountId), eq(accountRoles.companyId, input.companyId),
            eq(accountRoles.roleId, roleId), eq(accountRoles.status, "active"), eq(processes.companyId, input.companyId))).for("update");
        if (!assignments.length) throw new TRPCError({ code: "NOT_FOUND", message: "El Jefe de Proceso activo no pertenece a esta empresa." });
        const catalog = await tx.select({ id: processes.id }).from(processes).where(eq(processes.companyId, input.companyId));
        const validIds = new Set(catalog.map(row => row.id));
        if (input.processAccess?.some(row => !validIds.has(row.processId))) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Todos los procesos autorizados deben pertenecer a esta empresa." });
        }
        const [actor] = await tx.select({ id: accounts.id }).from(accounts).where(eq(accounts.email, ctx.manager!.managerEmail)).limit(1);
        const moduleScope = and(eq(companyTeamModuleAccess.companyId, input.companyId), eq(companyTeamModuleAccess.accountId, input.accountId));
        const processScope = and(eq(companyTeamProcessAccess.companyId, input.companyId), eq(companyTeamProcessAccess.accountId, input.accountId));
        const before = {
          moduleAccess: await tx.select().from(companyTeamModuleAccess).where(moduleScope),
          processAccess: await tx.select().from(companyTeamProcessAccess).where(processScope),
        };
        const now = new Date();
        for (const change of input.moduleChanges) {
          await tx.insert(companyTeamModuleAccess).values({
            companyId: input.companyId, accountId: input.accountId, ...change, grantedByAccountId: actor?.id ?? null,
          }).onDuplicateKeyUpdate({ set: { accessLevel: change.accessLevel, grantedByAccountId: actor?.id ?? null, updatedAt: now } });
        }
        if (input.processAccess !== undefined) {
          await tx.delete(companyTeamProcessAccess).where(processScope);
          const ownIds = new Set(assignments.map(row => row.processId));
          const extras = input.processAccess.filter(row => !ownIds.has(row.processId));
          if (extras.length) await tx.insert(companyTeamProcessAccess).values(extras.map(row => ({
            ...row, companyId: input.companyId, accountId: input.accountId, grantedByAccountId: actor?.id ?? null,
          })));
        }
        const after = {
          moduleAccess: await tx.select().from(companyTeamModuleAccess).where(moduleScope),
          processAccess: await tx.select().from(companyTeamProcessAccess).where(processScope),
        };
        await tx.insert(companyTeamAccessAudit).values({
          companyId: input.companyId, accountId: input.accountId, performedByAccountId: actor?.id ?? null,
          eventType: "detailed_access_updated", beforeJson: JSON.stringify(before), afterJson: JSON.stringify(after),
        });
      });
      return { success: true as const };
    }),

  getMyCompanyManagementAccess: companyProcedure
    .input(companyInput)
    .query(async ({ input, ctx }) => {
      if (ctx.user?.role === "admin") return { accessLevel: "admin" as const };
      if (ctx.manager?.companyId === input.companyId) return { accessLevel: "manager" as const };
      if (!ctx.processLeader || ctx.processLeader.companyId !== input.companyId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "No tiene acceso a esta empresa." });
      }
      const db = await getDb();
      if (!db) throw new Error("Base de datos no disponible");
      const [access] = await db
        .select({ accessLevel: companyManagementAccess.accessLevel })
        .from(companyManagementAccess)
        .where(
          and(
            eq(companyManagementAccess.companyId, input.companyId),
            eq(companyManagementAccess.accountId, ctx.processLeader.processLeaderId)
          )
        )
        .limit(1);
      return { accessLevel: access?.accessLevel === "coordinator" ? "coordinator" as const : "standard" as const };
    }),

  getMyOnlineCourseManagementAccess: companyProcedure
    .input(companyInput)
    .query(async ({ input, ctx }) => {
      if (ctx.user?.role === "admin") return { accessLevel: "admin" as const };
      if (ctx.manager?.companyId === input.companyId) return { accessLevel: "manager" as const };
      if (!ctx.processLeader || ctx.processLeader.companyId !== input.companyId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "No tiene acceso a esta empresa." });
      }
      const db = await getDb();
      if (!db) throw new Error("Base de datos no disponible");
      const [access] = await db
        .select({ accessLevel: companyOnlineCourseAccess.accessLevel })
        .from(companyOnlineCourseAccess)
        .where(
          and(
            eq(companyOnlineCourseAccess.companyId, input.companyId),
            eq(companyOnlineCourseAccess.accountId, ctx.processLeader.processLeaderId)
          )
        )
        .limit(1);
      return {
        accessLevel:
          access?.accessLevel === "online_course_manager"
            ? ("online_course_manager" as const)
            : ("standard" as const),
      };
    }),

  listProcessLeaders: companyProcedure
    .input(companyInput)
    .query(async ({ input, ctx }) => {
      requireManagerCompany(ctx, input.companyId);
      const db = await getDb();
      if (!db) return [];
      const roleId = await getRoleIdBySlug(db, "process_leader");
      if (roleId == null) return [];

      const leaders = await db.select({
        accountRoleId: accountRoles.id,
        accountId: accounts.id,
        processId: processes.id,
        processName: processes.name,
        leaderName: accounts.name,
        email: accounts.email,
        status: accountRoles.status,
        accessLevel: companyManagementAccess.accessLevel,
        grantedAt: companyManagementAccess.grantedAt,
        onlineCourseAccessLevel: companyOnlineCourseAccess.accessLevel,
        onlineCourseGrantedAt: companyOnlineCourseAccess.grantedAt,
      })
        .from(accountRoles)
        .innerJoin(accounts, eq(accountRoles.accountId, accounts.id))
        .innerJoin(processes, eq(accountRoles.processId, processes.id))
        .leftJoin(
          companyManagementAccess,
          and(
            eq(companyManagementAccess.companyId, input.companyId),
            eq(companyManagementAccess.accountId, accountRoles.accountId)
          )
        )
        .leftJoin(
          companyOnlineCourseAccess,
          and(
            eq(companyOnlineCourseAccess.companyId, input.companyId),
            eq(companyOnlineCourseAccess.accountId, accountRoles.accountId)
          )
        )
        .where(and(
          eq(accountRoles.companyId, input.companyId),
          eq(accountRoles.roleId, roleId),
          eq(processes.companyId, input.companyId),
        ))
        .orderBy(asc(processes.name));
      const [modules, grants, catalog] = await Promise.all([
        db.select().from(companyTeamModuleAccess).where(eq(companyTeamModuleAccess.companyId, input.companyId)),
        db.select().from(companyTeamProcessAccess).where(eq(companyTeamProcessAccess.companyId, input.companyId)),
        db.select({ id: processes.id }).from(processes).where(eq(processes.companyId, input.companyId)),
      ]);
      return leaders.map(leader => ({
        ...leader,
        ...getDetailedTeamAccess(buildTeamAccessPolicy({
          companyId: input.companyId, accountId: leader.accountId, ownProcessId: leader.processId,
          coordinator: leader.accessLevel === "coordinator", companyProcessIds: catalog.map(row => row.id),
          moduleGrants: modules, processGrants: grants,
        })),
      }));
    }),

  /**
   * Autoriza o revoca la edición de módulos corporativos para un Jefe ya
   * asignado. No concede acceso a otros procesos ni gestión de personas.
   */
  setCompanyManagementAccess: companyProcedure
    .input(
      companyInput.extend({
        accountId: z.number().int().positive(),
        accessLevel: z.enum(["standard", "coordinator"]),
      })
    )
    .mutation(async ({ input, ctx }) => {
      requireManagerCompany(ctx, input.companyId);
      const db = await getDb();
      if (!db) throw new Error("Base de datos no disponible");
      const processLeaderRoleId = await getRoleIdBySlug(db, "process_leader");
      if (processLeaderRoleId == null) {
        throw new Error("No se encontró el rol de Jefe de Proceso");
      }

      const [leader] = await db
        .select({ accountId: accountRoles.accountId })
        .from(accountRoles)
        .where(
          and(
            eq(accountRoles.accountId, input.accountId),
            eq(accountRoles.companyId, input.companyId),
            eq(accountRoles.roleId, processLeaderRoleId),
            eq(accountRoles.status, "active")
          )
        )
        .limit(1);
      if (!leader) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "El Jefe de Proceso activo no pertenece a esta empresa.",
        });
      }

      const [managerAccount] = await db
        .select({ id: accounts.id })
        .from(accounts)
        .where(eq(accounts.email, ctx.manager!.managerEmail))
        .limit(1);
      const now = new Date();
      const [existing] = await db
        .select({ id: companyManagementAccess.id })
        .from(companyManagementAccess)
        .where(
          and(
            eq(companyManagementAccess.companyId, input.companyId),
            eq(companyManagementAccess.accountId, input.accountId)
          )
        )
        .limit(1);

      const accessData = {
        accessLevel: input.accessLevel,
        grantedByAccountId: managerAccount?.id ?? null,
        grantedAt: input.accessLevel === "coordinator" ? now : null,
        revokedAt: input.accessLevel === "standard" ? now : null,
      } as const;
      if (existing) {
        await db
          .update(companyManagementAccess)
          .set({ ...accessData, updatedAt: now })
          .where(eq(companyManagementAccess.id, existing.id));
      } else {
        await db.insert(companyManagementAccess).values({
          companyId: input.companyId,
          accountId: input.accountId,
          ...accessData,
        });
      }

      await db.insert(accessAuditLog).values({
        eventType:
          input.accessLevel === "coordinator"
            ? "company_management_access_granted"
            : "company_management_access_revoked",
        companyId: input.companyId,
        accountId: input.accountId,
        description:
          input.accessLevel === "coordinator"
            ? "Jefe autorizado como Coordinador de empresa sin acceso a otros procesos ni gestión de personas."
            : "Autorización de Coordinador de empresa revocada; conserva la gestión de su propio proceso.",
      });

      return { success: true, accessLevel: input.accessLevel };
    }),

  /**
   * Autoriza o revoca únicamente el panel de Capacitaciones en Línea para un
   * Jefe activo de esta empresa. No modifica Coordinación ni roles de ISGE.
   */
  setOnlineCourseManagementAccess: companyProcedure
    .input(
      companyInput.extend({
        accountId: z.number().int().positive(),
        accessLevel: z.enum(["standard", "online_course_manager"]),
      })
    )
    .mutation(async ({ input, ctx }) => {
      requireManagerCompany(ctx, input.companyId);
      const db = await getDb();
      if (!db) throw new Error("Base de datos no disponible");
      const processLeaderRoleId = await getRoleIdBySlug(db, "process_leader");
      if (processLeaderRoleId == null) throw new Error("No se encontró el rol de Jefe de Proceso");
      const [leader] = await db
        .select({ accountId: accountRoles.accountId })
        .from(accountRoles)
        .where(
          and(
            eq(accountRoles.accountId, input.accountId),
            eq(accountRoles.companyId, input.companyId),
            eq(accountRoles.roleId, processLeaderRoleId),
            eq(accountRoles.status, "active")
          )
        )
        .limit(1);
      if (!leader) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "El Jefe de Proceso activo no pertenece a esta empresa.",
        });
      }
      const [managerAccount] = await db
        .select({ id: accounts.id })
        .from(accounts)
        .where(eq(accounts.email, ctx.manager!.managerEmail))
        .limit(1);
      const now = new Date();
      const [existing] = await db
        .select({ id: companyOnlineCourseAccess.id })
        .from(companyOnlineCourseAccess)
        .where(
          and(
            eq(companyOnlineCourseAccess.companyId, input.companyId),
            eq(companyOnlineCourseAccess.accountId, input.accountId)
          )
        )
        .limit(1);
      const accessData = {
        accessLevel: input.accessLevel,
        grantedByAccountId: managerAccount?.id ?? null,
        grantedAt: input.accessLevel === "online_course_manager" ? now : null,
        revokedAt: input.accessLevel === "standard" ? now : null,
      } as const;
      if (existing) {
        await db
          .update(companyOnlineCourseAccess)
          .set({ ...accessData, updatedAt: now })
          .where(eq(companyOnlineCourseAccess.id, existing.id));
      } else {
        await db.insert(companyOnlineCourseAccess).values({
          companyId: input.companyId,
          accountId: input.accountId,
          ...accessData,
        });
      }
      await db.insert(companyOnlineCourseAccessAudit).values({
        eventType:
          input.accessLevel === "online_course_manager"
            ? "granted"
            : "revoked",
        companyId: input.companyId,
        accountId: input.accountId,
        performedByAccountId: managerAccount?.id ?? null,
        description:
          input.accessLevel === "online_course_manager"
            ? "Jefe autorizado para administrar únicamente Capacitaciones en Línea de esta empresa."
            : "Autorización de Capacitaciones en Línea revocada; conserva la gestión de su propio proceso.",
      });
      return { success: true, accessLevel: input.accessLevel };
    }),

  suspendProcessLeader: companyProcedure
    .input(companyInput.extend({ processId: z.number().int().positive(), accountId: z.number().int().positive().optional() }))
    .mutation(async ({ input, ctx }) => {
      requireManagerCompany(ctx, input.companyId);
      const db = await getDb();
      if (!db) throw new Error("Base de datos no disponible");
      const roleId = await getRoleIdBySlug(db, "process_leader");
      if (roleId == null) throw new Error("No se encontró el rol de Jefe de Proceso");
      const assignment = await resolveLeaderAssignment(db, input, roleId);
      const result = await db.update(accountRoles)
        .set({ status: "suspended", suspendedAt: new Date() })
        .where(and(
          eq(accountRoles.companyId, input.companyId),
          eq(accountRoles.processId, input.processId),
          eq(accountRoles.roleId, roleId),
          eq(accountRoles.id, assignment.id),
        ));
      if (!result[0]?.affectedRows) throw new Error("No se encontró un Jefe activo para este proceso");
      return { success: true };
    }),

  reactivateProcessLeader: companyProcedure
    .input(companyInput.extend({ processId: z.number().int().positive(), accountId: z.number().int().positive().optional() }))
    .mutation(async ({ input, ctx }) => {
      requireManagerCompany(ctx, input.companyId);
      const db = await getDb();
      if (!db) throw new Error("Base de datos no disponible");
      const roleId = await getRoleIdBySlug(db, "process_leader");
      if (roleId == null) throw new Error("No se encontró el rol de Jefe de Proceso");
      const assignment = await resolveLeaderAssignment(db, input, roleId);
      const result = await db.update(accountRoles)
        .set({ status: "active", suspendedAt: null })
        .where(and(
          eq(accountRoles.companyId, input.companyId),
          eq(accountRoles.processId, input.processId),
          eq(accountRoles.roleId, roleId),
          eq(accountRoles.id, assignment.id),
        ));
      if (!result[0]?.affectedRows) throw new Error("No se encontró un Jefe suspendido para este proceso");
      return { success: true };
    }),

  reassignProcessLeader: companyProcedure
    .input(companyInput.extend({
      fromProcessId: z.number().int().positive(),
      toProcessId: z.number().int().positive(),
      accountId: z.number().int().positive().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      requireManagerCompany(ctx, input.companyId);
      const db = await getDb();
      if (!db) throw new Error("Base de datos no disponible");
      const roleId = await getRoleIdBySlug(db, "process_leader");
      if (roleId == null) throw new Error("No se encontró el rol de Jefe de Proceso");
      const assignment = await resolveLeaderAssignment(db, { ...input, processId: input.fromProcessId }, roleId);
      if (input.fromProcessId === input.toProcessId) return { success: true };
      const target = await db.select({ id: processes.id })
        .from(processes)
        .where(and(eq(processes.id, input.toProcessId), eq(processes.companyId, input.companyId)))
        .limit(1);
      if (!target[0]) throw new Error("El nuevo proceso no pertenece a esta empresa");
      const occupied = await db.select({ id: accountRoles.id })
        .from(accountRoles)
        .where(and(
          eq(accountRoles.companyId, input.companyId),
          eq(accountRoles.processId, input.toProcessId),
          eq(accountRoles.roleId, roleId),
          eq(accountRoles.status, "active"),
        ))
        .limit(1);
      if (occupied[0]) throw new Error("El nuevo proceso ya tiene un Jefe de Proceso activo");
      const result = await db.update(accountRoles)
        .set({ processId: input.toProcessId, status: "active", suspendedAt: null })
        .where(and(
          eq(accountRoles.companyId, input.companyId),
          eq(accountRoles.processId, input.fromProcessId),
          eq(accountRoles.roleId, roleId),
          eq(accountRoles.id, assignment.id),
        ));
      if (!result[0]?.affectedRows) throw new Error("No se encontró el Jefe de Proceso que desea reasignar");
      return { success: true };
    }),

  getMyProfile: companyProcedure
    .input(z.object({ processId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      requireProcessLeader(ctx, input.processId);
      const db = await getDb();
      if (!db) throw new Error("Base de datos no disponible");
      const [row] = await db.select({
        name: accounts.name,
        email: accounts.email,
        companyName: processes.companyId,
        processName: processes.name,
      })
        .from(accounts)
        .innerJoin(accountRoles, eq(accountRoles.accountId, accounts.id))
        .innerJoin(processes, eq(accountRoles.processId, processes.id))
        .where(and(
          eq(accounts.id, ctx.processLeader!.processLeaderId),
          eq(accountRoles.processId, input.processId),
        ))
        .limit(1);
      if (!row) throw new Error("No se encontró el perfil del Jefe de Proceso");
      return {
        name: row.name,
        email: row.email || "",
        companyName: ctx.processLeader!.companyName,
        processName: row.processName,
      };
    }),

  updateMyEmail: companyProcedure
    .input(z.object({ processId: z.number().int().positive(), email: z.string().trim().email().max(320) }))
    .mutation(async ({ input, ctx }) => {
      requireProcessLeader(ctx, input.processId);
      const db = await getDb();
      if (!db) throw new Error("Base de datos no disponible");
      const email = input.email.toLowerCase();
      await db.update(accounts)
        .set({ email, updatedAt: new Date() })
        .where(eq(accounts.id, ctx.processLeader!.processLeaderId));
      return { success: true, email };
    }),

  updateMyName: companyProcedure
    .input(z.object({ processId: z.number().int().positive(), name: z.string().trim().min(2).max(255) }))
    .mutation(async ({ input, ctx }) => {
      requireProcessLeader(ctx, input.processId);
      const db = await getDb();
      if (!db) throw new Error("Base de datos no disponible");
      const name = input.name.trim();
      await db.update(accounts)
        .set({ name, updatedAt: new Date() })
        .where(eq(accounts.id, ctx.processLeader!.processLeaderId));
      return { success: true, name };
    }),
});
