import crypto from "crypto";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { ENV } from "./env";

/**
 * Email service for sending notifications through the Amazon SES API.
 *
 * Requires `SES_FROM_EMAIL` (verified identity) and credentials
 * (`SES_ACCESS_KEY_ID` / `SES_SECRET_ACCESS_KEY`, falling back to `AWS_*`).
 * Identities are regional — use the same region as the verified domain
 * (`AWS_SES_REGION` or `AWS_REGION`, default `us-west-2`).
 */

function maskRecipient(raw: string): string {
  const e = raw.trim().toLowerCase();
  const at = e.indexOf("@");
  if (at <= 0) return "***";
  const user = e.slice(0, at);
  const domain = e.slice(at + 1);
  const prefix = user.slice(0, 2);
  return `${prefix}***@${domain}`;
}

function summarizeRecipients(to: string | string[]): string {
  const list = Array.isArray(to) ? to : [to];
  return list.map(maskRecipient).join(", ");
}

let _sesClient: SESClient | null = null;

function getSesClient(): SESClient {
  if (_sesClient) return _sesClient;
  _sesClient = new SESClient({
    region: ENV.sesRegion,
    credentials: {
      accessKeyId: ENV.sesAccessKeyId,
      secretAccessKey: ENV.sesSecretAccessKey,
    },
  });
  return _sesClient;
}

function hasSesCredentials(): boolean {
  return Boolean(ENV.sesAccessKeyId?.trim() && ENV.sesSecretAccessKey?.trim());
}

/** Log-friendly env check (no secrets). */
function logSesConfigDiagnostics(reason: string): void {
  const keySet = Boolean(ENV.sesAccessKeyId?.trim());
  console.warn("[EmailService] SES diagnostics:", {
    reason,
    SES_ACCESS_KEY_ID: keySet ? "set (length " + ENV.sesAccessKeyId.trim().length + ")" : "MISSING",
    SES_FROM_EMAIL: ENV.sesFromEmail || "MISSING — sending will fail",
    SES_FROM_NAME: ENV.sesFromName || "(default)",
    AWS_SES_REGION: ENV.sesRegion || "MISSING",
    NODE_ENV: process.env.NODE_ENV,
  });
}

function logSesApiFailure(attempt: number, err: unknown): void {
  if (err instanceof Error) {
    const meta = err as Error & { $metadata?: { httpStatusCode?: number; requestId?: string } };
    console.error("[EmailService] SES API failure details:", {
      attempt,
      name: err.name,
      message: err.message,
      httpStatusCode: meta.$metadata?.httpStatusCode,
      requestId: meta.$metadata?.requestId,
    });
    return;
  }
  console.error("[EmailService] SES API failure (non-Error):", err);
}

/** Parse `Name <email@x.com>` or plain email; default to ENV sender. */
function resolveSender(fromOverride?: string): { name: string; email: string } {
  const name = ENV.sesFromName;
  const email = ENV.sesFromEmail.trim();
  const fallback = { name, email };
  const raw = fromOverride?.trim();
  if (!raw) return fallback;
  const lt = raw.lastIndexOf("<");
  const gt = raw.lastIndexOf(">");
  if (lt >= 0 && gt > lt) {
    const e = raw.slice(lt + 1, gt).trim();
    let n = raw.slice(0, lt).replace(/^["']+|["']+$/g, "").trim();
    if (!n) n = name;
    return e ? { name: n, email: e } : fallback;
  }
  if (/\S+@\S+\.\S+/.test(raw)) {
    return { name, email: raw };
  }
  return fallback;
}

function formatSesSource(sender: { name: string; email: string }): string {
  if (sender.name) {
    return `${sender.name} <${sender.email}>`;
  }
  return sender.email;
}

/**
 * Send one transactional email via Amazon SES SendEmail.
 */
async function sendOneSesTransactional(
  options: EmailOptions,
  correlationId: string,
  attempt: number
): Promise<void> {
  const sender = resolveSender(options.from);
  if (!sender.email) {
    throw new Error("SES_FROM_EMAIL is required for SES sends");
  }
  const toAddresses = Array.isArray(options.to) ? options.to : [options.to];
  const textContent =
    options.textContent || options.htmlContent.replace(/<[^>]*>/g, "");

  console.log("[EmailService] Attempting send via Amazon SES", {
    correlationId,
    attempt,
    region: ENV.sesRegion,
    from: formatSesSource(sender),
    toMasked: summarizeRecipients(toAddresses),
    subject: options.subject,
    htmlLength: options.htmlContent.length,
  });

  const response = await getSesClient().send(
    new SendEmailCommand({
      Source: formatSesSource(sender),
      Destination: {
        ToAddresses: toAddresses.map((addr) => addr.trim()),
      },
      Message: {
        Subject: { Data: options.subject, Charset: "UTF-8" },
        Body: {
          Html: { Data: options.htmlContent, Charset: "UTF-8" },
          Text: { Data: textContent, Charset: "UTF-8" },
        },
      },
    })
  );

  console.log("[EmailService] Email accepted by SES", {
    correlationId,
    attempt,
    messageId: response.MessageId,
  });
}

export interface EmailOptions {
  to: string | string[];
  subject: string;
  htmlContent: string;
  textContent?: string;
  from?: string;
}

export type SesDiagnosticCategory =
  | "accepted"
  | "credentials_missing"
  | "sender_missing"
  | "authentication_or_permissions"
  | "identity_or_sandbox"
  | "region_or_configuration"
  | "transport_failure";

export interface SesDiagnosticResult {
  accepted: boolean;
  category: SesDiagnosticCategory;
  message: string;
}

export interface PasswordResetEmailOptions {
  to: string;
  resetToken: string;
  frontendUrl?: string;
  recipientName?: string;
}

/**
 * Send email via Amazon SES (non-blocking). Retries run in the background.
 */
export function sendEmail(options: EmailOptions): boolean {
  const correlationId = crypto.randomBytes(4).toString("hex");
  console.log("[EmailService] sendEmail queued (background)", {
    correlationId,
    to: summarizeRecipients(options.to),
    subject: options.subject,
  });
  sendEmailWithRetries(options, correlationId).catch((error) => {
    console.error("[EmailService] Background email send failed:", { correlationId, error });
    logSesApiFailure(0, error);
  });

  return true;
}

/**
 * Blocking variant for critical flows (e.g. password reset).
 * Returns true only if SES accepted the message.
 */
export async function sendEmailStrict(options: EmailOptions): Promise<boolean> {
  const correlationId = crypto.randomBytes(4).toString("hex");
  console.log("[EmailService] sendEmailStrict (await)", {
    correlationId,
    to: summarizeRecipients(options.to),
    subject: options.subject,
  });
  return sendEmailWithRetries(options, correlationId);
}

function classifySesFailure(error: unknown): Omit<SesDiagnosticResult, "accepted"> {
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message.toLowerCase() : "";

  if (
    /UnrecognizedClient|InvalidClientToken|SignatureDoesNotMatch|ExpiredToken|AccessDenied|Authorization/i.test(name) ||
    /security token|access key|signature|not authorized|not authorized to perform/i.test(message)
  ) {
    return {
      category: "authentication_or_permissions",
      message:
        "Amazon SES rechazó las credenciales o permisos de envío. Revise el usuario IAM de SES y las variables SES_ACCESS_KEY_ID / SES_SECRET_ACCESS_KEY en producción.",
    };
  }

  if (
    /MessageRejected|MailFromDomainNotVerified/i.test(name) ||
    /not verified|identity|sandbox|email address is not verified|mail-from/i.test(message)
  ) {
    return {
      category: "identity_or_sandbox",
      message:
        "Amazon SES rechazó una identidad de correo. Verifique el remitente noreply@isge360.com, el dominio isge360.com y, mientras la cuenta siga en sandbox, el destinatario en la región us-west-2.",
    };
  }

  if (/RegionDisabled|InvalidParameter|ConfigurationSet/i.test(name) || /region|endpoint|configuration/i.test(message)) {
    return {
      category: "region_or_configuration",
      message:
        "Amazon SES rechazó la región o la configuración de envío. Confirme AWS_SES_REGION=us-west-2 y que las identidades estén verificadas en esa misma región.",
    };
  }

  return {
    category: "transport_failure",
    message:
      "Amazon SES no confirmó el envío. Revise los registros seguros del servidor para completar el diagnóstico de conectividad o configuración.",
  };
}

/**
 * Strict SES send with an administrator-safe diagnosis. It never returns a
 * credential, request ID, raw AWS error message, or other sensitive detail.
 */
export async function sendEmailStrictWithDiagnostic(options: EmailOptions): Promise<SesDiagnosticResult> {
  const correlationId = crypto.randomBytes(4).toString("hex");
  console.log("[EmailService] sendEmailStrictWithDiagnostic (await)", {
    correlationId,
    to: summarizeRecipients(options.to),
    subject: options.subject,
  });

  if (!hasSesCredentials()) {
    logSesConfigDiagnostics("missing SES_ACCESS_KEY_ID / SES_SECRET_ACCESS_KEY");
    return {
      accepted: false,
      category: "credentials_missing",
      message:
        "Faltan las credenciales de Amazon SES en producción. Configure SES_ACCESS_KEY_ID y SES_SECRET_ACCESS_KEY en el servidor.",
    };
  }

  if (!ENV.sesFromEmail?.trim()) {
    logSesConfigDiagnostics("missing SES_FROM_EMAIL");
    return {
      accepted: false,
      category: "sender_missing",
      message: "Falta configurar el remitente SES_FROM_EMAIL en producción.",
    };
  }

  const maxRetries = 3;
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await sendOneSesTransactional(options, correlationId, attempt);
      return {
        accepted: true,
        category: "accepted",
        message: "Amazon SES confirmó la aceptación del correo de prueba. Revise también Spam o No deseado.",
      };
    } catch (error) {
      lastError = error;
      console.error(`[EmailService] Diagnostic SES send failed`, { correlationId, attempt, maxRetries });
      logSesApiFailure(attempt, error);
      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, 2_000));
      }
    }
  }

  logSesConfigDiagnostics("diagnostic send retries exhausted");
  return { accepted: false, ...classifySesFailure(lastError) };
}

/**
 * Internal function that handles actual email sending with retries.
 */
async function sendEmailWithRetries(options: EmailOptions, correlationId: string): Promise<boolean> {
  const maxRetries = 3;
  let lastError: unknown = null;

  if (!hasSesCredentials()) {
    logSesConfigDiagnostics("missing SES_ACCESS_KEY_ID / SES_SECRET_ACCESS_KEY");
    return false;
  }

  if (!ENV.sesFromEmail?.trim()) {
    logSesConfigDiagnostics("missing SES_FROM_EMAIL");
    return false;
  }

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[EmailService] SES send`, {
        correlationId,
        attempt: `${attempt}/${maxRetries}`,
      });
      await sendOneSesTransactional(options, correlationId, attempt);
      return true;
    } catch (error) {
      lastError = error;
      console.error(`[EmailService] Error sending email`, { correlationId, attempt, maxRetries });
      logSesApiFailure(attempt, error);
      if (error instanceof Error) {
        console.error("[EmailService] Error stack:", error.stack);
      }
      if (attempt === 1) {
        logSesConfigDiagnostics("first send attempt failed — check env inside the running container");
      }

      if (attempt < maxRetries) {
        console.log(`[EmailService] Waiting 2 seconds before retry...`);
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
  }

  console.error("[EmailService] All email send attempts failed", { correlationId, lastError });
  logSesApiFailure(maxRetries, lastError);
  logSesConfigDiagnostics("all retries exhausted");
  return false;
}

/**
 * Send manager access invitation email (non-blocking)
 */
export function sendManagerAccessInvitationEmail(
  managerEmail: string,
  companyName: string,
  invitationToken: string,
  expirationDays: number,
  baseUrl: string = "http://localhost:3000"
): boolean {
  const invitationUrl = `${baseUrl}/setup-password?token=${encodeURIComponent(invitationToken)}`;

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0; }
          .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; }
          .footer { background: #f3f4f6; padding: 15px; text-align: center; font-size: 12px; color: #6b7280; }
          .button { display: inline-block; background: #1e40af; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
          .info-box { background: #dbeafe; border-left: 4px solid #1e40af; padding: 15px; margin: 15px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Invitación a ISGE 360</h1>
            <p>La estrategia hecha gestión.</p>
          </div>
          
          <div class="content">
            <p>Hola,</p>
            
            <p>Ha sido invitado a ser Gerente de la empresa <strong>${companyName}</strong> en la plataforma ISGE 360.</p>
            
            <div class="info-box">
              <strong>Próximos pasos:</strong><br>
              1. Haga clic en el botón de abajo<br>
              2. Cree su contraseña personal<br>
              3. Acceda a su panel de gerente
            </div>
            
            <center>
              <a href="${invitationUrl}" class="button">Aceptar Invitación</a>
            </center>
            
            <p style="text-align: center; color: #666; font-size: 14px;">
              O copie y pegue este enlace en su navegador:<br>
              <span style="word-break: break-all;">${invitationUrl}</span>
            </p>
            
            <div class="info-box">
              <strong>Importante:</strong> Este enlace de invitación expirará en <strong>${expirationDays} días</strong>.
              Si no completa su solicitud dentro de este período, deberá solicitar una nueva invitación.
            </div>
            
            <p>Como Gerente, podrá:</p>
            <ul>
              <li>Acceder al panel de administración de la empresa</li>
              <li>Gestionar usuarios y permisos</li>
              <li>Monitorear procesos y objetivos</li>
              <li>Generar reportes y análisis</li>
            </ul>
            
            <p>Si tiene preguntas o necesita asistencia, contacte a su administrador.</p>
            
            <p>Saludos,<br>
            El equipo de ISGE 360</p>
          </div>
          
          <div class="footer">
            <p>&copy; 2026 ISGE 360 - La estrategia hecha gestión.</p>
            <p>Este es un mensaje automático. Por favor, no responda a este correo.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  const textContent = `
Invitación a ISGE 360 - La estrategia hecha gestión.

Hola,

Ha sido invitado a ser Gerente de la empresa ${companyName} en la plataforma ISGE 360.

Para aceptar esta invitación, abra el siguiente enlace en su navegador:
${invitationUrl}

Este enlace expirará en ${expirationDays} días.

Si tiene preguntas, contacte a su administrador.

© 2026 ISGE 360 - La estrategia hecha gestión.
  `;

  // Send email in background without waiting
  sendEmail({
    to: managerEmail,
    subject: `Invitación a ISGE 360 - ${companyName}`,
    htmlContent,
    textContent,
  });
  
  // Return immediately (optimistic)
  return true;
}

/**
 * Send manager access confirmation email with login credentials (non-blocking)
 */
export function sendManagerAccessConfirmationEmail(
  managerEmail: string,
  companyName: string,
  baseUrl: string = process.env.VITE_FRONTEND_URL || "http://localhost:3000"
): boolean {
  const loginUrl = `${baseUrl}/login`;

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0; }
          .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; }
          .footer { background: #f3f4f6; padding: 15px; text-align: center; font-size: 12px; color: #6b7280; }
          .button { display: inline-block; background: #1e40af; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
          .info-box { background: #dbeafe; border-left: 4px solid #1e40af; padding: 15px; margin: 15px 0; }
          .credentials-box { background: #f0f9ff; border: 1px solid #bfdbfe; padding: 15px; margin: 15px 0; border-radius: 6px; font-family: monospace; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>¡Bienvenido a ISGE 360!</h1>
            <p>La estrategia hecha gestión.</p>
          </div>
          
          <div class="content">
            <p>Hola,</p>
            
            <p>Su invitación ha sido <strong>aceptada exitosamente</strong>. Ya puede acceder a la plataforma ISGE 360 como Gerente de <strong>${companyName}</strong>.</p>
            
            <div class="info-box">
              <strong>✓ Acceso Confirmado</strong><br>
              Su cuenta ha sido creada y está lista para usar.
            </div>
            
            <p><strong>Para acceder a la plataforma, abra este enlace en su navegador:</strong></p>
            
            <p style="background: #f3f4f6; padding: 15px; border-radius: 4px; word-break: break-all; font-size: 14px;">
              <strong>${loginUrl}</strong>
            </p>
            
            <div class="credentials-box">
              <strong>Sus credenciales de acceso:</strong><br><br>
              <strong>Email:</strong> ${managerEmail}<br>
              <strong>Contraseña:</strong> La contraseña que creó durante la aceptación de la invitación
            </div>
            
            <p><strong>Como Gerente, podrá:</strong></p>
            <ul>
              <li>Acceder a todos los módulos ISGE 360 de la empresa</li>
              <li>Gestionar Jefes de Proceso</li>
              <li>Monitorear procesos y objetivos</li>
              <li>Generar reportes y análisis</li>
              <li>Visualizar el FODA de la empresa</li>
              <li>Acceder al Flujograma ISGE</li>
            </ul>
            
            <div class="info-box">
              <strong>Consejo:</strong> Guarde este email para futuras referencias. Puede usar el enlace anterior para acceder a la plataforma en cualquier momento.
            </div>
            
            <p>Si tiene preguntas o necesita asistencia, contacte a su administrador.</p>
            
            <p>Saludos,<br>
            El equipo de ISGE 360</p>
          </div>
          
          <div class="footer">
            <p>&copy; 2026 ISGE 360 - La estrategia hecha gestión.</p>
            <p>Este es un mensaje automático. Por favor, no responda a este correo.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  const textContent = `
Bienvenido a ISGE 360 - La estrategia hecha gestión.

Hola,

Su invitación ha sido aceptada exitosamente. Ya puede acceder a la plataforma ISGE 360 como Gerente de ${companyName}.

Para acceder a la plataforma, abra el siguiente enlace en su navegador:
${loginUrl}

Sus credenciales de acceso:
Email: ${managerEmail}
Contraseña: La contraseña que creó durante la aceptación de la invitación

Guarde este email para futuras referencias.

Si tiene preguntas, contacte a su administrador.

© 2026 ISGE 360 - La estrategia hecha gestión.
  `;

  console.log(`[ManagerAccessConfirmation] Attempting to send confirmation email to ${managerEmail}`);
  console.log(`[ManagerAccessConfirmation] Login URL: ${loginUrl}`);
  console.log(`[ManagerAccessConfirmation] Company: ${companyName}`);
  
  // Send email in background without waiting
  sendEmail({
    to: managerEmail,
    subject: `Bienvenido a ISGE 360 - ${companyName}`,
    htmlContent,
    textContent,
  });
  
  // Return immediately (optimistic)
  console.log(`[ManagerAccessConfirmation] Email queued for sending`);
  return true;
}

/**
 * Send process leader access confirmation after password setup (non-blocking)
 */
export function sendProcessLeaderAccessConfirmationEmail(
  leaderEmail: string,
  leaderName: string,
  companyName: string,
  processName: string,
  baseUrl: string = process.env.VITE_FRONTEND_URL || "http://localhost:3000"
): boolean {
  const loginUrl = `${baseUrl}/login`;

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0; }
          .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; }
          .footer { background: #f3f4f6; padding: 15px; text-align: center; font-size: 12px; color: #6b7280; }
          .info-box { background: #dbeafe; border-left: 4px solid #1e40af; padding: 15px; margin: 15px 0; }
          .credentials-box { background: #f0f9ff; border: 1px solid #bfdbfe; padding: 15px; margin: 15px 0; border-radius: 6px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>¡Bienvenido a ISGE 360!</h1>
            <p>La estrategia hecha gestión.</p>
          </div>
          <div class="content">
            <p>Hola <strong>${leaderName}</strong>,</p>
            <p>Su invitación ha sido <strong>aceptada exitosamente</strong>. Ya puede acceder como Jefe del Proceso <strong>"${processName}"</strong> en <strong>${companyName}</strong>.</p>
            <div class="info-box">
              <strong>✓ Acceso confirmado</strong><br>
              Su cuenta está lista para usar.
            </div>
            <p><strong>Para acceder a la plataforma:</strong></p>
            <p style="background: #f3f4f6; padding: 15px; border-radius: 4px; word-break: break-all; font-size: 14px;">
              <strong>${loginUrl}</strong>
            </p>
            <div class="credentials-box">
              <strong>Sus credenciales:</strong><br><br>
              <strong>Correo:</strong> ${leaderEmail}<br>
              <strong>Contraseña:</strong> La que creó al aceptar la invitación
            </div>
            <p>Saludos,<br>El equipo de ISGE 360</p>
          </div>
          <div class="footer">
            <p>&copy; 2026 ISGE 360 - La estrategia hecha gestión.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  const textContent = `
Bienvenido a ISGE 360

Hola ${leaderName},

Su invitación fue aceptada. Ya puede acceder como Jefe del Proceso "${processName}" en ${companyName}.

Inicie sesión en: ${loginUrl}
Correo: ${leaderEmail}
Contraseña: la que creó al aceptar la invitación

© 2026 ISGE 360
  `;

  sendEmail({
    to: leaderEmail,
    subject: `Bienvenido a ISGE 360 - ${companyName}`,
    htmlContent,
    textContent,
  });
  return true;
}

/**
 * Send process leader invitation email (non-blocking, same pattern as manager invitation)
 */
export function sendProcessLeaderInvitationEmail(
  leaderEmail: string,
  leaderName: string,
  processName: string,
  companyName: string,
  invitationToken: string,
  baseUrl: string = ENV.frontendUrl
): boolean {
  const setupUrl = `${baseUrl.replace(/\/$/, "")}/setup-process-leader-password?token=${encodeURIComponent(invitationToken)}`;

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0; }
          .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; }
          .footer { background: #f3f4f6; padding: 15px; text-align: center; font-size: 12px; color: #6b7280; }
          .button { display: inline-block; background: #1e40af; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
          .info-box { background: #dbeafe; border-left: 4px solid #1e40af; padding: 15px; margin: 15px 0; }
          .token-box { background: #f0f0f0; padding: 15px; border-left: 4px solid #1e40af; margin: 20px 0; font-family: monospace; font-size: 14px; word-break: break-all; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Invitación - Jefe de Proceso</h1>
            <p>Plataforma ISGE 360</p>
          </div>
          
          <div class="content">
            <p>Hola <strong>${leaderName}</strong>,</p>
            
            <p>Ha sido invitado a ser <strong>Jefe del Proceso "${processName}"</strong> en la empresa <strong>${companyName}</strong> en la plataforma ISGE 360.</p>
            
            <div class="info-box">
              <strong>Próximos pasos:</strong><br>
              1. Haga clic en el botón de abajo<br>
              2. Cree su contraseña personal<br>
              3. Acceda a su panel de Jefe de Proceso
            </div>
            
            <center>
              <a href="${setupUrl}" class="button">Aceptar invitación</a>
            </center>
            
            <p style="text-align: center; color: #666; font-size: 14px;">
              O copie y pegue este enlace en su navegador:<br>
              <span style="word-break: break-all;">${setupUrl}</span>
            </p>
            
            <div class="info-box">
              <strong>Importante:</strong> Este enlace de invitación expirará en 7 días.
            </div>
            
            <p>Como Jefe de Proceso, podrá:</p>
            <ul>
              <li>Acceder a información del proceso asignado</li>
              <li>Gestionar objetivos del proceso</li>
              <li>Registrar indicadores y métricas</li>
              <li>Generar reportes del proceso</li>
            </ul>
            
            <p>Si tiene preguntas o necesita asistencia, contacte a su administrador.</p>
            
            <p>Saludos,<br>
            El equipo de ISGE 360</p>
          </div>
          
          <div class="footer">
            <p>&copy; 2026 ISGE 360 - La estrategia hecha gestión.</p>
            <p>Este es un mensaje automático. Por favor, no responda a este correo.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  const textContent = `
Invitación - Jefe de Proceso - Plataforma ISGE 360

Hola ${leaderName},

Ha sido invitado a ser Jefe del Proceso "${processName}" en la empresa ${companyName} en la plataforma ISGE 360.

Para crear su contraseña y acceder, abra el siguiente enlace en su navegador:
${setupUrl}

Este enlace expirará en 7 días.

Si tiene preguntas, contacte a su administrador.

© 2026 ISGE 360 - La estrategia hecha gestión.
  `;

  console.log("[ProcessLeaderInvitation] Queuing invitation email", {
    toDomain: leaderEmail.includes("@") ? leaderEmail.split("@")[1] : "?",
    processName,
    companyName,
    setupUrl,
  });

  sendEmail({
    to: leaderEmail,
    subject: `Invitación - Jefe de Proceso "${processName}" - ${companyName}`,
    htmlContent,
    textContent,
  });

  return true;
}

/**
 * Send access invitation email to process leader
 */
export async function sendAccessInvitationEmail(
  leaderEmail: string,
  leaderName: string,
  companyName: string,
  baseUrl: string = "http://localhost:3000"
): Promise<boolean> {
  const accessUrl = `${baseUrl}/login`;

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0; }
          .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; }
          .footer { background: #f3f4f6; padding: 15px; text-align: center; font-size: 12px; color: #6b7280; }
          .button { display: inline-block; background: #1e40af; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
          .info-box { background: #dbeafe; border-left: 4px solid #1e40af; padding: 15px; margin: 15px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Acceso Confirmado</h1>
            <p>Plataforma ISGE 360</p>
          </div>
          
          <div class="content">
            <p>Hola <strong>${leaderName}</strong>,</p>
            
            <p>Su acceso como Jefe de Proceso en <strong>${companyName}</strong> ha sido confirmado.</p>
            
            <div class="info-box">
              <strong>✓ Acceso Activo</strong><br>
              Puede acceder a la plataforma en cualquier momento.
            </div>
            
            <p><strong>Para acceder a la plataforma:</strong></p>
            
            <p style="text-align: center; color: #666; font-size: 14px;">
              Copie y pegue este enlace en su navegador:<br>
              <span style="word-break: break-all; background: #f0f0f0; padding: 10px; display: inline-block; border-radius: 4px;">${accessUrl}</span>
            </p>
            
            <p>Saludos,<br>
            El equipo de ISGE 360</p>
          </div>
          
          <div class="footer">
            <p>&copy; 2026 ISGE 360 - La estrategia hecha gestión.</p>
            <p>Este es un mensaje automático. Por favor, no responda a este correo.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  const textContent = `
Acceso Confirmado - Plataforma ISGE 360

Hola ${leaderName},

Su acceso como Jefe de Proceso en ${companyName} ha sido confirmado.

Para acceder a la plataforma, abra el siguiente enlace en su navegador:
${accessUrl}

Saludos,
El equipo de ISGE 360

© 2026 ISGE 360 - La estrategia hecha gestión.
  `;

  return sendEmail({
    to: leaderEmail,
    subject: `Acceso Confirmado - ${companyName}`,
    htmlContent,
    textContent,
  });
}

/**
 * Standard password reset email with secure link token.
 */
export async function sendPasswordResetEmail({
  to,
  resetToken,
  frontendUrl = process.env.FRONTEND_URL || process.env.VITE_FRONTEND_URL || "http://localhost:3000",
  recipientName = "usuario",
}: PasswordResetEmailOptions): Promise<boolean> {
  console.log("[EmailService] sendPasswordResetEmail start", {
    toDomain: to.includes("@") ? to.split("@")[1] : "?",
    frontendUrl,
    recipientMask: `${to.trim().slice(0, 2)}***`,
    tokenLen: resetToken.length,
  });
  const resetUrl = `${frontendUrl}/forgot-password-manager?token=${encodeURIComponent(resetToken)}`;

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #1e40af; color: #fff; padding: 20px; border-radius: 8px 8px 0 0; text-align: center; }
          .content { background: #f9fafb; border: 1px solid #e5e7eb; padding: 20px; }
          .footer { background: #f3f4f6; color: #6b7280; font-size: 12px; text-align: center; padding: 14px; }
          .button { display: inline-block; background: #1e40af; color: #fff; text-decoration: none; padding: 12px 22px; border-radius: 6px; margin: 18px 0; }
          .note { background: #eef2ff; border-left: 4px solid #1e40af; padding: 12px; margin: 14px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Recuperar contraseña</h1>
            <p>Plataforma ISGE 360</p>
          </div>
          <div class="content">
            <p>Hola <strong>${recipientName}</strong>,</p>
            <p>Recibimos una solicitud para restablecer tu contraseña.</p>
            <center>
              <a href="${resetUrl}" class="button">Restablecer contraseña</a>
            </center>
            <p>Si el botón no abre, copia este enlace en tu navegador:</p>
            <p style="word-break: break-all;">${resetUrl}</p>
            <div class="note">
              Este enlace expira en 15 minutos. Si no solicitaste este cambio, ignora este mensaje.
            </div>
          </div>
          <div class="footer">
            <p>&copy; 2026 ISGE 360 - La estrategia hecha gestión.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  const textContent = `
Recuperar contraseña - Plataforma ISGE 360

Hola ${recipientName},

Recibimos una solicitud para restablecer tu contraseña.

Abre este enlace:
${resetUrl}

El enlace expira en 15 minutos.
Si no solicitaste este cambio, ignora este mensaje.
  `;

  return sendEmailStrict({
    to,
    subject: "Restablecer contraseña - Plataforma ISGE 360",
    htmlContent,
    textContent,
  });
}


/**
 * Send approval notification email
 */
export async function sendApprovalNotificationEmail(
  email: string,
  companyName: string,
  contactName: string,
  invitationToken: string,
  baseUrl: string = "http://localhost:3000"
): Promise<boolean> {
  const approvalUrl = `${baseUrl}/setup-password?token=${encodeURIComponent(invitationToken)}`;

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0; }
          .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; }
          .footer { background: #f3f4f6; padding: 15px; text-align: center; font-size: 12px; color: #6b7280; }
          .button { display: inline-block; background: #1e40af; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
          .info-box { background: #dbeafe; border-left: 4px solid #1e40af; padding: 15px; margin: 15px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>¡Acceso Aprobado!</h1>
            <p>La estrategia hecha gestión.</p>
          </div>
          
          <div class="content">
            <p>Hola ${contactName},</p>
            
            <p>Tu solicitud de acceso a la plataforma ISGE 360 para <strong>${companyName}</strong> ha sido <strong>aprobada exitosamente</strong>.</p>
            
            <div class="info-box">
              <strong>✓ Acceso Confirmado</strong><br>
              Ya puedes acceder a la plataforma ISGE 360.
            </div>
            
            <p><strong>Para acceder, haz clic en el botón de abajo:</strong></p>
            
            <center>
              <a href="${approvalUrl}" class="button">Acceder a ISGE 360</a>
            </center>
            
            <p style="text-align: center; color: #666; font-size: 14px;">
              O copia y pega este enlace en tu navegador:<br>
              <span style="word-break: break-all;">${approvalUrl}</span>
            </p>
            
            <p>Saludos,<br>
            El equipo de ISGE 360</p>
          </div>
          
          <div class="footer">
            <p>&copy; 2026 ISGE 360 - La estrategia hecha gestión.</p>
            <p>Este es un mensaje automático. Por favor, no responda a este correo.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  const textContent = `
Acceso Aprobado - Plataforma ISGE 360

Hola ${contactName},

Tu solicitud de acceso a la plataforma ISGE 360 para ${companyName} ha sido aprobada exitosamente.

Para acceder a la plataforma, abre el siguiente enlace en tu navegador:
${approvalUrl}

Saludos,
El equipo de ISGE 360

© 2026 ISGE 360 - La estrategia hecha gestión.
  `;

  return sendEmail({
    to: email,
    subject: `Acceso Aprobado - ${companyName}`,
    htmlContent,
    textContent,
  });
}
