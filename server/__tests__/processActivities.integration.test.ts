import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { companies, processCompliances, processes } from "../../drizzle/schema";
import { getDb } from "../db";
import { getConsolidatedScheduleActivities } from "../lib/consolidatedScheduleActivities";
import { consolidatedIndicatorsRouter } from "../routers/consolidatedIndicators";
import { processActivitiesRouter } from "../routers/processActivities";

const testName = `Prueba actividades ${Date.now()}`;
let db: NonNullable<Awaited<ReturnType<typeof getDb>>>;
let companyId = 0;
let processId = 0;
let foreignCompanyId = 0;
let foreignProcessId = 0;
let punctualId = 0;
let weeklyId = 0;
let monthlyId = 0;

function adminActivitiesCaller() {
  return processActivitiesRouter.createCaller({
    user: { role: "admin" },
    manager: null,
    processLeader: null,
    req: {} as never,
    res: {} as never,
  } as never);
}

function sourceLeaderActivitiesCaller() {
  return processActivitiesRouter.createCaller({
    user: null,
    manager: null,
    processLeader: {
      processLeaderId: 1,
      leaderName: "Jefe de actividades",
      leaderEmail: "actividades@example.com",
      processId,
      companyId,
      companyName: testName,
    },
    req: {} as never,
    res: {} as never,
  } as never);
}

function baseActivityInput() {
  return {
    processId,
    requirement: "Actividad temporal",
    scheduleType: "once" as const,
    dueDate: "2026-10-15",
    scheduleStartDate: "2026-10-15",
    scheduleEndDate: "",
    scheduleWeekday: null,
    scheduleDayOfMonth: null,
    trackingType: "puntual" as const,
    trackingStartValue: 0,
    trackingTargetValue: 100,
    trackingCurrentValue: 0,
    trackingUnit: "%",
    monthlyTrackingValues: Array(12).fill(0),
    monthlyChecklistValues: Array(12).fill(false),
  };
}

beforeAll(async () => {
  db = (await getDb()) as NonNullable<Awaited<ReturnType<typeof getDb>>>;
  if (!db) throw new Error("Base local no disponible para la prueba de Actividades.");

  const company = await db.insert(companies).values({
    name: testName,
    description: "Datos temporales autocontenidos para Actividades.",
    ownerAccountId: 1,
    status: "En Proceso",
  });
  companyId = Number(company[0].insertId);
  const process = await db.insert(processes).values({
    companyId,
    name: "Proceso de Actividades",
    processType: "misional",
  });
  processId = Number(process[0].insertId);

  const foreignCompany = await db.insert(companies).values({
    name: `${testName} externa`,
    ownerAccountId: 1,
    status: "En Proceso",
  });
  foreignCompanyId = Number(foreignCompany[0].insertId);
  const foreignProcess = await db.insert(processes).values({
    companyId: foreignCompanyId,
    name: "Proceso externo de Actividades",
    processType: "soporte",
  });
  foreignProcessId = Number(foreignProcess[0].insertId);
});

afterAll(async () => {
  if (!db) return;
  if (processId) await db.delete(processCompliances).where(eq(processCompliances.processId, processId));
  if (processId) await db.delete(processes).where(eq(processes.id, processId));
  if (companyId) await db.delete(companies).where(eq(companies.id, companyId));
  if (foreignProcessId) await db.delete(processes).where(eq(processes.id, foreignProcessId));
  if (foreignCompanyId) await db.delete(companies).where(eq(companies.id, foreignCompanyId));
});

describe("Actividades del proceso: integración local", () => {
  it("crea una actividad puntual con avance y la refleja en el Cronograma", async () => {
    const created = await adminActivitiesCaller().create({
      ...baseActivityInput(),
      requirement: "Verificar documentación temporal",
      description: "Actividad puntual de prueba",
      trackingCurrentValue: 50,
    });
    punctualId = created.id;
    expect(punctualId).toBeTypeOf("number");

    const activities = await adminActivitiesCaller().list({ processId });
    const punctual = activities.find(activity => activity.id === punctualId);
    expect(punctual?.progress).toBe(50);
    expect(punctual?.scheduleSummary).toContain("Puntual");

    const schedule = await getConsolidatedScheduleActivities(processId);
    const scheduled = schedule.find(item => item.id === `activity-${punctualId}-2026-10-15`);
    expect(scheduled?.badge).toBe("Actividades");
    expect(scheduled?.completed).toBe("NO");
    expect(scheduled?.completionPercentage).toBe(50);
  });

  it("crea ocurrencias semanales y permite marcar cada una como realizada", async () => {
    const created = await adminActivitiesCaller().create({
      ...baseActivityInput(),
      requirement: "Visita semanal a proveedores",
      scheduleType: "weekly",
      dueDate: "2026-10-01",
      scheduleStartDate: "2026-10-01",
      scheduleEndDate: "2026-10-22",
      scheduleWeekday: 4,
    });
    weeklyId = created.id;

    let activities = await adminActivitiesCaller().list({ processId });
    let weekly = activities.find(activity => activity.id === weeklyId);
    expect(weekly?.occurrences.map(item => item.date)).toEqual([
      "2026-10-01",
      "2026-10-08",
      "2026-10-15",
      "2026-10-22",
    ]);

    await adminActivitiesCaller().setOccurrenceCompleted({
      id: weeklyId,
      occurrenceDate: "2026-10-08",
      completed: true,
    });
    activities = await adminActivitiesCaller().list({ processId });
    weekly = activities.find(activity => activity.id === weeklyId);
    expect(weekly?.occurrenceCompleted).toBe(1);

    const schedule = await getConsolidatedScheduleActivities(processId);
    expect(schedule.find(item => item.id === `activity-${weeklyId}-2026-10-08`)?.completed).toBe("SI");
    expect(schedule.find(item => item.id === `activity-${weeklyId}-2026-10-15`)?.completed).toBe("NO");
  });

  it("calcula el avance mensual y lo entrega a Indicadores", async () => {
    const checklist = Array(12).fill(false);
    checklist[0] = true;
    checklist[1] = true;
    checklist[2] = true;
    checklist[3] = true;
    checklist[4] = true;
    checklist[5] = true;
    const created = await adminActivitiesCaller().create({
      ...baseActivityInput(),
      requirement: "Control mensual temporal",
      scheduleType: "monthly",
      dueDate: "2026-10-01",
      scheduleStartDate: "2026-10-01",
      scheduleEndDate: "2026-12-31",
      scheduleDayOfMonth: 15,
      trackingType: "mensual_checklist",
      monthlyChecklistValues: checklist,
    });
    monthlyId = created.id;

    const activities = await adminActivitiesCaller().list({ processId });
    const monthly = activities.find(activity => activity.id === monthlyId);
    expect(monthly?.progress).toBe(50);
    expect(monthly?.occurrences).toHaveLength(3);

    const indicators = await consolidatedIndicatorsRouter.createCaller({
      user: { role: "admin" }, manager: null, processLeader: null, req: {} as never, res: {} as never,
    } as never).getConsolidatedIndicators({ processId });
    const activitiesIndicator = indicators.find(item => item.id === "promedio_cumplimiento");
    expect(activitiesIndicator?.name).toBe("Actividades");
    expect(activitiesIndicator?.value).toBe(33);
  });

  it("permite a un Jefe gestionar sólo las actividades de su proceso", async () => {
    const leader = sourceLeaderActivitiesCaller();
    const activities = await leader.list({ processId });
    expect(activities).toHaveLength(3);
    await expect(leader.list({ processId: foreignProcessId })).rejects.toThrow("No tiene acceso");
  });
});
