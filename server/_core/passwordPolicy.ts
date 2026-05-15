import { z } from "zod";

/** Shared password rules for managers and process leaders (local accounts). */
export const accountPasswordSchema = z
  .string()
  .min(8, "La contraseña debe tener al menos 8 caracteres")
  .regex(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[a-zA-Z\d@$!%*?&]/,
    "La contraseña debe incluir mayúsculas, minúsculas, un número y un carácter especial (@$!%*?&)"
  );

export const setInitialPasswordInputSchema = z
  .object({
    invitationToken: z.string().min(1, "Token de invitación requerido"),
    password: accountPasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Las contraseñas no coinciden",
    path: ["confirmPassword"],
  });

export const changePasswordInputSchema = z
  .object({
    currentPassword: z.string().min(1, "La contraseña actual es requerida"),
    newPassword: accountPasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Las contraseñas no coinciden",
    path: ["confirmPassword"],
  });

/** @deprecated Use accountPasswordSchema */
export const managerPasswordSchema = accountPasswordSchema;
