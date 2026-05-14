import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { publicProcedure, protectedProcedure, companyProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { ENV } from "../_core/env";
import {
  authInvitations,
  accessAuditLog,
  processes,
  companies,
  accounts,
  accountRoles,
} from "../../drizzle/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { notifyOwner } from "../_core/notification";
import { sendAccessInvitationEmail } from "../_core/emailService";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { getRoleIdBySlug } from "../accountAuth";

function getFrontendUrlFromRequest(req: { protocol?: string; get?: (h: string) => string | undefined }): string {
  try {
    const protocol = req.protocol || "https";
    const host = req.get?.("X-Forwarded-Host") || req.get?.("Host") || "localhost:3000";
    return `${protocol}://${host}`;
  } catch {
    return ENV.frontendUrl;
  }
}

async function ensureProcessLeaderRole(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  accountId: number,
  companyId: number,
  processId: number
) {
  const roleId = await getRoleIdBySlug(db, "process_leader");
  if (roleId == null) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Rol process_leader no configurado" });
  const existing = await db
    .select()
    .from(accountRoles)
    .where(
      and(
        eq(accountRoles.accountId, accountId),
        eq(accountRoles.roleId, roleId),
        eq(accountRoles.companyId, companyId),
        eq(accountRoles.processId, processId)
      )
    )
    .limit(1);
  if (existing.length) return;
  await db.insert(accountRoles).values({
    accountId,
    roleId,
    companyId,
    processId,
  });
}

export const processLeaderInvitationsRouter = router({
  createInvitation: protectedProcedure
    .input(
      z.object({
        processId: z.number(),
        companyId: z.number(),
        leaderEmail: z.string().email("Invalid email address"),
        leaderName: z.string().min(1, "Leader name is required"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const proc = await db.select().from(processes).where(eq(processes.id, input.processId)).limit(1);
      if (!proc.length) throw new Error("Process not found");

      const comp = await db.select().from(companies).where(eq(companies.id, input.companyId)).limit(1);
      if (!comp.length) throw new Error("Company not found");

      const plRoleId = await getRoleIdBySlug(db, "process_leader");
      if (plRoleId == null) throw new Error("process_leader role missing");

      const emailNorm = input.leaderEmail.trim().toLowerCase();
      const accWithRole = await db
        .select({ ar: accountRoles })
        .from(accounts)
        .innerJoin(accountRoles, eq(accountRoles.accountId, accounts.id))
        .where(
          and(
            sql`LOWER(${accounts.email}) = ${emailNorm}`,
            eq(accountRoles.roleId, plRoleId),
            eq(accountRoles.processId, input.processId)
          )
        )
        .limit(1);
      if (accWithRole.length) {
        throw new Error("This leader already has access to this process");
      }

      const invitationToken = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      await db.insert(authInvitations).values({
        kind: "process_leader",
        email: input.leaderEmail,
        inviteeName: input.leaderName,
        invitationToken,
        companyId: input.companyId,
        processId: input.processId,
        expiresAt,
      });

      await db.insert(accessAuditLog).values({
        eventType: "process_leader_invited",
        companyId: input.companyId,
        description: `Process leader ${input.leaderName} (${input.leaderEmail}) invited for process ${proc[0].name}`,
      });

      const protocol = ctx.req.protocol || "https";
      const host = ctx.req.get("host") || ctx.req.get("x-forwarded-host") || "localhost:3000";
      const frontendUrl = `${protocol}://${host}`;
      const setupUrl = `${frontendUrl}/setup-process-leader-pin?token=${invitationToken}`;

      await notifyOwner({
        title: "Process Leader Invitation Created",
        content: `Invitation created for ${input.leaderEmail} for process ${proc[0].name}. Share this link: ${setupUrl}`,
      });

      return { success: true, message: "Invitation sent successfully", invitationToken };
    }),

  setInitialPIN: publicProcedure
    .input(
      z.object({
        invitationToken: z.string().min(1, "Invitation token is required"),
        pin: z.string().min(8, "Password must be at least 8 characters"),
        confirmPin: z.string(),
      })
      .refine((data) => data.pin === data.confirmPin, {
        message: "Passwords do not match",
        path: ["confirmPin"],
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const invRows = await db
        .select()
        .from(authInvitations)
        .where(
          and(eq(authInvitations.invitationToken, input.invitationToken), eq(authInvitations.kind, "process_leader"))
        )
        .limit(1);

      if (!invRows.length) throw new Error("Invitation not found or already used");
      let invitation = invRows[0];

      if (new Date() > invitation.expiresAt) throw new Error("Invitation has expired");
      if (invitation.acceptedAt) throw new Error("Invitation has already been used");

      const pid = invitation.processId;
      const cid = invitation.companyId;
      if (pid == null || cid == null) throw new Error("Invalid invitation data");

      const latest = await db
        .select()
        .from(authInvitations)
        .where(
          and(
            eq(authInvitations.kind, "process_leader"),
            eq(authInvitations.email, invitation.email),
            eq(authInvitations.processId, pid)
          )
        )
        .orderBy(desc(authInvitations.createdAt))
        .limit(1);
      if (latest.length && latest[0].id !== invitation.id) {
        invitation = latest[0];
        if (invitation.acceptedAt) throw new Error("Invitation has already been used");
        if (new Date() > invitation.expiresAt) throw new Error("Invitation has expired");
      }

      const pinHash = await bcrypt.hash(input.pin, 10);
      const emailNorm = invitation.email.trim().toLowerCase();

      let accRows = await db
        .select()
        .from(accounts)
        .where(sql`LOWER(${accounts.email}) = ${emailNorm}`)
        .limit(1);

      let account = accRows[0];
      if (!account) {
        const openId = `local:pl-${crypto.randomBytes(16).toString("hex")}`;
        await db.insert(accounts).values({
          openId,
          email: invitation.email,
          name: invitation.inviteeName ?? invitation.email,
          passwordHash: pinHash,
          loginMethod: "local",
          status: "active",
        });
        accRows = await db.select().from(accounts).where(eq(accounts.openId, openId)).limit(1);
        account = accRows[0];
      } else {
        await db
          .update(accounts)
          .set({
            passwordHash: pinHash,
            name: invitation.inviteeName ?? account.name,
            loginMethod: "local",
            status: "active",
            updatedAt: new Date(),
          })
          .where(eq(accounts.id, account.id));
      }

      if (!account) throw new Error("Account creation failed");

      await ensureProcessLeaderRole(db, account.id, cid, pid);

      await db
        .update(authInvitations)
        .set({ acceptedAt: new Date(), updatedAt: new Date() })
        .where(eq(authInvitations.id, invitation.id));

      await db.insert(accessAuditLog).values({
        eventType: "process_leader_pin_set",
        companyId: cid,
        accountId: account.id,
        description: `Process leader ${invitation.email} set initial password for process ID ${pid}`,
      });

      const process = await db.select().from(processes).where(eq(processes.id, pid)).limit(1);
      const company = await db.select().from(companies).where(eq(companies.id, cid)).limit(1);
      const companyName = company[0]?.name || "Unknown Company";
      const frontendUrl = getFrontendUrlFromRequest(ctx.req);
      sendAccessInvitationEmail(invitation.email, invitation.inviteeName || invitation.email, companyName, frontendUrl);

      return {
        success: true,
        message: "Password set successfully. You can now access your process.",
        processLeaderId: account.id,
        leaderName: invitation.inviteeName || invitation.email,
        leaderEmail: invitation.email,
        processId: pid,
        companyId: cid,
        processName: process[0]?.name,
        companyName,
      };
    }),

  changePIN: companyProcedure
    .input(
      z.object({
        processId: z.number(),
        currentPin: z.string(),
        newPin: z
          .string()
          .length(4, "PIN must be exactly 4 digits")
          .regex(/^\d{4}$/, "PIN must contain only digits"),
        confirmPin: z.string(),
      })
      .refine((data) => data.newPin === data.confirmPin, {
        message: "PINs do not match",
        path: ["confirmPin"],
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const pl = ctx.processLeader;
      if (!pl) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Solo los jefes de proceso autenticados pueden cambiar el PIN" });
      }
      if (pl.processId !== input.processId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Proceso no autorizado" });
      }

      const accRows = await db.select().from(accounts).where(eq(accounts.id, pl.processLeaderId)).limit(1);
      const acc = accRows[0];
      if (!acc?.passwordHash) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Credentials not found" });
      }

      const pinMatch = await bcrypt.compare(input.currentPin, acc.passwordHash);
      if (!pinMatch) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Current PIN is incorrect" });
      }

      const newPinHash = await bcrypt.hash(input.newPin, 10);
      await db.update(accounts).set({ passwordHash: newPinHash, updatedAt: new Date() }).where(eq(accounts.id, acc.id));

      await db.insert(accessAuditLog).values({
        eventType: "process_leader_pin_changed",
        description: `Process leader changed PIN for process ID ${input.processId}`,
      });

      return { success: true, message: "PIN changed successfully" };
    }),

  validateCredentials: publicProcedure
    .input(
      z.object({
        processId: z.number(),
        leaderEmail: z.string().email(),
        pin: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const emailNorm = input.leaderEmail.trim().toLowerCase();
      const plRoleId = await getRoleIdBySlug(db, "process_leader");
      if (plRoleId == null) {
        return { valid: false as const, message: "Invalid credentials" };
      }

      const rows = await db
        .select({ acc: accounts })
        .from(accounts)
        .innerJoin(accountRoles, eq(accountRoles.accountId, accounts.id))
        .where(
          and(
            sql`LOWER(${accounts.email}) = ${emailNorm}`,
            eq(accountRoles.roleId, plRoleId),
            eq(accountRoles.processId, input.processId),
            eq(accounts.status, "active")
          )
        )
        .limit(1);

      if (!rows.length || !rows[0].acc.passwordHash) {
        await db.insert(accessAuditLog).values({
          eventType: "process_leader_login_failed",
          description: `Login failed: credentials not found for ${input.leaderEmail}`,
        });
        return { valid: false as const, message: "Invalid credentials" };
      }

      const acc = rows[0].acc;
      const pinMatch = await bcrypt.compare(input.pin, acc.passwordHash);
      if (!pinMatch) {
        await db.insert(accessAuditLog).values({
          eventType: "process_leader_login_failed",
          description: `Login failed: invalid PIN for ${input.leaderEmail}`,
        });
        return { valid: false as const, message: "Invalid credentials" };
      }

      const processDetails = await db.select().from(processes).where(eq(processes.id, input.processId)).limit(1);
      let companyName = "Empresa";
      let companyId = 0;
      if (processDetails.length) {
        companyId = processDetails[0].companyId;
        const companyDetails = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1);
        if (companyDetails.length) companyName = companyDetails[0].name;
      }

      await db.insert(accessAuditLog).values({
        eventType: "process_leader_login_success",
        accountId: acc.id,
        description: `Process leader ${input.leaderEmail} logged in for process ID ${input.processId}`,
      });

      return {
        valid: true as const,
        message: "Credentials valid",
        processLeaderId: acc.id,
        leaderName: acc.name,
        companyId,
        companyName,
      };
    }),

  deactivateLeader: companyProcedure
    .input(
      z.object({
        processLeaderCredentialId: z.number(),
        companyId: z.number(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const mgr = ctx.manager;
      if (!mgr) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Solo gerentes de empresa pueden desactivar jefes de proceso" });
      }
      if (mgr.companyId !== input.companyId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Empresa no autorizada" });
      }

      const arRows = await db
        .select({ ar: accountRoles, proc: processes })
        .from(accountRoles)
        .innerJoin(processes, eq(accountRoles.processId, processes.id))
        .where(eq(accountRoles.id, input.processLeaderCredentialId))
        .limit(1);

      if (!arRows.length) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Assignment not found" });
      }

      const { ar, proc } = arRows[0];
      if (proc.companyId !== mgr.companyId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Proceso no pertenece a su empresa" });
      }

      await db.delete(accountRoles).where(eq(accountRoles.id, ar.id));

      await db.insert(accessAuditLog).values({
        eventType: "process_leader_deactivated",
        companyId: input.companyId,
        accountId: ar.accountId,
        description: `Process leader assignment removed for process ID ${ar.processId}`,
      });

      return { success: true, message: "Process leader deactivated successfully" };
    }),

  createInvitationByManager: publicProcedure
    .input(
      z.object({
        companyId: z.number(),
        processId: z.number(),
        leaderEmail: z.string().email(),
        leaderName: z.string().min(1),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const company = await db.select().from(companies).where(eq(companies.id, input.companyId)).limit(1);
      const process = await db.select().from(processes).where(eq(processes.id, input.processId)).limit(1);
      if (!company.length) throw new Error("Company not found");
      if (!process.length) throw new Error("Process not found");

      const plRoleId = await getRoleIdBySlug(db, "process_leader");
      if (plRoleId == null) throw new Error("process_leader role missing");

      const emailNorm = input.leaderEmail.trim().toLowerCase();
      const dup = await db
        .select({ ar: accountRoles })
        .from(accounts)
        .innerJoin(accountRoles, eq(accountRoles.accountId, accounts.id))
        .where(
          and(
            sql`LOWER(${accounts.email}) = ${emailNorm}`,
            eq(accountRoles.roleId, plRoleId),
            eq(accountRoles.processId, input.processId)
          )
        )
        .limit(1);
      if (dup.length) throw new Error("This leader already has access to this process");

      const invitationToken = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      await db.insert(authInvitations).values({
        kind: "process_leader",
        email: input.leaderEmail,
        inviteeName: input.leaderName,
        invitationToken,
        companyId: input.companyId,
        processId: input.processId,
        expiresAt,
      });

      return {
        success: true,
        message: "Invitacion enviada exitosamente",
        invitationToken,
      };
    }),
});
