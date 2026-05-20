import { z } from "zod";
import { publicProcedure, adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { companyAccessRequests, accessAuditLog } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { notifyOwner } from "../_core/notification";

/**
 * Router for managing company access requests
 * Handles: request creation, listing, approval, rejection
 */
export const companyAccessRequestsRouter = router({
  /**
   * Create a new company access request (PUBLIC - no auth required)
   * Sends email notification to admin
   */
  create: publicProcedure
    .input(
      z.object({
        companyName: z.string().min(1, "Company name is required"),
        rucOrCI: z.string().min(1, "RUC or CI is required"),
        contactName: z.string().min(1, "Contact name is required"),
        email: z.string().email("Invalid email address"),
        phone: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      try {
        // Insert the request
        const result = await db.insert(companyAccessRequests).values({
          companyName: input.companyName,
          rucOrCI: input.rucOrCI,
          contactName: input.contactName,
          email: input.email,
          phone: input.phone,
          status: "pending",
        });

        // Log the event
        await db.insert(accessAuditLog).values({
          eventType: "company_request_created",
          description: `New company access request from ${input.companyName}`,
        });

        // Notify admin
        await notifyOwner({
          title: "Nueva solicitud de acceso a SIGE",
          content: `${input.companyName} (${input.contactName}) ha solicitado acceso a la plataforma SIGE. Email: ${input.email}`,
        });

        return {
          success: true,
          message: "Solicitud enviada exitosamente. El administrador la revisará pronto.",
        };
      } catch (error) {
        console.error("[CompanyAccessRequests] Create error:", error);
        throw error;
      }
    }),

  /**
   * List all company access requests (ADMIN ONLY)
   */
  list: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    try {
      const requests = await db
        .select()
        .from(companyAccessRequests)
        .orderBy(companyAccessRequests.createdAt);

      return requests;
    } catch (error) {
      console.error("[CompanyAccessRequests] List error:", error);
      throw error;
    }
  }),

  /**
   * Approve a company access request (ADMIN ONLY)
   * Creates a company and sends approval email to contact
   */
  approve: adminProcedure
    .input(
      z.object({
        requestId: z.number(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      try {
        // Get the request
        const request = await db
          .select()
          .from(companyAccessRequests)
          .where(eq(companyAccessRequests.id, input.requestId))
          .limit(1);

        if (!request || request.length === 0) {
          throw new Error("Request not found");
        }

        const req = request[0];

        // Update request status
        await db
          .update(companyAccessRequests)
          .set({
            status: "approved",
            approvedBy: ctx.user.id,
            approvalDate: new Date(),
          })
          .where(eq(companyAccessRequests.id, input.requestId));

        // Log the event
        await db.insert(accessAuditLog).values({
          eventType: "company_approved",
          userId: ctx.user.id,
          description: `Company ${req.companyName} approved`,
        });

        // TODO: Send email to contact with approval and next steps
        // For now, just notify owner
        await notifyOwner({
          title: "Solicitud de acceso aprobada",
          content: `La solicitud de ${req.companyName} ha sido aprobada. Se debe crear la empresa en el sistema.`,
        });

        return {
          success: true,
          message: "Solicitud aprobada exitosamente",
        };
      } catch (error) {
        console.error("[CompanyAccessRequests] Approve error:", error);
        throw error;
      }
    }),

  /**
   * Reject a company access request (ADMIN ONLY)
   */
  reject: adminProcedure
    .input(
      z.object({
        requestId: z.number(),
        reason: z.string().min(1, "Rejection reason is required"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      try {
        // Get the request
        const request = await db
          .select()
          .from(companyAccessRequests)
          .where(eq(companyAccessRequests.id, input.requestId))
          .limit(1);

        if (!request || request.length === 0) {
          throw new Error("Request not found");
        }

        const req = request[0];

        // Update request status
        await db
          .update(companyAccessRequests)
          .set({
            status: "rejected",
            approvedBy: ctx.user.id,
            approvalDate: new Date(),
            rejectionReason: input.reason,
          })
          .where(eq(companyAccessRequests.id, input.requestId));

        // Log the event
        await db.insert(accessAuditLog).values({
          eventType: "company_rejected",
          userId: ctx.user.id,
          description: `Company ${req.companyName} rejected: ${input.reason}`,
        });

        // TODO: Send email to contact with rejection reason
        await notifyOwner({
          title: "Solicitud de acceso rechazada",
          content: `La solicitud de ${req.companyName} ha sido rechazada. Razón: ${input.reason}`,
        });

        return {
          success: true,
          message: "Solicitud rechazada",
        };
      } catch (error) {
        console.error("[CompanyAccessRequests] Reject error:", error);
        throw error;
      }
    }),
});
