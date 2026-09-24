import { TRPCError } from "@trpc/server";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import {
  accessAuditLog,
  accounts,
  accountRoles,
  companyManagementAccess,
  processes,
  roles,
} from "../../drizzle/schema";
import { getRoleIdBySlug } from "../accountAuth";
import { getDb } from "../db";
import { companyProcedure, router } from "../_core/trpc";

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

export const teamAccessRouter = router({
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

  listProcessLeaders: companyProcedure
    .input(companyInput)
    .query(async ({ input, ctx }) => {
      requireManagerCompany(ctx, input.companyId);
      const db = await getDb();
      if (!db) return [];
      const roleId = await getRoleIdBySlug(db, "process_leader");
      if (roleId == null) return [];

      return db.select({
        accountRoleId: accountRoles.id,
        accountId: accounts.id,
        processId: processes.id,
        processName: processes.name,
        leaderName: accounts.name,
        email: accounts.email,
        status: accountRoles.status,
        accessLevel: companyManagementAccess.accessLevel,
        grantedAt: companyManagementAccess.grantedAt,
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
        .where(and(
          eq(accountRoles.companyId, input.companyId),
          eq(accountRoles.roleId, roleId),
        ))
        .orderBy(asc(processes.name));
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

  suspendProcessLeader: companyProcedure
    .input(companyInput.extend({ processId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      requireManagerCompany(ctx, input.companyId);
      const db = await getDb();
      if (!db) throw new Error("Base de datos no disponible");
      const roleId = await getRoleIdBySlug(db, "process_leader");
      if (roleId == null) throw new Error("No se encontró el rol de Jefe de Proceso");
      const result = await db.update(accountRoles)
        .set({ status: "suspended", suspendedAt: new Date() })
        .where(and(
          eq(accountRoles.companyId, input.companyId),
          eq(accountRoles.processId, input.processId),
          eq(accountRoles.roleId, roleId),
        ));
      if (!result[0]?.affectedRows) throw new Error("No se encontró un Jefe activo para este proceso");
      return { success: true };
    }),

  reactivateProcessLeader: companyProcedure
    .input(companyInput.extend({ processId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      requireManagerCompany(ctx, input.companyId);
      const db = await getDb();
      if (!db) throw new Error("Base de datos no disponible");
      const roleId = await getRoleIdBySlug(db, "process_leader");
      if (roleId == null) throw new Error("No se encontró el rol de Jefe de Proceso");
      const result = await db.update(accountRoles)
        .set({ status: "active", suspendedAt: null })
        .where(and(
          eq(accountRoles.companyId, input.companyId),
          eq(accountRoles.processId, input.processId),
          eq(accountRoles.roleId, roleId),
        ));
      if (!result[0]?.affectedRows) throw new Error("No se encontró un Jefe suspendido para este proceso");
      return { success: true };
    }),

  reassignProcessLeader: companyProcedure
    .input(companyInput.extend({
      fromProcessId: z.number().int().positive(),
      toProcessId: z.number().int().positive(),
    }))
    .mutation(async ({ input, ctx }) => {
      requireManagerCompany(ctx, input.companyId);
      if (input.fromProcessId === input.toProcessId) return { success: true };
      const db = await getDb();
      if (!db) throw new Error("Base de datos no disponible");
      const roleId = await getRoleIdBySlug(db, "process_leader");
      if (roleId == null) throw new Error("No se encontró el rol de Jefe de Proceso");
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
