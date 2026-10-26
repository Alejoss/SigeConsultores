import { describe, expect, it } from "vitest";
import type { ConsolidatedScheduleActivity } from "../lib/consolidatedScheduleActivities";
import {
  buildProcessLeaderEmailHtml,
  hasProcessWeeklyAlertActivities,
  splitProcessWeeklyAlertActivities,
} from "../lib/scheduleAlerts";

const referenceDate = new Date("2026-10-26T12:00:00");

function activity(
  id: string,
  dueDate: string,
  overrides: Partial<ConsolidatedScheduleActivity> = {}
): ConsolidatedScheduleActivity {
  return {
    id,
    type: "objective",
    element: "OTE",
    action: `Actividad ${id}`,
    dueDate: new Date(`${dueDate}T12:00:00`),
    completed: "NO",
    completionField: "0%",
    badge: "OTE",
    badgeColor: "bg-yellow-100",
    daysRemaining: 0,
    completionPercentage: 0,
    ...overrides,
  };
}

describe("alerta semanal de pendientes del proceso", () => {
  it("separa pendientes de esta semana y vencidos acumulados sin repetirlos", () => {
    const sections = splitProcessWeeklyAlertActivities(
      [
        activity("hoy", "2026-10-26"),
        activity("proximo", "2026-10-30"),
        activity("limite-semana", "2026-11-02"),
        activity("vencido", "2026-10-25"),
        activity("futuro", "2026-11-03"),
        activity("completado", "2026-10-24", { completed: "SI" }),
      ],
      "Gestión de Calidad",
      referenceDate
    );

    expect(sections.weekly.map(item => item.id)).toEqual([
      "hoy",
      "proximo",
      "limite-semana",
    ]);
    expect(sections.overdue.map(item => item.id)).toEqual(["vencido"]);
    expect(
      [...sections.weekly, ...sections.overdue].map(item => item.id)
    ).toHaveLength(
      new Set([...sections.weekly, ...sections.overdue].map(item => item.id))
        .size
    );
    expect(
      [...sections.weekly, ...sections.overdue].map(item => item.id)
    ).not.toContain("futuro");
    expect(
      [...sections.weekly, ...sections.overdue].map(item => item.id)
    ).not.toContain("completado");
  });

  it("mantiene la alerta activa cuando solo existen pendientes vencidos", () => {
    const sections = splitProcessWeeklyAlertActivities(
      [activity("atrasada", "2026-10-20")],
      "Comercial",
      referenceDate
    );

    expect(sections.weekly).toHaveLength(0);
    expect(sections.overdue).toHaveLength(1);
    expect(hasProcessWeeklyAlertActivities(sections)).toBe(true);
  });

  it("no activa el correo si no hay pendientes semanales ni acumulados", () => {
    const sections = splitProcessWeeklyAlertActivities(
      [
        activity("futuro", "2026-11-03"),
        activity("completado", "2026-10-20", { completed: "SI" }),
      ],
      "Comercial",
      referenceDate
    );

    expect(sections).toEqual({ weekly: [], overdue: [] });
    expect(hasProcessWeeklyAlertActivities(sections)).toBe(false);
  });

  it("muestra los vencidos en rojo con un texto de atraso legible", () => {
    const sections = splitProcessWeeklyAlertActivities(
      [
        activity("atrasada", "2026-10-24", {
          action: "Cerrar hallazgo crítico",
        }),
      ],
      "Gestión de Calidad",
      referenceDate
    );

    const html = buildProcessLeaderEmailHtml(
      "Ana",
      "Empresa de prueba",
      "Gestión de Calidad",
      sections,
      "https://isge360.com/process-characterization?companyId=1&processId=2"
    );

    expect(html).toContain(
      "Pendientes de esta semana · Gestión de Calidad · 0"
    );
    expect(html).toContain("Pendientes acumulados hasta la fecha · 1");
    expect(html).toContain("Vencida hace 2 días");
    expect(html).toContain("background:#fef2f2;border-left:4px solid #dc2626;");
    expect(html).not.toContain("Faltan -2 días");
  });

  it("explica las dos secciones y lista cada actividad una sola vez en el correo", () => {
    const sections = splitProcessWeeklyAlertActivities(
      [
        activity("semana", "2026-10-28", {
          action: "Preparar informe semanal",
        }),
        activity("acumulada", "2026-10-23", {
          action: "Corregir acción vencida",
        }),
      ],
      "Comercial",
      referenceDate
    );

    const html = buildProcessLeaderEmailHtml(
      "Pedro",
      "Empresa de prueba",
      "Comercial",
      sections,
      "https://isge360.com/process-characterization?companyId=1&processId=3"
    );

    expect(html).toContain("Cómo se divide el resumen:");
    expect(html).toContain("Por eso cada actividad aparece una sola vez.");
    expect(html).toContain("Pendientes de esta semana · Comercial · 1");
    expect(html).toContain("Pendientes acumulados hasta la fecha · 1");
    expect(html.match(/Preparar informe semanal/g)).toHaveLength(1);
    expect(html.match(/Corregir acción vencida/g)).toHaveLength(1);
  });
});
