import { z } from "zod";
import { randomBytes } from "crypto";
import { publicProcedure, companyProcedure, adminProcedure, router } from "../_core/trpc";
import {
  createCompanyManager,
  getCompanyManager,
  getCompanyManagersByCompany,
  getAllCompanyManagers,
  deleteCompanyManager,
  createProcessOwnerInvitation,
  getProcessOwnerInvitation,
  getProcessOwnerInvitationsByCompany,
  getProcessOwnerInvitationsByProcess,
  acceptProcessOwnerInvitation,
  deleteProcessOwnerInvitation,
  createProcessOwner,
  getProcessOwner,
  getProcessOwnersByProcess,
  getProcessOwnersByUser,
  getProcessOwnersByCompany,
  getAllProcessOwners,
  deleteProcessOwner,
  createOrUpdateManagerCredentials,
} from "../db";
import bcrypt from "bcryptjs";

function generateToken(): string {
  return randomBytes(32).toString("hex");
}

export const hierarchicalAccessRouter = router({
  // ============================================================================
  // COMPANY MANAGERS
  // ============================================================================

  companyManagers: router({
    /**
     * Create a new company manager
     * Only admin can create managers
     */
    create: adminProcedure
      .input(
        z.object({
          companyId: z.number(),
          userId: z.number(),
        })
      )
      .mutation(async ({ input }) => {
        return createCompanyManager(input.companyId, input.userId);
      }),

    /**
     * Get a specific company manager
     */
    get: companyProcedure
      .input(
        z.object({
          companyId: z.number(),
          userId: z.number(),
        })
      )
      .query(async ({ input }) => {
        return getCompanyManager(input.companyId, input.userId);
      }),

    /**
     * Get all managers for a company
     */
    listByCompany: companyProcedure
      .input(
        z.object({
          companyId: z.number(),
        })
      )
      .query(async ({ input }) => {
        return getCompanyManagersByCompany(input.companyId);
      }),

    /**
     * Get all company managers (admin only)
     */
    listAll: adminProcedure.query(async () => {
      return getAllCompanyManagers();
    }),

    /**
     * Delete a company manager
     */
    delete: adminProcedure
      .input(
        z.object({
          companyId: z.number(),
          userId: z.number(),
        })
      )
      .mutation(async ({ input }) => {
        await deleteCompanyManager(input.companyId, input.userId);
        return { success: true };
      }),
  }),

  // ============================================================================
  // PROCESS OWNER INVITATIONS
  // ============================================================================

  processOwnerInvitations: router({
    /**
     * Create a new process owner invitation
     * Only company managers can create invitations for their company
     */
    create: companyProcedure
      .input(
        z.object({
          companyId: z.number(),
          processId: z.number(),
          email: z.string().email(),
          accessCode: z.string().length(12).optional(), // 12-character robust code - optional, Process Owner will create it
        })
      )
      .mutation(async ({ input }) => {
        const invitationToken = generateToken();
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7); // Expires in 7 days

        return createProcessOwnerInvitation(
          input.companyId,
          input.processId,
          input.email,
          input.accessCode || '', // Empty string if not provided
          invitationToken,
          expiresAt
        );
      }),

    /**
     * Get a specific invitation by token
     */
    getByToken: publicProcedure
      .input(z.object({ token: z.string() }))
      .query(async ({ input }) => {
        return getProcessOwnerInvitation(input.token);
      }),

    /**
     * Get all invitations for a company
     */
    listByCompany: companyProcedure
      .input(z.object({ companyId: z.number() }))
      .query(async ({ input }) => {
        return getProcessOwnerInvitationsByCompany(input.companyId);
      }),

    /**
     * Get all invitations for a process
     */
    listByProcess: companyProcedure
      .input(z.object({ processId: z.number() }))
      .query(async ({ input }) => {
        return getProcessOwnerInvitationsByProcess(input.processId);
      }),

    /**
     * Accept an invitation
     * User must provide the correct access code
     */
    accept: publicProcedure
      .input(
        z.object({
          token: z.string(),
          accessCode: z.string().length(12),
        })
      )
      .mutation(async ({ input }) => {
        const invitation = await getProcessOwnerInvitation(input.token);

        if (!invitation) {
          throw new Error("Invitation not found");
        }

        if (invitation.status !== "pending") {
          throw new Error("Invitation is no longer valid");
        }

        if (new Date() > invitation.expiresAt) {
          throw new Error("Invitation has expired");
        }

        if (invitation.accessCode !== input.accessCode) {
          throw new Error("Invalid access code");
        }

        return acceptProcessOwnerInvitation(input.token);
      }),

    /**
     * Delete an invitation
     */
    delete: companyProcedure
      .input(z.object({ token: z.string() }))
      .mutation(async ({ input }) => {
        await deleteProcessOwnerInvitation(input.token);
        return { success: true };
      }),
  }),

  // ============================================================================
  // PROCESS OWNERS
  // ============================================================================

  processOwners: router({
    /**
     * Create a new process owner
     * Called after accepting an invitation
     */
    create: companyProcedure
      .input(
        z.object({
          companyId: z.number(),
          processId: z.number(),
          userId: z.number(),
          accessCode: z.string().length(12),
        })
      )
      .mutation(async ({ input }) => {
        return createProcessOwner(
          input.companyId,
          input.processId,
          input.userId,
          input.accessCode
        );
      }),

    /**
     * Get a specific process owner
     */
    get: companyProcedure
      .input(
        z.object({
          processId: z.number(),
          userId: z.number(),
        })
      )
      .query(async ({ input }) => {
        return getProcessOwner(input.processId, input.userId);
      }),

    /**
     * Get all owners for a process
     */
    listByProcess: companyProcedure
      .input(z.object({ processId: z.number() }))
      .query(async ({ input }) => {
        return getProcessOwnersByProcess(input.processId);
      }),

    /**
     * Get all processes owned by a user
     */
    listByUser: companyProcedure
      .input(z.object({ userId: z.number() }))
      .query(async ({ input }) => {
        return getProcessOwnersByUser(input.userId);
      }),

    /**
     * Alias for listByUser for backward compatibility
     */
    getByUser: companyProcedure
      .input(z.object({ userId: z.number() }))
      .query(async ({ input }) => {
        return getProcessOwnersByUser(input.userId);
      }),

    /**
     * Get all process owners for a company
     */
    listByCompany: companyProcedure
      .input(z.object({ companyId: z.number() }))
      .query(async ({ input }) => {
        return getProcessOwnersByCompany(input.companyId);
      }),

    /**
     * Get all process owners (admin only)
     */
    listAll: adminProcedure.query(async () => {
      return getAllProcessOwners();
    }),

    /**
     * Delete a process owner
     */
    delete: companyProcedure
      .input(
        z.object({
          processId: z.number(),
          userId: z.number(),
        })
      )
      .mutation(async ({ input }) => {
        await deleteProcessOwner(input.processId, input.userId);
        return { success: true };
      }),
  }),
});
