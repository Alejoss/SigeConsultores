import { z } from "zod";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  accessInvitations,
  accessAuditLog,
} from "../../drizzle/schema";
import { eq, and, desc, isNull } from "drizzle-orm";
import { randomBytes } from "crypto";
import { sendAccessInvitationEmail } from "../_core/emailService";
import { TRPCError } from "@trpc/server";

/**
 * Generate a secure random token for invitations
 */
function generateToken(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Router for managing access invitations
 * Admins create invitations, companies use them to request access
 */
export const accessInvitationsRouter = router({
  /**
   * Create a new access invitation (admin only)
   * Generates a unique token that can be shared with a company
   */
  createInvitation: adminProcedure
    .input(
      z.object({
        companyName: z.string().min(1, "Company name is required"),
        contactEmail: z.string().email("Valid email is required"),
        expirationDays: z.number().min(1).max(365).default(30),
      })
    )
    .mutation(async ({ input }: { input: any }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      try {
        const token = generateToken();
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + input.expirationDays);

        await db.insert(accessInvitations).values({
          invitationToken: token,
          companyName: input.companyName,
          contactEmail: input.contactEmail,
          expiresAt,
        });

        // Log the event
        await db.insert(accessAuditLog).values({
          eventType: "company_access_invitation_created",
          description: `Access invitation created for ${input.companyName} (${input.contactEmail}). Token expires in ${input.expirationDays} days.`,
        });

        // Send email to contact
        const emailSent = await sendAccessInvitationEmail(
          input.contactEmail,
          input.companyName,
          token,
          input.expirationDays
        );

        return {
          success: true,
          token,
          invitationUrl: `/request-access-protected?token=${token}`,
          expiresAt,
          emailSent,
          message: `Invitation created successfully. Email sent to ${input.contactEmail}`,
        };
      } catch (error) {
        console.error("[AccessInvitations] Create invitation error:", error);
        throw error;
      }
    }),

  /**
   * Validate an invitation token
   * Used by the public request form to check if token is valid
   */
  validateToken: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input }: { input: any }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      try {
        const invitation = await db
          .select()
          .from(accessInvitations)
          .where(eq(accessInvitations.invitationToken, input.token))
          .limit(1);

        if (!invitation || invitation.length === 0) {
          return {
            valid: false,
            message: "Invalid invitation token",
          };
        }

        const inv = invitation[0];

        // Check if expired
        if (new Date() > inv.expiresAt) {
          return {
            valid: false,
            message: "Invitation token has expired",
          };
        }

        // Check if already used
        if (inv.usedAt) {
          return {
            valid: false,
            message: "This invitation has already been used",
          };
        }

        return {
          valid: true,
          companyName: inv.companyName,
          contactEmail: inv.contactEmail,
          expiresAt: inv.expiresAt,
          message: "Invitation token is valid",
        };
      } catch (error) {
        console.error("[AccessInvitations] Validate token error:", error);
        throw error;
      }
    }),

  /**
   * Mark an invitation as used
   * Called after a company successfully submits an access request
   */
  markAsUsed: publicProcedure
    .input(
      z.object({
        token: z.string(),
        accessRequestId: z.number(),
      })
    )
    .mutation(async ({ input }: { input: any }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      try {
        const invitation = await db
          .select()
          .from(accessInvitations)
          .where(eq(accessInvitations.invitationToken, input.token))
          .limit(1);

        if (!invitation || invitation.length === 0) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Invitation not found",
          });
        }

        const inv = invitation[0];

        // Verify token is still valid
        if (new Date() > inv.expiresAt) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Invitation token has expired",
          });
        }

        if (inv.usedAt) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "This invitation has already been used",
          });
        }

        // Mark as used
        await db
          .update(accessInvitations)
          .set({
            usedAt: new Date(),
            usedByRequestId: input.accessRequestId,
          })
          .where(eq(accessInvitations.id, inv.id));

        // Log the event
        await db.insert(accessAuditLog).values({
          eventType: "company_access_invitation_used",
          description: `Access invitation for ${inv.companyName} was used to create access request #${input.accessRequestId}`,
        });

        return {
          success: true,
          message: "Invitation marked as used",
        };
      } catch (error) {
        console.error("[AccessInvitations] Mark as used error:", error);
        throw error;
      }
    }),

  /**
   * Get all access invitations (admin only)
   */
  listInvitations: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    try {
      const invitations = await db
        .select()
        .from(accessInvitations)
        .orderBy(desc(accessInvitations.createdAt));

      return invitations.map((inv) => ({
        ...inv,
        isExpired: new Date() > inv.expiresAt,
        isUsed: !!inv.usedAt,
        status: inv.usedAt ? "used" : new Date() > inv.expiresAt ? "expired" : "pending",
      }));
    } catch (error) {
      console.error("[AccessInvitations] List invitations error:", error);
      throw error;
    }
  }),

  /**
   * Revoke an invitation (admin only)
   * Prevents the token from being used
   */
  revokeInvitation: adminProcedure
    .input(z.object({ invitationId: z.number() }))
    .mutation(async ({ input }: { input: any }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      try {
        const invitation = await db
          .select()
          .from(accessInvitations)
          .where(eq(accessInvitations.id, input.invitationId))
          .limit(1);

        if (!invitation || invitation.length === 0) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Invitation not found",
          });
        }

        // Set expiration to now to effectively revoke it
        await db
          .update(accessInvitations)
          .set({ expiresAt: new Date() })
          .where(eq(accessInvitations.id, input.invitationId));

        // Log the event
        await db.insert(accessAuditLog).values({
          eventType: "company_access_invitation_revoked",
          description: `Access invitation for ${invitation[0].companyName} was revoked by admin`,
        });

        return {
          success: true,
          message: "Invitation revoked successfully",
        };
      } catch (error) {
        console.error("[AccessInvitations] Revoke invitation error:", error);
        throw error;
      }
    }),

  /**
   * Get statistics about invitations
   */
  getStatistics: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    try {
      const allInvitations = await db.select().from(accessInvitations);

      const pending = allInvitations.filter(
        (inv) => !inv.usedAt && new Date() <= inv.expiresAt
      );
      const used = allInvitations.filter((inv) => inv.usedAt);
      const expired = allInvitations.filter(
        (inv) => !inv.usedAt && new Date() > inv.expiresAt
      );

      return {
        total: allInvitations.length,
        pending: pending.length,
        used: used.length,
        expired: expired.length,
      };
    } catch (error) {
      console.error("[AccessInvitations] Get statistics error:", error);
      throw error;
    }
  }),
});
