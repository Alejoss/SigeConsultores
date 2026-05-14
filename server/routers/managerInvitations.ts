import { z } from "zod";
import { adminProcedure, publicProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  authInvitations,
  companies,
  accounts,
  accountRoles,
  companyManagers,
} from "../../drizzle/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { randomBytes } from "crypto";
import { sendManagerAccessInvitationEmail, sendManagerAccessConfirmationEmail } from "../_core/emailService";
import { TRPCError } from "@trpc/server";
import bcrypt from "bcryptjs";
import { getRoleIdBySlug } from "../accountAuth";

function generateToken(): string {
  return randomBytes(32).toString("hex");
}

export const managerInvitationsRouter = router({
  create: adminProcedure
    .input(
      z.object({
        companyId: z.number(),
        managerEmail: z.string().email("Email inválido"),
        expirationDays: z.number().min(1).max(365).default(30),
      })
    )
    .mutation(async ({ input, ctx }) => {
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

      const companyName = company[0].name;
      const token = generateToken();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + input.expirationDays);

      await db.insert(authInvitations).values({
        kind: "manager",
        email: input.managerEmail,
        invitationToken: token,
        companyId: input.companyId,
        expiresAt,
      });

      const protocol = ctx.req.protocol || "https";
      const host = ctx.req.get("host") || ctx.req.get("x-forwarded-host") || "localhost:3000";
      const frontendUrl = `${protocol}://${host}`;

      sendManagerAccessInvitationEmail(
        input.managerEmail,
        companyName,
        token,
        input.expirationDays,
        frontendUrl
      );

      console.log("[managerInvitations.create] Queued manager invitation email (async via EmailService)", {
        companyId: input.companyId,
        companyName,
        toDomain: input.managerEmail.split("@")[1] ?? "?",
        frontendUrl,
        expiresAt: expiresAt.toISOString(),
      });

      return {
        success: true,
        token,
        invitationUrl: `${frontendUrl}/setup-password?token=${token}`,
        expiresAt,
        emailSent: true,
        message: `Invitación creada. Email siendo enviado a ${input.managerEmail}`,
      };
    }),

  getByToken: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const invitation = await db
        .select()
        .from(authInvitations)
        .where(
          and(eq(authInvitations.invitationToken, input.token), eq(authInvitations.kind, "manager"))
        )
        .limit(1);

      if (!invitation.length) {
        return { valid: false as const, message: "Invitación no encontrada o expirada" };
      }

      const inv = invitation[0];
      if (new Date() > inv.expiresAt) {
        return { valid: false as const, message: "Invitación expirada" };
      }
      if (inv.acceptedAt) {
        return { valid: false as const, message: "Invitación ya fue aceptada" };
      }

      return {
        valid: true as const,
        invitation: {
          id: inv.id,
          companyId: inv.companyId,
          managerEmail: inv.email,
          expiresAt: inv.expiresAt,
        },
      };
    }),

  accept: publicProcedure
    .input(
      z.object({
        token: z.string(),
        password: z.string().min(12, "Password must be at least 12 characters"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const invitation = await db
        .select()
        .from(authInvitations)
        .where(
          and(eq(authInvitations.invitationToken, input.token), eq(authInvitations.kind, "manager"))
        )
        .limit(1);

      if (!invitation.length) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Invitación no encontrada" });
      }

      const inv = invitation[0];
      const cid = inv.companyId;
      if (cid == null) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invitación inválida" });
      }
      const companyData = await db.select().from(companies).where(eq(companies.id, cid)).limit(1);
      if (!companyData.length) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Empresa no encontrada" });
      }
      const companyName = companyData[0].name;

      if (new Date() > inv.expiresAt) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invitación expirada" });
      }
      if (inv.acceptedAt) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invitación ya fue aceptada" });
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
        const openId = `local:mgr-${randomBytes(16).toString("hex")}`;
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

      if (!account) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "No se pudo crear o actualizar la cuenta" });
      }

      const roleId = await getRoleIdBySlug(db, "company_manager");
      if (roleId == null) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Rol company_manager no configurado" });
      }

      const existingRole = await db
        .select()
        .from(accountRoles)
        .where(
          and(
            eq(accountRoles.accountId, account.id),
            eq(accountRoles.roleId, roleId),
            eq(accountRoles.companyId, cid),
            eq(accountRoles.processId, 0)
          )
        )
        .limit(1);
      if (!existingRole.length) {
        await db.insert(accountRoles).values({
          accountId: account.id,
          roleId,
          companyId: cid,
          processId: 0,
        });
      }

      const existingManager = await db
        .select()
        .from(companyManagers)
        .where(and(eq(companyManagers.companyId, cid), eq(companyManagers.accountId, account.id)))
        .limit(1);
      if (!existingManager.length) {
        await db.insert(companyManagers).values({
          companyId: cid,
          accountId: account.id,
        });
      }

      await db
        .update(authInvitations)
        .set({ acceptedAt: new Date(), updatedAt: new Date() })
        .where(eq(authInvitations.id, inv.id));

      const protocol = ctx.req.protocol || "https";
      const host = ctx.req.get("host") || ctx.req.get("x-forwarded-host") || "localhost:3000";
      const frontendUrl = `${protocol}://${host}`;

      const confirmationEmailSent = await sendManagerAccessConfirmationEmail(
        inv.email,
        companyName,
        frontendUrl
      );

      return {
        success: true,
        companyId: cid,
        managerEmail: inv.email,
        message: confirmationEmailSent
          ? "Invitación aceptada exitosamente. Revisa tu correo para obtener el link de acceso a la plataforma."
          : "Invitación aceptada exitosamente. Puedes ingresar con tu correo y contraseña en /login.",
      };
    }),

  listByCompany: adminProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const rows = await db
        .select()
        .from(authInvitations)
        .where(and(eq(authInvitations.companyId, input.companyId), eq(authInvitations.kind, "manager")))
        .orderBy(desc(authInvitations.createdAt));

      return rows.map((r) => ({
        id: r.id,
        companyId: r.companyId,
        managerEmail: r.email,
        invitationToken: r.invitationToken,
        expiresAt: r.expiresAt,
        acceptedAt: r.acceptedAt,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      }));
    }),

  revoke: adminProcedure
    .input(z.object({ invitationId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      await db.delete(authInvitations).where(eq(authInvitations.id, input.invitationId));

      return { success: true, message: "Invitación revocada exitosamente" };
    }),
});
