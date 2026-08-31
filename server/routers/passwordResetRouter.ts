import { z } from "zod";
import { randomBytes } from "crypto";
import { getDb } from "../db";
import { passwordResetTokens, accounts } from "../../drizzle/schema";
import { and, eq, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { sendPasswordResetEmail } from "../_core/emailService";
import { publicProcedure, router } from "../_core/trpc";
import { ENV } from "../_core/env";

function generateResetToken(): string {
  return randomBytes(32).toString("hex");
}

export const passwordResetRouter = router({
  requestReset: publicProcedure
    .input(
      z.object({
        email: z.string().email(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const emailNorm = input.email.trim().toLowerCase();

      const rows = await db
        .select({ acc: accounts, hasPassword: accounts.passwordHash })
        .from(accounts)
        .where(and(sql`LOWER(${accounts.email}) = ${emailNorm}`, eq(accounts.status, "active")))
        .limit(1);

      if (!rows.length) {
        return { success: true, message: "Si el email existe, recibirás instrucciones para restablecer tu contraseña" };
      }

      const acc = rows[0].acc;
      if (!rows[0].hasPassword) {
        return { success: true, message: "Si el email existe, recibirás instrucciones para restablecer tu contraseña" };
      }

      const resetToken = generateResetToken();
      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + 15);

      await db.insert(passwordResetTokens).values({
        accountId: acc.id,
        email: acc.email,
        token: resetToken,
        tokenType: "password_reset",
        isVerified: true,
        attempts: 0,
        expiresAt,
      });

      const sent = await sendPasswordResetEmail({
        to: input.email,
        resetToken,
        frontendUrl: ENV.frontendUrl,
        recipientName: acc.name || input.email,
      });

      console.log("[passwordReset.requestReset] sendPasswordResetEmail result", {
        accountId: acc.id,
        sent,
        frontendUrlUsed: ENV.frontendUrl,
      });

      if (!sent) {
        return {
          success: false,
          message: "No se pudo enviar el correo de recuperación. Verifica la configuración de Amazon SES.",
        };
      }

      return { success: true, message: "Si el email existe, recibirás instrucciones para restablecer tu contraseña" };
    }),

  resetPassword: publicProcedure
    .input(
      z.object({
        resetToken: z.string(),
        newPassword: z.string().min(8),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const resetRecord = await db
        .select()
        .from(passwordResetTokens)
        .where(eq(passwordResetTokens.token, input.resetToken))
        .limit(1);

      if (!resetRecord.length) {
        throw new Error("Token inválido");
      }

      const record = resetRecord[0];

      if (!record.isVerified) {
        throw new Error("Debes verificar el código primero");
      }

      if (new Date() > record.expiresAt) {
        throw new Error("Token expirado");
      }

      if (!record.accountId) {
        throw new Error("Cuenta no encontrada");
      }

      const passwordHash = await bcrypt.hash(input.newPassword, 10);

      await db
        .update(accounts)
        .set({ passwordHash, updatedAt: new Date() })
        .where(eq(accounts.id, record.accountId));

      await db.update(passwordResetTokens).set({ usedAt: new Date() }).where(eq(passwordResetTokens.id, record.id));

      return { success: true, message: "Contraseña actualizada correctamente" };
    }),
});
