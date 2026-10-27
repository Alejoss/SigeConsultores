import cron from "node-cron";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import {
  companies,
  companyCompliances,
  companyInfo,
  processCharacterizations,
  processes,
} from "../../drizzle/schema";
import { sendEmail } from "../_core/emailService";
import {
  getConsolidatedScheduleActivities,
  type ConsolidatedScheduleActivity,
} from "./consolidatedScheduleActivities";

export interface ProcessAlertActivity {
  id: string;
  element: string;
  action: string;
  dueDate: Date;
  daysRemaining: number;
  completionPercentage: number;
  processName: string;
}

export interface ProcessWeeklyAlertSections {
  weekly: ProcessAlertActivity[];
  overdue: ProcessAlertActivity[];
}

interface ExecutiveComplianceAlert {
  requirement: string;
  obligationType: string;
  responsible: string;
  dueDate: Date;
  daysRemaining: number;
}

const WINDOW_DAYS = 7;

function daysUntil(date: Date, referenceDate: Date = new Date()): number {
  const now = new Date(referenceDate);
  now.setHours(0, 0, 0, 0);
  const due = new Date(date);
  due.setHours(0, 0, 0, 0);
  return Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function isWithinNextDays(
  date: Date,
  days: number,
  referenceDate: Date = new Date()
): boolean {
  const remaining = daysUntil(date, referenceDate);
  return remaining >= 0 && remaining <= days;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("es-EC", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function urgencyText(daysRemaining: number): string {
  if (daysRemaining < 0) {
    const overdueDays = Math.abs(daysRemaining);
    return `Vencida hace ${overdueDays} día${overdueDays !== 1 ? "s" : ""}`;
  }
  if (daysRemaining === 0) return "Vence hoy";
  return `Faltan ${daysRemaining} día${daysRemaining !== 1 ? "s" : ""}`;
}

function urgencyStyle(daysRemaining: number): string {
  if (daysRemaining <= 0)
    return "background:#fef2f2;border-left:4px solid #dc2626;";
  if (daysRemaining <= 3)
    return "background:#fff7ed;border-left:4px solid #ea580c;";
  return "background:#f0fdf4;border-left:4px solid #16a34a;";
}

function urgencyColor(daysRemaining: number): string {
  if (daysRemaining < 0) return "#b91c1c";
  if (daysRemaining <= 3) return "#c2410c";
  return "#166534";
}

function getProcessBadge(element: string): { label: string; color: string } {
  const normalized = element.toLowerCase();
  if (normalized.includes("ote")) return { label: "OTE", color: "#b45309" };
  if (normalized.includes("parte"))
    return { label: "PARTES INTERESADAS", color: "#6d28d9" };
  if (normalized.includes("cumpl"))
    return { label: "CUMPLIMIENTO", color: "#0e7490" };
  if (
    normalized.includes("compromiso") ||
    normalized.includes("planificacion propia")
  )
    return { label: "COMPROMISO VINCULADO", color: "#0f766e" };
  if (normalized.includes("foda")) return { label: "FODA", color: "#475569" };
  return { label: element || "ACTIVIDAD", color: "#475569" };
}

/**
 * Separa los pendientes abiertos del Cronograma Consolidado sin reconstruir
 * sus datos: la semana incluye hoy hasta los próximos siete días y lo
 * acumulado contiene únicamente los vencidos hasta ayer.
 */
export function splitProcessWeeklyAlertActivities(
  activities: ConsolidatedScheduleActivity[],
  processName: string,
  referenceDate: Date = new Date()
): ProcessWeeklyAlertSections {
  const weekly: ProcessAlertActivity[] = [];
  const overdue: ProcessAlertActivity[] = [];

  for (const activity of activities) {
    if (activity.completed === "SI") continue;

    const daysRemaining = daysUntil(activity.dueDate, referenceDate);
    const processActivity: ProcessAlertActivity = {
      id: activity.id,
      element: activity.badge || activity.element,
      action: activity.action,
      dueDate: activity.dueDate,
      daysRemaining,
      completionPercentage: activity.completionPercentage || 0,
      processName,
    };

    if (isWithinNextDays(activity.dueDate, WINDOW_DAYS, referenceDate)) {
      weekly.push(processActivity);
    } else if (daysRemaining < 0) {
      overdue.push(processActivity);
    }
  }

  return { weekly, overdue };
}

export function hasProcessWeeklyAlertActivities(
  sections: ProcessWeeklyAlertSections
): boolean {
  return sections.weekly.length > 0 || sections.overdue.length > 0;
}

/**
 * El correo del Jefe de Proceso consume la misma fuente que la página
 * Cronograma Consolidado, no una reconstrucción parcial de sus datos.
 */
async function getPendingConsolidatedActivitiesForProcess(
  processId: number,
  processName: string
): Promise<ProcessWeeklyAlertSections> {
  const consolidated = await getConsolidatedScheduleActivities(processId);
  return splitProcessWeeklyAlertActivities(consolidated, processName);
}

/**
 * El correo del Gerente General usa exclusivamente la lista global
 * Sistemas de Gestión → Cumplimientos y su fecha "Válido hasta".
 */
async function getUpcomingManagementCompliances(
  companyId: number
): Promise<ExecutiveComplianceAlert[]> {
  const db = await getDb();
  if (!db) return [];

  const compliances = await db
    .select()
    .from(companyCompliances)
    .where(eq(companyCompliances.companyId, companyId));

  return (compliances as any[])
    .filter(compliance => {
      if (compliance.completed === "SI" || !compliance.validUntil) return false;
      return isWithinNextDays(new Date(compliance.validUntil), WINDOW_DAYS);
    })
    .map(compliance => {
      const dueDate = new Date(compliance.validUntil);
      return {
        requirement: compliance.requirement || "Cumplimiento sin descripción",
        obligationType: compliance.obligationType || "Cumplimiento",
        responsible: compliance.responsible || "Sin responsable asignado",
        dueDate,
        daysRemaining: daysUntil(dueDate),
      };
    })
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
}

function emailShell(title: string, subtitle: string, content: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:24px;background:#edf2f7;color:#1f2937;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:680px;margin:0 auto;overflow:hidden;background:#ffffff;border-radius:14px;box-shadow:0 12px 30px rgba(0,37,77,.12);">
    <div style="padding:30px 34px 26px;color:#ffffff;background:linear-gradient(130deg,#00254D,#1E5A45);">
      <div style="margin-bottom:12px;color:#8ed15b;font-size:12px;font-weight:700;letter-spacing:1.1px;">ISGE 360 · LA ESTRATEGIA HECHA GESTIÓN.</div>
      <h1 style="margin:0;font-size:25px;line-height:1.2;">${title}</h1>
      <p style="margin:9px 0 0;color:rgba(255,255,255,.86);font-size:14px;">${subtitle}</p>
    </div>
    ${content}
    <div style="padding:18px 30px;color:#64748b;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:11px;text-align:center;line-height:1.5;">
      ISGE 360 · La estrategia hecha gestión.<br>Mensaje automático; no respondas a este correo.
    </div>
  </div>
</body>
</html>`;
}

function buildProcessAlertRows(activities: ProcessAlertActivity[]): string {
  return [...activities]
    .sort((a, b) => a.daysRemaining - b.daysRemaining)
    .map(activity => {
      const badge = getProcessBadge(activity.element);
      return `<tr>
        <td style="padding:13px 14px;${urgencyStyle(activity.daysRemaining)}border-bottom:1px solid #e2e8f0;">
          <span style="display:inline-block;margin-bottom:7px;padding:4px 8px;border-radius:99px;color:#ffffff;background:${badge.color};font-size:10px;font-weight:700;">${badge.label}</span>
          <div style="margin-bottom:4px;color:#172033;font-size:14px;font-weight:700;line-height:1.4;">${activity.action}</div>
          <div style="color:#64748b;font-size:12px;">Fecha límite: <strong>${formatDate(activity.dueDate)}</strong> &nbsp;|&nbsp; <strong style="color:${urgencyColor(activity.daysRemaining)};">${urgencyText(activity.daysRemaining)}</strong> &nbsp;|&nbsp; Avance: <strong>${activity.completionPercentage}%</strong></div>
        </td>
      </tr>`;
    })
    .join("");
}

function buildProcessAlertSection(
  title: string,
  description: string,
  activities: ProcessAlertActivity[],
  emptyMessage: string,
  accentColor: string
): string {
  const content = activities.length
    ? `<table style="width:100%;border-collapse:collapse;">${buildProcessAlertRows(activities)}</table>`
    : `<div style="padding:13px 14px;border:1px solid #e2e8f0;border-left:4px solid ${accentColor};border-radius:6px;color:#64748b;background:#f8fafc;font-size:13px;line-height:1.45;">${emptyMessage}</div>`;
  return `<section style="margin-top:25px;">
    <h2 style="margin:0 0 7px;color:#00254D;font-size:16px;">${title} · ${activities.length}</h2>
    <p style="margin:0 0 12px;color:#64748b;font-size:12px;line-height:1.5;">${description}</p>
    ${content}
  </section>`;
}

function buildProcessLeaderEmailHtml(
  recipientName: string,
  companyName: string,
  processName: string,
  sections: ProcessWeeklyAlertSections,
  dashboardUrl: string
): string {
  const totalPending = sections.weekly.length + sections.overdue.length;
  const body = `<div style="padding:30px 34px;">
    <p style="margin:0 0 20px;color:#374151;font-size:15px;line-height:1.65;">Hola, <strong>${recipientName}</strong>. Este resumen reúne las actividades abiertas de tu <strong>Cronograma Consolidado</strong>. Se presentan en dos secciones para que una misma actividad no se repita.</p>
    <table role="presentation" style="width:100%;margin:18px 0 24px;border-spacing:10px 0;">
      <tr>
        <td style="width:50%;padding:15px;border-radius:9px;background:#edf7f0;"><span style="display:block;margin-bottom:4px;color:#0e5134;font-size:26px;font-weight:800;">${sections.weekly.length}</span><span style="color:#475569;font-size:12px;">pendientes de esta semana</span></td>
        <td style="width:50%;padding:15px;border-radius:9px;background:#fef2f2;"><span style="display:block;margin-bottom:4px;color:#b91c1c;font-size:26px;font-weight:800;">${sections.overdue.length}</span><span style="color:#475569;font-size:12px;">pendientes acumulados vencidos</span></td>
      </tr>
    </table>
    <div style="padding:14px 16px;border:1px solid #bfdbfe;border-radius:9px;background:#eff6ff;color:#1e3a5f;font-size:13px;line-height:1.5;"><strong>Cómo se divide el resumen:</strong> la primera sección incluye lo que vence desde hoy hasta los próximos siete días. La segunda reúne solamente lo vencido hasta ayer. Por eso cada actividad aparece una sola vez.</div>
    ${buildProcessAlertSection(
      `Pendientes de esta semana · ${processName}`,
      "Actividades abiertas con fecha límite entre hoy y los próximos siete días.",
      sections.weekly,
      "No tienes actividades abiertas con vencimiento durante los próximos siete días.",
      "#16a34a"
    )}
    ${buildProcessAlertSection(
      "Pendientes acumulados hasta la fecha",
      "Actividades abiertas cuya fecha límite ya pasó. Requieren atención prioritaria.",
      sections.overdue,
      "No tienes pendientes vencidos acumulados.",
      "#dc2626"
    )}
    <a href="${dashboardUrl}" style="display:inline-block;margin-top:25px;padding:13px 20px;border-radius:8px;color:#ffffff;background:#00599D;font-size:13px;font-weight:700;text-decoration:none;">Abrir Cronograma Consolidado</a>
    <p style="margin:20px 0 0;color:#64748b;font-size:12px;line-height:1.55;">Recibirás este resumen únicamente cuando exista al menos un pendiente de la semana o un pendiente acumulado en tu proceso. Total incluido: ${totalPending}.</p>
  </div>`;
  return emailShell(
    "Agenda semanal del proceso",
    `${companyName} · ${processName}`,
    body
  );
}

function buildExecutiveComplianceEmailHtml(
  companyName: string,
  compliances: ExecutiveComplianceAlert[],
  dashboardUrl: string
): string {
  const rows = compliances
    .map(
      compliance => `<tr>
      <td style="padding:13px 14px;${urgencyStyle(compliance.daysRemaining)}border-bottom:1px solid #e2e8f0;">
        <span style="display:inline-block;margin-bottom:7px;padding:4px 8px;border-radius:99px;color:#0e7490;background:#cffafe;font-size:10px;font-weight:700;">${compliance.obligationType.toUpperCase()}</span>
        <div style="margin-bottom:4px;color:#172033;font-size:14px;font-weight:700;line-height:1.4;">${compliance.requirement}</div>
        <div style="color:#64748b;font-size:12px;">Responsable: <strong>${compliance.responsible}</strong><br>Válido hasta: <strong>${formatDate(compliance.dueDate)}</strong> &nbsp;|&nbsp; <strong style="color:#c2410c;">${urgencyText(compliance.daysRemaining)}</strong></div>
      </td>
    </tr>`
    )
    .join("");

  const body = `<div style="padding:30px 34px;">
    <p style="margin:0 0 20px;color:#374151;font-size:15px;line-height:1.65;">Hola, <strong>Gerente General</strong>. Se identificaron Cumplimientos de <strong>Sistemas de Gestión</strong> que vencen durante los próximos siete días. Esta alerta excluye tareas operativas, OTE y actividades del Cronograma Consolidado.</p>
    <div style="margin:18px 0 24px;padding:16px;border:1px solid #fed7aa;border-radius:9px;background:#fff7ed;color:#7c2d12;font-size:13px;line-height:1.45;"><strong style="display:block;margin-bottom:4px;color:#9a3412;">Atención requerida</strong>Revisa los requisitos próximos a caducar con el responsable correspondiente antes de su fecha de vigencia.</div>
    <h2 style="margin:6px 0 12px;color:#00254D;font-size:16px;">Cumplimientos próximos a caducar</h2>
    <table style="width:100%;border-collapse:collapse;">${rows}</table>
    <a href="${dashboardUrl}" style="display:inline-block;margin-top:25px;padding:13px 20px;border-radius:8px;color:#ffffff;background:#00599D;font-size:13px;font-weight:700;text-decoration:none;">Abrir Cumplimientos</a>
    <p style="margin:20px 0 0;color:#64748b;font-size:12px;line-height:1.55;">Este correo se envía una vez por semana únicamente cuando existen Cumplimientos vigentes próximos a caducar.</p>
  </div>`;
  return emailShell("Alerta ejecutiva de Cumplimientos", companyName, body);
}

async function runWeeklyAlerts(): Promise<void> {
  console.log("[ScheduleAlerts] Iniciando revisión semanal de alertas...");
  const db = await getDb();
  if (!db) {
    console.warn("[ScheduleAlerts] Base de datos no disponible, omitiendo.");
    return;
  }

  const frontendUrl = (
    process.env.FRONTEND_URL ||
    process.env.VITE_FRONTEND_URL ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
  const allCompanies = await db.select().from(companies);

  for (const company of allCompanies as any[]) {
    try {
      const companyInfoRows = await db
        .select()
        .from(companyInfo)
        .where(eq(companyInfo.companyId, company.id));
      const adminEmail = companyInfoRows[0]
        ? (companyInfoRows[0] as any).adminAlertEmail || ""
        : "";

      // 1. Jefes de Proceso: actividades que ya forman parte de su Cronograma Consolidado.
      const companyProcesses = await db
        .select()
        .from(processes)
        .where(eq(processes.companyId, company.id));
      for (const process of companyProcesses as any[]) {
        const sections = await getPendingConsolidatedActivitiesForProcess(
          process.id,
          process.name
        );
        if (!hasProcessWeeklyAlertActivities(sections)) continue;

        const characterizationRows = await db
          .select()
          .from(processCharacterizations)
          .where(eq(processCharacterizations.processId, process.id));
        const characterization: any = characterizationRows[0];
        const responsibleEmail = characterization?.responsibleEmail || "";
        const responsibleName =
          characterization?.responsible || "Responsable del Proceso";
        if (!responsibleEmail || !responsibleEmail.includes("@")) continue;

        const htmlContent = buildProcessLeaderEmailHtml(
          responsibleName,
          company.name,
          process.name,
          sections,
          `${frontendUrl}/process-characterization?companyId=${company.id}&processId=${process.id}`
        );
        sendEmail({
          to: responsibleEmail,
          subject: `Agenda semanal del proceso — ${process.name}`,
          htmlContent,
        });
        console.log(
          `[ScheduleAlerts] Agenda semanal encolada para ${process.name}: ${responsibleEmail} (${sections.weekly.length} semanal(es), ${sections.overdue.length} vencida(s))`
        );
      }

      // 2. Gerente General: exclusivamente Cumplimientos de Sistemas de Gestión.
      const managementCompliances = await getUpcomingManagementCompliances(
        company.id
      );
      if (
        adminEmail &&
        adminEmail.includes("@") &&
        managementCompliances.length > 0
      ) {
        const htmlContent = buildExecutiveComplianceEmailHtml(
          company.name,
          managementCompliances,
          `${frontendUrl}/compliances?companyId=${company.id}`
        );
        sendEmail({
          to: adminEmail,
          subject: `Alerta de Cumplimientos — ${company.name}`,
          htmlContent,
        });
        console.log(
          `[ScheduleAlerts] Alerta ejecutiva de Cumplimientos enviada: ${adminEmail}`
        );
      }
    } catch (error) {
      console.error(
        `[ScheduleAlerts] Error procesando empresa ${company.id}:`,
        error
      );
    }
  }

  console.log("[ScheduleAlerts] Revisión semanal completada.");
}

/** Ejecuta las alertas todos los lunes a las 07:00, hora de Ecuador. */
export function registerScheduleAlertsCron(): void {
  cron.schedule(
    "0 7 * * 1",
    () => {
      runWeeklyAlerts().catch(error => {
        console.error("[ScheduleAlerts] Error en cron job:", error);
      });
    },
    { timezone: "America/Guayaquil" }
  );
  console.log("[ScheduleAlerts] Cron job registrado: lunes 7:00 AM (Ecuador).");
}

export {
  buildExecutiveComplianceEmailHtml,
  buildProcessLeaderEmailHtml,
  getPendingConsolidatedActivitiesForProcess,
  getUpcomingManagementCompliances,
  runWeeklyAlerts,
};
