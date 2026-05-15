/** Matches server validation in managerCredentials.ts */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_SPECIAL_CHARS = "@$!%*?&";

export const PASSWORD_HINT =
  `Mínimo ${PASSWORD_MIN_LENGTH} caracteres, incluye mayúsculas, minúsculas, números y un carácter especial (${PASSWORD_SPECIAL_CHARS})`;

const SERVER_MESSAGE_TRANSLATIONS: Record<string, string> = {
  "Password must be at least 8 characters": `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres`,
  "La contraseña debe tener al menos 8 caracteres": `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres`,
  "Password must contain uppercase, lowercase, number, and special character":
    `La contraseña debe incluir mayúsculas, minúsculas, un número y un carácter especial (${PASSWORD_SPECIAL_CHARS})`,
  "La contraseña debe incluir mayúsculas, minúsculas, un número y un carácter especial (@$!%*?&)":
    `La contraseña debe incluir mayúsculas, minúsculas, un número y un carácter especial (${PASSWORD_SPECIAL_CHARS})`,
  "Passwords do not match": "Las contraseñas no coinciden",
  "Las contraseñas no coinciden": "Las contraseñas no coinciden",
  "Invitation token is required": "Token de invitación requerido",
  "Token de invitación requerido": "Token de invitación requerido",
  "Invalid or expired invitation token": "Token de invitación inválido o expirado",
  "Invitation token has expired": "El token de invitación ha expirado",
};

function translateMessage(message: string): string {
  const trimmed = message.trim();
  return SERVER_MESSAGE_TRANSLATIONS[trimmed] ?? trimmed;
}

type ZodIssueLike = { message?: string; path?: (string | number)[] };

function parseZodIssuesFromMessage(message: string): string[] | null {
  const trimmed = message.trim();
  if (!trimmed.startsWith("[") && !trimmed.startsWith("{")) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed) as ZodIssueLike | ZodIssueLike[];
    const issues = Array.isArray(parsed) ? parsed : [parsed];
    const messages = issues
      .map((issue) => issue?.message)
      .filter((msg): msg is string => typeof msg === "string" && msg.length > 0)
      .map(translateMessage);

    return messages.length > 0 ? messages : null;
  } catch {
    return null;
  }
}

export function validatePasswordStrength(password: string): { valid: boolean; message?: string } {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return {
      valid: false,
      message: `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres`,
    };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, message: "La contraseña debe contener al menos una mayúscula" };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, message: "La contraseña debe contener al menos una minúscula" };
  }
  if (!/\d/.test(password)) {
    return { valid: false, message: "La contraseña debe contener al menos un número" };
  }
  if (!/[@$!%*?&]/.test(password)) {
    return {
      valid: false,
      message: `La contraseña debe contener al menos un carácter especial (${PASSWORD_SPECIAL_CHARS})`,
    };
  }
  return { valid: true };
}

/** Converts tRPC/Zod errors into readable Spanish messages for the UI. */
export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (!error) {
    return fallback;
  }

  const rawMessage =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : typeof error === "object" &&
            error !== null &&
            "message" in error &&
            typeof (error as { message: unknown }).message === "string"
          ? (error as { message: string }).message
          : "";

  if (!rawMessage) {
    return fallback;
  }

  const zodMessages = parseZodIssuesFromMessage(rawMessage);
  if (zodMessages) {
    return zodMessages.join(" ");
  }

  return translateMessage(rawMessage) || fallback;
}
