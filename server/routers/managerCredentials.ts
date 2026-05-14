import { z } from "zod";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { passwordResetTokens, accounts, authInvitations, companies } from "../../drizzle/schema";
import { and, eq, sql } from "drizzle-orm";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { getRoleIdBySlug } from "../accountAuth";
import { accountRoles, companyManagers } from "../../drizzle/schema";

export const managerCredentialsRouter = router({
  setInitialPassword: publicProcedure
    .input(
      z
        .object({
          invitationToken: z.string().min(1, "Invitation token is required"),
          password: z
            .string()
            .min(8, "Password must be at least 8 characters")
            .regex(
              /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[a-zA-Z\d@$!%*?&]/,
              "Password must contain uppercase, lowercase, number, and special character"
            ),
          confirmPassword: z.string(),
        })
        .refine((data: { password: string; confirmPassword: string }) => data.password === data.confirmPassword, {
          message: "Passwords do not match",
          path: ["confirmPassword"],
        })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const invitation = await db
        .select()
        .from(authInvitations)
        .where(
          and(eq(authInvitations.invitationToken, input.invitationToken), eq(authInvitations.kind, "manager"))
        )
        .limit(1);

      if (!invitation.length) {
        throw new Error("Invalid or expired invitation token");
      }

      const inv = invitation[0];
      if (new Date(inv.expiresAt) < new Date()) {
        throw new Error("Invitation token has expired");
      }
      if (inv.acceptedAt) {
        throw new Error("This invitation has already been used");
      }
      if (inv.companyId == null) {
        throw new Error("Invalid invitation");
      }

      const company = await db.select().from(companies).where(eq(companies.id, inv.companyId)).limit(1);
      if (!company.length) {
        throw new Error("Company not found");
      }

      const emailNorm = inv.email.trim().toLowerCase();
      const existingAcc = await db
        .select()
        .from(accounts)
        .where(sql`LOWER(${accounts.email}) = ${emailNorm}`)
        .limit(1);

      const passwordHash = await bcrypt.hash(input.password, 10);
      let account = existingAcc[0];

      if (account) {
        await db
          .update(accounts)
          .set({
            passwordHash,
            loginMethod: "local",
            status: "active",
            updatedAt: new Date(),
          })
          .where(eq(accounts.id, account.id));

        const updated = await db.select().from(accounts).where(eq(accounts.id, account.id)).limit(1);
        account = updated[0];
      } else {
        const openId = `local:mgr-${crypto.randomBytes(16).toString("hex")}`;
        await db.insert(accounts).values({
          openId,
          email: inv.email,
          passwordHash,
          loginMethod: "local",
          status: "active",
        });
        const created = await db.select().from(accounts).where(eq(accounts.openId, openId)).limit(1);
        account = created[0];
      }

      if (!account) throw new Error("Failed to create or update account");

      const roleId = await getRoleIdBySlug(db, "company_manager");
      if (roleId == null) throw new Error("company_manager role not seeded");
      const existingRole = await db
        .select()
        .from(accountRoles)
        .where(
          and(
            eq(accountRoles.accountId, account.id),
            eq(accountRoles.roleId, roleId),
            eq(accountRoles.companyId, inv.companyId),
            eq(accountRoles.processId, 0)
          )
        )
        .limit(1);

      if (!existingRole.length) {
        await db.insert(accountRoles).values({
          accountId: account.id,
          roleId,
          companyId: inv.companyId,
          processId: 0,
        });
      }

      const existingManager = await db
        .select()
        .from(companyManagers)
        .where(and(eq(companyManagers.companyId, inv.companyId), eq(companyManagers.accountId, account.id)))
        .limit(1);
      if (!existingManager.length) {
        await db.insert(companyManagers).values({ companyId: inv.companyId, accountId: account.id });
      }

      await db
        .update(authInvitations)
        .set({ acceptedAt: new Date(), updatedAt: new Date() })
        .where(eq(authInvitations.id, inv.id));

      return {
        success: true,
        companyId: inv.companyId,
        managerEmail: inv.email,
        companyName: company[0].name,
      };
    }),

  changePassword: protectedProcedure
    .input(
      z
        .object({
          currentPassword: z.string().min(1, "Current password is required"),
          newPassword: z
            .string()
            .min(8, "Password must be at least 8 characters")
            .regex(
              /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[a-zA-Z\d@$!%*?&]/,
              "Password must contain uppercase, lowercase, number, and special character"
            ),
          confirmPassword: z.string(),
        })
        .refine((data: { newPassword: string; confirmPassword: string }) => data.newPassword === data.confirmPassword, {
          message: "Passwords do not match",
          path: ["confirmPassword"],
        })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      if (!ctx.user) throw new Error("Unauthorized");

      const row = await db.select().from(accounts).where(eq(accounts.id, ctx.user.id)).limit(1);
      if (!row[0]?.passwordHash) {
        throw new Error("Password login not enabled for this account");
      }
      const ok = await bcrypt.compare(input.currentPassword, row[0].passwordHash);
      if (!ok) throw new Error("Current password is incorrect");

      const passwordHash = await bcrypt.hash(input.newPassword, 10);
      await db
        .update(accounts)
        .set({ passwordHash, updatedAt: new Date() })
        .where(eq(accounts.id, ctx.user.id));

      return { success: true, message: "Password changed successfully" };
    }),

  requestPasswordReset: publicProcedure
    .input(z.object({ email: z.string().email("Invalid email") }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const e = input.email.trim().toLowerCase();
      const acc = await db
        .select()
        .from(accounts)
        .where(sql`LOWER(${accounts.email}) = ${e}`)
        .limit(1);

      if (!acc.length || !acc[0].passwordHash) {
        return { success: true, message: "If email exists, reset link will be sent" };
      }

      const resetToken = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 1);

      await db.insert(passwordResetTokens).values({
        accountId: acc[0].id,
        email: input.email,
        token: resetToken,
        tokenType: "password_reset",
        expiresAt,
      });

      return { success: true, message: "If email exists, reset link will be sent" };
    }),

  resetPassword: publicProcedure
    .input(
      z
        .object({
          resetToken: z.string().min(1, "Reset token is required"),
          newPassword: z
            .string()
            .min(8, "Password must be at least 8 characters")
            .regex(
              /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[a-zA-Z\d@$!%*?&]/,
              "Password must contain uppercase, lowercase, number, and special character"
            ),
          confirmPassword: z.string(),
        })
        .refine((data: { newPassword: string; confirmPassword: string }) => data.newPassword === data.confirmPassword, {
          message: "Passwords do not match",
          path: ["confirmPassword"],
        })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const resetTokenRecord = await db
        .select()
        .from(passwordResetTokens)
        .where(eq(passwordResetTokens.token, input.resetToken))
        .limit(1);

      if (!resetTokenRecord.length) {
        throw new Error("Invalid or expired reset token");
      }

      const tokenRecord = resetTokenRecord[0];
      if (new Date(tokenRecord.expiresAt) < new Date()) {
        throw new Error("Reset token has expired");
      }

      const accountId = tokenRecord.accountId;
      if (!accountId && !tokenRecord.email) {
        throw new Error("Invalid token record");
      }

      let acc =
        accountId != null
          ? await db.select().from(accounts).where(eq(accounts.id, accountId)).limit(1)
          : await db
              .select()
              .from(accounts)
              .where(sql`LOWER(${accounts.email}) = ${(tokenRecord.email || "").trim().toLowerCase()}`)
              .limit(1);

      if (!acc.length) {
        throw new Error("Account not found");
      }

      const passwordHash = await bcrypt.hash(input.newPassword, 10);
      await db
        .update(accounts)
        .set({ passwordHash, updatedAt: new Date() })
        .where(eq(accounts.id, acc[0].id));

      await db.delete(passwordResetTokens).where(eq(passwordResetTokens.id, tokenRecord.id));

      return { success: true, message: "Password reset successfully" };
    }),
});
