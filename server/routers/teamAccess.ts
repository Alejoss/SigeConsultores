import { TRPCError } from "@trpc/server";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { accounts, accountRoles, processes, roles } from "../../drizzle/schema";
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
      })
        .from(accountRoles)
        .innerJoin(accounts, eq(accountRoles.accountId, accounts.id))
        .innerJoin(processes, eq(accountRoles.processId, processes.id))
        .where(and(
          eq(accountRoles.companyId, input.companyId),
          eq(accountRoles.roleId, roleId),
        ))
        .orderBy(asc(processes.name));
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
