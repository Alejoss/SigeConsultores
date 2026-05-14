import { z } from "zod";
import { adminProcedure, router } from "../_core/trpc";
import {
  createCompanyManager,
  createOrUpdateManagerCredentials,
} from "../db";
import bcrypt from "bcryptjs";
import { TRPCError } from "@trpc/server";

/**
 * Manager Creation Router
 * Handles creation of managers with automatic credential generation
 */
export const managerCreationRouter = router({
  /**
   * Create a new company manager with credentials
   * Auto-generates email/password credentials for the manager
   */
  createWithCredentials: adminProcedure
    .input(
      z.object({
        companyId: z.number(),
        userId: z.number(),
        email: z.string().email("Email invalido"),
        password: z
          .string()
          .min(12, "Contrasena debe tener al menos 12 caracteres")
          .regex(/[A-Z]/, "Debe contener mayusculas")
          .regex(/[a-z]/, "Debe contener minusculas")
          .regex(/[0-9]/, "Debe contener numeros")
          .regex(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/, "Debe contener simbolos"),
      })
    )
    .mutation(async ({ input }) => {
      try {
        // Create the manager
        const manager = await createCompanyManager(input.companyId, input.userId);

        // Hash the password
        const passwordHash = await bcrypt.hash(input.password, 10);

        // Create credentials for the manager
        await createOrUpdateManagerCredentials(
          manager.id,
          input.email,
          passwordHash
        );

        return {
          success: true,
          managerId: manager.id,
          email: input.email,
          message: "Manager creado con credenciales de acceso",
        };
      } catch (error) {
        console.error("[Manager Creation] Error creating manager:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Error al crear el manager",
        });
      }
    }),
});
