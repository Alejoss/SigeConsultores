import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { companies, accounts, accountRoles } from "../../drizzle/schema";
import { and, eq, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { getRoleIdBySlug } from "../accountAuth";

async function getManagerAccountForCompany(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, companyId: number) {
  const roleId = await getRoleIdBySlug(db, "company_manager");
  if (roleId == null) return null;
  const row = await db
    .select({ account: accounts })
    .from(accountRoles)
    .innerJoin(accounts, eq(accountRoles.accountId, accounts.id))
    .where(
      and(
        eq(accountRoles.roleId, roleId),
        eq(accountRoles.companyId, companyId),
        eq(accountRoles.processId, 0)
      )
    )
    .limit(1);
  return row[0]?.account ?? null;
}

export const managerAuthRouter = router({
  login: publicProcedure
    .input(
      z.object({
        email: z.string().email(),
        password: z.string().min(8, "Contrasena debe tener al menos 8 caracteres"),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const emailNorm = input.email.trim().toLowerCase();
      const accRows = await db
        .select()
        .from(accounts)
        .where(sql`LOWER(${accounts.email}) = ${emailNorm}`)
        .limit(1);

      if (!accRows.length || !accRows[0].passwordHash) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Email o contraseña incorrectos" });
      }

      const acc = accRows[0];
      const roleId = await getRoleIdBySlug(db, "company_manager");
      if (roleId == null) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Rol no configurado" });
      }

      const scope = await db
        .select()
        .from(accountRoles)
        .where(and(eq(accountRoles.accountId, acc.id), eq(accountRoles.roleId, roleId)))
        .limit(1);

      if (!scope.length || !scope[0].companyId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Email o contraseña incorrectos" });
      }

      const ok = await bcrypt.compare(input.password, acc.passwordHash);
      if (!ok) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Email o contraseña incorrectos" });
      }

      const company = await db
        .select()
        .from(companies)
        .where(eq(companies.id, scope[0].companyId))
        .limit(1);

      if (!company.length) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Empresa no encontrada" });
      }

      return {
        companyId: company[0].id,
        companyName: company[0].name,
        managerEmail: acc.email!,
      };
    }),

  getCompanyInfo: publicProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const company = await db
        .select()
        .from(companies)
        .where(eq(companies.id, input.companyId))
        .limit(1);

      if (!company.length) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Empresa no encontrada" });
      }

      return company[0];
    }),

  listCompanies: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    return db.select().from(companies);
  }),

  updateManagerEmail: publicProcedure
    .input(
      z.object({
        companyId: z.number(),
        newEmail: z.string().email(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const acc = await getManagerAccountForCompany(db, input.companyId);
      if (!acc) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Credenciales no encontradas" });
      }

      await db
        .update(accounts)
        .set({ email: input.newEmail, updatedAt: new Date() })
        .where(eq(accounts.id, acc.id));

      return { success: true, message: "Email actualizado correctamente" };
    }),

  updateManagerPassword: publicProcedure
    .input(
      z.object({
        companyId: z.number(),
        currentPassword: z.string(),
        newPassword: z.string().min(12),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const acc = await getManagerAccountForCompany(db, input.companyId);
      if (!acc?.passwordHash) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Credenciales no encontradas" });
      }

      const passwordMatch = await bcrypt.compare(input.currentPassword, acc.passwordHash);
      if (!passwordMatch) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Contraseña actual incorrecta" });
      }

      const newPasswordHash = await bcrypt.hash(input.newPassword, 10);
      await db
        .update(accounts)
        .set({ passwordHash: newPasswordHash, updatedAt: new Date() })
        .where(eq(accounts.id, acc.id));

      return { success: true, message: "Contraseña actualizada correctamente" };
    }),
});
