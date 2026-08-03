import cron from "node-cron";
import { getDb } from "../db";
import {
  companies,
  companyInfo,
  processes,
  processTacticalObjectives,
  processCharacterizations,
  criticalityMatrix,
  processCompliances,
} from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { sendEmail } from "../_core/emailService";

// ─── Tipos internos ───────────────────────────────────────────────────────────

interface AlertActivity {
  element: string;
  action: string;
  dueDate: Date;
  daysRemaining: number;
  completionPercentage: number;
  processName: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysUntil(date: Date): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function isWithinNextDays(date: Date, days: number): boolean {
  const remaining = daysUntil(date);
  return remaining >= 0 && remaining <= days;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("es-EC", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// ─── Recolección de actividades próximas a vencer ────────────────────────────

async function getUpcomingActivitiesForProcess(
  processId: number,
  processName: string,
  windowDays: number
): Promise<AlertActivity[]> {
  const db = await getDb();
  if (!db) return [];

  const activities: AlertActivity[] = [];

  // 1. Gestión de Partes Interesadas
  const criticalityRows = await db
    .select()
    .from(criticalityMatrix)
    .where(eq(criticalityMatrix.processId, processId));

  for (const row of criticalityRows as any[]) {
    if (row.actions && Array.isArray(row.actions)) {
      for (const action of row.actions) {
        if (action.dueDate) {
          const due = new Date(action.dueDate);
          if (isWithinNextDays(due, windowDays)) {
            activities.push({
              element: "Partes Interesadas",
              action: action.description || "Acción sin descripción",
              dueDate: due,
              daysRemaining: daysUntil(due),
              completionPercentage: action.completionPercentage || 0,
              processName,
            });
          }
        }
      }
    }
  }

  // 2. OTE — tareas de Objetivos Operativos (o el OO mismo si no tiene tareas)
  const objectives = await db
    .select()
    .from(processTacticalObjectives)
    .where(eq(processTacticalObjectives.processId, processId));

  for (const obj of objectives as any[]) {
    if (!obj.planningData) continue;
    try {
      const pd = typeof obj.planningData === "string"
        ? JSON.parse(obj.planningData)
        : obj.planningData;

      if (!pd.resultKeys || !Array.isArray(pd.resultKeys)) continue;

      for (const rk of pd.resultKeys) {
        const hasTasks = rk.tasks && Array.isArray(rk.tasks) && rk.tasks.length > 0;

        if (hasTasks) {
          for (const task of rk.tasks) {
            if (task.date) {
              const due = new Date(task.date);
              if (isWithinNextDays(due, windowDays)) {
                activities.push({
                  element: "OTE",
                  action: task.description || "Tarea sin descripción",
                  dueDate: due,
                  daysRemaining: daysUntil(due),
                  completionPercentage: task.percentageCompleted || 0,
                  processName,
                });
              }
            }
          }
        } else {
          // OO sin tareas: el OO mismo es la actividad
          const dateStr = rk.endDate || rk.implementationDate || rk.startDate;
          if (dateStr) {
            const due = new Date(dateStr);
            if (isWithinNextDays(due, windowDays)) {
              activities.push({
                element: "OTE",
                action: rk.description || "Objetivo Operativo sin descripción",
                dueDate: due,
                daysRemaining: daysUntil(due),
                completionPercentage: rk.porcentajeAlcanzado || 0,
                processName,
              });
            }
          }
        }
      }
    } catch {
      // skip malformed
    }
  }

  // 3. Cumplimientos
  const compliances = await db
    .select()
    .from(processCompliances)
    .where(eq(processCompliances.processId, processId));

  for (const c of compliances as any[]) {
    if (c.dueDate && c.completed !== "SI") {
      const due = new Date(c.dueDate);
      if (isWithinNextDays(due, windowDays)) {
        activities.push({
          element: "Cumplimiento",
          action: c.requirement || "Cumplimiento sin descripción",
          dueDate: due,
          daysRemaining: daysUntil(due),
          completionPercentage: c.completionPercentage || 0,
          processName,
        });
      }
    }
  }

  return activities;
}

// ─── Generación de HTML del correo ───────────────────────────────────────────

function buildEmailHtml(
  recipientName: string,
  companyName: string,
  activities: AlertActivity[],
  isAdmin: boolean
): string {
  const badgeColor: Record<string, string> = {
    "OTE": "#d97706",
    "Partes Interesadas": "#7c3aed",
    "Cumplimiento": "#0891b2",
  };

  const rows = activities
    .sort((a, b) => a.daysRemaining - b.daysRemaining)
    .map((act) => {
      const urgency = act.daysRemaining === 0
        ? "background:#fef2f2; border-left:4px solid #ef4444;"
        : act.daysRemaining <= 3
        ? "background:#fff7ed; border-left:4px solid #f97316;"
        : "background:#f0fdf4; border-left:4px solid #22c55e;";

      const badge = `<span style="background:${badgeColor[act.element] || "#6b7280"};color:white;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;">${act.element}</span>`;
      const days = act.daysRemaining === 0
        ? `<strong style="color:#ef4444;">Vence HOY</strong>`
        : `Faltan <strong>${act.daysRemaining}</strong> día${act.daysRemaining !== 1 ? "s" : ""}`;

      return `
        <tr>
          <td style="padding:12px 16px;${urgency}border-bottom:1px solid #e5e7eb;">
            ${isAdmin ? `<div style="font-size:11px;color:#6b7280;margin-bottom:4px;">${act.processName}</div>` : ""}
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">${badge}</div>
            <div style="font-weight:600;color:#1e293b;margin-bottom:4px;">${act.action}</div>
            <div style="font-size:13px;color:#64748b;">
              📅 Fecha límite: <strong>${formatDate(act.dueDate)}</strong> &nbsp;|&nbsp; ${days} &nbsp;|&nbsp; Avance: <strong>${act.completionPercentage}%</strong>
            </div>
          </td>
        </tr>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;background:#f8fafc;margin:0;padding:20px;">
  <div style="max-width:640px;margin:0 auto;">
    <div style="background:linear-gradient(135deg,#1e3a8a,#1e40af);color:white;padding:24px;border-radius:8px 8px 0 0;">
      <h1 style="margin:0;font-size:20px;">🔔 Alerta de Cronograma — SIGE</h1>
      <p style="margin:6px 0 0;opacity:.85;font-size:14px;">${companyName}</p>
    </div>
    <div style="background:white;padding:24px;border:1px solid #e5e7eb;border-top:none;">
      <p style="color:#374151;">Hola <strong>${recipientName}</strong>,</p>
      <p style="color:#374151;">Las siguientes actividades vencen en los próximos <strong>7 días</strong>:</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;">
        <tbody>${rows}</tbody>
      </table>
      <p style="color:#6b7280;font-size:13px;">Este correo se envía automáticamente cada lunes. Para gestionar las actividades, ingresa a la plataforma SIGE.</p>
    </div>
    <div style="background:#f3f4f6;padding:12px;text-align:center;font-size:12px;color:#9ca3af;border-radius:0 0 8px 8px;">
      © 2026 SIGE — Sistema Integrado de Gestión Empresarial. Mensaje automático.
    </div>
  </div>
</body>
</html>`;
}

// ─── Lógica principal de envío ────────────────────────────────────────────────

async function runWeeklyAlerts(): Promise<void> {
  console.log("[ScheduleAlerts] Iniciando revisión semanal de alertas...");
  const db = await getDb();
  if (!db) {
    console.warn("[ScheduleAlerts] Base de datos no disponible, omitiendo.");
    return;
  }

  const WINDOW_DAYS = 7;

  // Obtener todas las empresas activas
  const allCompanies = await db.select().from(companies);

  for (const company of allCompanies as any[]) {
    try {
      // Correo del administrador
      const infoRows = await db
        .select()
        .from(companyInfo)
        .where(eq(companyInfo.companyId, company.id));
      const adminEmail: string = infoRows.length > 0 ? (infoRows[0] as any).adminAlertEmail || "" : "";

      // Obtener todos los procesos de la empresa
      const companyProcesses = await db
        .select()
        .from(processes)
        .where(eq(processes.companyId, company.id));

      // Para cada proceso: obtener actividades y correo del responsable
      const allActivitiesForAdmin: AlertActivity[] = [];

      for (const proc of companyProcesses as any[]) {
        const activities = await getUpcomingActivitiesForProcess(proc.id, proc.name, WINDOW_DAYS);
        if (activities.length === 0) continue;

        // Agregar al resumen del admin
        allActivitiesForAdmin.push(...activities);

        // Enviar correo al responsable del proceso (solo sus actividades)
        const charRows = await db
          .select()
          .from(processCharacterizations)
          .where(eq(processCharacterizations.processId, proc.id));

        const responsibleEmail: string = charRows.length > 0
          ? (charRows[0] as any).responsibleEmail || ""
          : "";
        const responsibleName: string = charRows.length > 0
          ? (charRows[0] as any).responsible || "Responsable"
          : "Responsable";

        if (responsibleEmail && responsibleEmail.includes("@")) {
          const html = buildEmailHtml(responsibleName, company.name, activities, false);
          sendEmail({
            to: responsibleEmail,
            subject: `🔔 Alertas de Cronograma — ${proc.name} (${company.name})`,
            htmlContent: html,
          });
          console.log(`[ScheduleAlerts] Correo enviado al responsable de ${proc.name}: ${responsibleEmail}`);
        }
      }

      // Enviar resumen consolidado al administrador
      if (adminEmail && adminEmail.includes("@") && allActivitiesForAdmin.length > 0) {
        const html = buildEmailHtml("Administrador", company.name, allActivitiesForAdmin, true);
        sendEmail({
          to: adminEmail,
          subject: `🔔 Resumen de Alertas de Cronograma — ${company.name}`,
          htmlContent: html,
        });
        console.log(`[ScheduleAlerts] Correo resumen enviado al admin de ${company.name}: ${adminEmail}`);
      }
    } catch (err) {
      console.error(`[ScheduleAlerts] Error procesando empresa ${company.id}:`, err);
    }
  }

  console.log("[ScheduleAlerts] Revisión semanal completada.");
}

// ─── Registro del cron job ────────────────────────────────────────────────────

/**
 * Registra el cron job que ejecuta las alertas todos los lunes a las 7:00 AM (hora del servidor).
 * También exporta runWeeklyAlerts para poder ejecutarlo manualmente desde el backend si se necesita.
 */
export function registerScheduleAlertsCron(): void {
  // Todos los lunes a las 7:00 AM
  cron.schedule("0 7 * * 1", () => {
    runWeeklyAlerts().catch((err) => {
      console.error("[ScheduleAlerts] Error en cron job:", err);
    });
  });
  console.log("[ScheduleAlerts] Cron job registrado: lunes 7:00 AM.");
}

export { runWeeklyAlerts };
