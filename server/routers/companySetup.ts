import { z } from "zod";
import { getDb } from "../db";
import {
  authInvitations,
  accounts,
  accountRoles,
  userCompanyAccess,
  companyManagers,
  companyAccessRequests,
  companies,
} from "../../drizzle/schema";
import { and, eq, sql } from "drizzle-orm";
import { publicProcedure, router } from "../_core/trpc";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { getRoleIdBySlug } from "../accountAuth";

export const companySetupRouter = router({
  completeSetup: publicProcedure
    .input(
      z.object({
        token: z.string(),
        firstName: z.string().min(1),
        lastName: z.string().min(1),
        password: z.string().min(8),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const invitation = await db
        .select()
        .from(authInvitations)
        .where(and(eq(authInvitations.invitationToken, input.token), eq(authInvitations.kind, "company_setup")))
        .limit(1);

      if (!invitation.length) {
        throw new Error("Token de invitación inválido o expirado");
      }

      const inv = invitation[0];

      if (new Date() > inv.expiresAt) {
        throw new Error("Token de invitación expirado");
      }

      if (inv.acceptedAt) {
        throw new Error("Este token de invitación ya ha sido utilizado");
      }

      const reqId = inv.companyAccessRequestId;
      if (reqId == null) {
        throw new Error("Invitación inválida");
      }

      const accessRequest = await db
        .select()
        .from(companyAccessRequests)
        .where(eq(companyAccessRequests.id, reqId))
        .limit(1);

      if (!accessRequest.length) {
        throw new Error("Solicitud de acceso no encontrada");
      }

      const companyName = accessRequest[0].companyName;

      const company = await db.select().from(companies).where(eq(companies.name, companyName)).limit(1);

      if (!company.length) {
        throw new Error("Empresa no encontrada");
      }

      const companyId = company[0].id;
      const userEmail = inv.email;
      const emailNorm = userEmail.trim().toLowerCase();

      const passwordHash = await bcrypt.hash(input.password, 10);
      const displayName = `${input.firstName} ${input.lastName}`.trim();

      let accRows = await db
        .select()
        .from(accounts)
        .where(sql`LOWER(${accounts.email}) = ${emailNorm}`)
        .limit(1);

      let account = accRows[0];
      if (!account) {
        const openId = `local:setup-${randomBytes(12).toString("hex")}`;
        await db.insert(accounts).values({
          openId,
          email: userEmail,
          name: displayName,
          passwordHash,
          status: "active",
        });
        accRows = await db.select().from(accounts).where(eq(accounts.openId, openId)).limit(1);
        account = accRows[0];
      } else {
        await db
          .update(accounts)
          .set({ name: displayName, passwordHash, updatedAt: new Date() })
          .where(eq(accounts.id, account.id));
      }

      if (!account) throw new Error("No se pudo crear la cuenta");

      const cmRoleId = await getRoleIdBySlug(db, "company_manager");
      if (cmRoleId == null) throw new Error("Rol company_manager no configurado");

      const existingRole = await db
        .select()
        .from(accountRoles)
        .where(
          and(
            eq(accountRoles.accountId, account.id),
            eq(accountRoles.roleId, cmRoleId),
            eq(accountRoles.companyId, companyId)
          )
        )
        .limit(1);

      if (!existingRole.length) {
        await db.insert(accountRoles).values({
          accountId: account.id,
          roleId: cmRoleId,
          companyId,
          processId: 0,
        });
      }

      await db
        .insert(userCompanyAccess)
        .values({
          accountId: account.id,
          companyId,
          role: "manager",
        })
        .onDuplicateKeyUpdate({
          set: { role: "manager", updatedAt: new Date() },
        });

      const existingMgr = await db
        .select()
        .from(companyManagers)
        .where(and(eq(companyManagers.companyId, companyId), eq(companyManagers.accountId, account.id)))
        .limit(1);
      if (!existingMgr.length) {
        await db.insert(companyManagers).values({ companyId, accountId: account.id });
      }

      await db
        .update(authInvitations)
        .set({ acceptedAt: new Date(), updatedAt: new Date(), companyId })
        .where(eq(authInvitations.id, inv.id));

      return {
        success: true,
        message: "Configuración completada exitosamente",
        accountId: account.id,
        companyId,
      };
    }),
});
