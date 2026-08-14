import crypto from "crypto";
import { ENV } from "./env";

/**
 * Email service for sending notifications via Brevo transactional HTTP API.
 *
 * Requires `BREVO_API_KEY`. Auth and endpoint per Brevo docs:
 * @see https://developers.brevo.com/reference/quickstart-reference
 * @see https://developers.brevo.com/docs/api-key-authentication
 * @see https://developers.brevo.com/reference/send-transac-email
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

/** Base `servers[0].url` + `paths./smtp/email` from Brevo OpenAPI. */
const BREVO_TRANSACTIONAL_API_URL = "https://api.brevo.com/v3/smtp/email";

/** Log-friendly env check (no secrets). */
function logBrevoConfigDiagnostics(reason: string): void {
  const apiSet = Boolean(ENV.brevoApiKey?.trim());
  console.warn("[EmailService] Brevo diagnostics:", {
    reason,
    BREVO_API_KEY: apiSet ? "set (length " + ENV.brevoApiKey.trim().length + ")" : "MISSING",
    BREVO_FROM_EMAIL: ENV.brevoFromEmail || "MISSING — sending may fail",
    BREVO_FROM_NAME: ENV.brevoFromName || "(default)",
    NODE_ENV: process.env.NODE_ENV,
  });
}

function logBrevoApiFailure(attempt: number, err: unknown): void {
  if (err instanceof Error) {
    console.error("[EmailService] Brevo API failure details:", {
      attempt,
      name: err.name,
      message: err.message,
    });
    return;
  }
  console.error("[EmailService] Brevo API failure (non-Error):", err);
}

/** Parse `Name <email@x.com>` or plain email; default to ENV sender. */
function resolveSender(fromOverride?: string): { name: string; email: string } {
  const name = ENV.brevoFromName;
  const email = ENV.brevoFromEmail.trim();
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

/**
 * Send one transactional email via Brevo REST API (not marketing `EmailCampaignsApi`).
 * Request shape matches `SendSmtpEmail`: `sender`, `to`, `subject`, `htmlContent`, optional `textContent`.
 */
async function sendOneBrevoTransactionalApi(
  options: EmailOptions,
  correlationId: string,
  attempt: number
): Promise<void> {
  const apiKey = ENV.brevoApiKey.trim();
  const sender = resolveSender(options.from);
  if (!sender.email) {
    throw new Error("BREVO_FROM_EMAIL is required for Brevo API sends");
  }
  const toAddresses = Array.isArray(options.to) ? options.to : [options.to];
  const to = toAddresses.map((addr) => ({ email: addr.trim() }));
  const textContent =
    options.textContent || options.htmlContent.replace(/<[^>]*>/g, "");

  const payload = {
    sender: { name: sender.name, email: sender.email },
    to,
    subject: options.subject,
    htmlContent: options.htmlContent,
    textContent,
  };

  console.log("[EmailService] Attempting send via Brevo transactional API", {
    correlationId,
    attempt,
    endpoint: BREVO_TRANSACTIONAL_API_URL,
    from: `${sender.name} <${sender.email}>`,
    toMasked: summarizeRecipients(toAddresses),
    subject: options.subject,
    htmlLength: options.htmlContent.length,
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  let res: Response;
  try {
    res = await fetch(BREVO_TRANSACTIONAL_API_URL, {
      method: "POST",
      headers: {
        // Required by Brevo: https://developers.brevo.com/docs/api-key-authentication
        "api-key": apiKey,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  const rawBody = await res.text();
  // Brevo documents 201 Created on success; treat any 2xx as OK.
  if (!res.ok) {
    let detail = rawBody.slice(0, 600);
    try {
      const j = JSON.parse(rawBody) as { code?: string; message?: string };
      detail = [j.code, j.message].filter(Boolean).join(" — ") || detail;
    } catch {
      /* use raw snippet */
    }
    throw new Error(`Brevo API HTTP ${res.status}: ${detail}`);
  }

  let messageId: string | undefined;
  try {
    messageId = (JSON.parse(rawBody) as { messageId?: string }).messageId;
  } catch {
    /* empty or non-JSON */
  }
  console.log("[EmailService] Email accepted by Brevo API", {
    correlationId,
    attempt,
    messageId,
    status: res.status,
  });
}

export interface EmailOptions {
  to: string | string[];
  subject: string;
  htmlContent: string;
  textContent?: string;
  from?: string;
}

export interface PasswordResetEmailOptions {
  to: string;
  resetToken: string;
  frontendUrl?: string;
  recipientName?: string;
}

/**
 * Send email via Brevo API (non-blocking). Retries run in the background.
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
    logBrevoApiFailure(0, error);
  });

  return true;
}

/**
 * Blocking variant for critical flows (e.g. password reset).
 * Returns true only if Brevo accepted the message.
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

/**
 * Internal function that handles actual email sending with retries
 * Runs in background without blocking the response
 */
async function sendEmailWithRetries(options: EmailOptions, correlationId: string): Promise<boolean> {
  const maxRetries = 3;
  let lastError: any = null;

  if (!ENV.brevoApiKey?.trim()) {
    logBrevoConfigDiagnostics("missing BREVO_API_KEY");
    return false;
  }

  if (!ENV.brevoFromEmail?.trim()) {
    console.warn(
      "[EmailService] BREVO_FROM_EMAIL is empty. Brevo may reject the message. Set it to a verified sender."
    );
  }

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[EmailService] Brevo API send`, {
        correlationId,
        attempt: `${attempt}/${maxRetries}`,
      });
      await sendOneBrevoTransactionalApi(options, correlationId, attempt);
      return true;
    } catch (error) {
      lastError = error;
      console.error(`[EmailService] Error sending email`, { correlationId, attempt, maxRetries });
      logBrevoApiFailure(attempt, error);
      if (error instanceof Error) {
        console.error("[EmailService] Error stack:", error.stack);
      }
      if (attempt === 1) {
        logBrevoConfigDiagnostics("first send attempt failed — check env inside the running container");
      }

      if (attempt < maxRetries) {
        console.log(`[EmailService] Waiting 2 seconds before retry...`);
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
  }

  console.error("[EmailService] All email send attempts failed", { correlationId, lastError });
  logBrevoApiFailure(maxRetries, lastError);
  logBrevoConfigDiagnostics("all retries exhausted");
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

